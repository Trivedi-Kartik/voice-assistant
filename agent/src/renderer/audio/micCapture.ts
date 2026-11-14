// Renderer owns mic capture because getUserMedia/MediaRecorder are browser APIs
// that don't exist in the main process. Streams 250ms opus chunks over IPC as
// they're captured (lower tail latency than record-then-send) — see
// docs/ARCHITECTURE.md "Audio pipeline".
export class MicCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  // Chains each chunk's async base64-encode-then-send onto the previous one. This
  // is load-bearing, not cosmetic: ondataavailable's handler being `async` does
  // NOT make the browser wait for it before firing later events — `onstop` fires
  // as soon as the event is dispatched, regardless of whether that chunk's
  // encoding/IPC-send has actually finished. Without this chain, audio_end could
  // reach the server before (or interleaved with) earlier chunks, corrupting the
  // WebM file the server hands to Whisper. This was a real, confirmed bug:
  // intermittent Groq "could not process file" errors, worse on short recordings.
  private sendChain: Promise<void> = Promise.resolve();
  // Bumped by every start() and every stop(). start() awaits getUserMedia (seconds, on the first
  // permission prompt); if the user pressed Stop in that window, stop() was a no-op (no recorder
  // yet) and start() then resumed and began recording anyway — mic hot and streaming with the UI
  // showing idle. A start() whose generation is stale must release the stream instead.
  private generation = 0;

  // Preferred first — same container/codec the server always expected
  // ("utterance.webm" is hardcoded server-side in stt.ts). The plain
  // "audio/webm" fallback still gets accepted by Whisper (it sniffs actual
  // content, not the filename extension), so a build that can't do
  // opus-in-webm specifically still records something valid rather than
  // silently using a browser-default encoding the server never expects.
  //
  // CONFIRMED via live A/B test on real hardware (2026-09-27): swapping this
  // order to try plain "audio/webm" first made every single recording fail
  // Groq's "could not process file" check, where opus-first had only failed
  // occasionally. Opus is empirically the more reliable path on at least
  // this machine — do not swap this order again without a new, stronger
  // signal. The occasional opus-path failure is a separate, still-open bug
  // (see MicCapture's singleton-reuse-across-turns note below), not fixed by
  // codec choice.
  private static readonly MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm"];

  async start(onPermissionDenied: () => void): Promise<void> {
    const generation = ++this.generation;
    // Never leak a previous stream if one is somehow still held.
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        onPermissionDenied();
        return;
      }
      throw err;
    }

    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop()); // stopped while waiting on the mic — release it
      return;
    }
    this.stream = stream;

    // Real gap this was missing entirely: the old code hardcoded one exact
    // mimeType string with no feature check and no try/catch around
    // `new MediaRecorder(...)` — on a browser build where that string isn't
    // actually supported, this constructor throws, and nothing here caught
    // it, so a "listening" state could be shown with no recorder ever
    // created.
    const releaseStream = () => {
      stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    };
    const mimeType = MicCapture.MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) {
      releaseStream(); // the acquired mic was never released on this path
      throw new Error("No supported audio recording format found on this device.");
    }

    this.sendChain = Promise.resolve();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch (err) {
      releaseStream();
      throw err;
    }
    this.mediaRecorder = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      this.sendChain = this.sendChain
        .then(() => blobToBase64(event.data))
        .then((base64) => window.jarvis.audio.sendChunk(base64));
    };

    recorder.start(250);
  }

  // For SilenceDetector (see audio/silenceDetector.ts) to build its own
  // AnalyserNode on the SAME stream — never a second getUserMedia call.
  getStream(): MediaStream | null {
    return this.stream;
  }

  stop(): void {
    this.generation++; // cancels a start() that is still waiting on getUserMedia
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") return;
    this.mediaRecorder.onstop = () => {
      // Wait for every queued chunk to actually finish sending, IN ORDER, before
      // telling the server the utterance is complete.
      this.sendChain.then(() => window.jarvis.audio.sendEnd());
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
    };
    this.mediaRecorder.stop();
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function isMicPermissionGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state === "granted";
  } catch {
    return true; // permissions API unsupported — don't block on an unknown
  }
}
