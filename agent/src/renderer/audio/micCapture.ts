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

  async start(onPermissionDenied: () => void): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        onPermissionDenied();
        return;
      }
      throw err;
    }

    this.sendChain = Promise.resolve();
    const recorder = new MediaRecorder(this.stream, { mimeType: "audio/webm;codecs=opus" });
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
