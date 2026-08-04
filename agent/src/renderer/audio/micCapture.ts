// Renderer owns mic capture because getUserMedia/MediaRecorder are browser APIs
// that don't exist in the main process. Streams 250ms opus chunks over IPC as
// they're captured (lower tail latency than record-then-send) — see
// docs/ARCHITECTURE.md "Audio pipeline".
export class MicCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;

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

    const recorder = new MediaRecorder(this.stream, { mimeType: "audio/webm;codecs=opus" });
    this.mediaRecorder = recorder;

    recorder.ondataavailable = async (event) => {
      if (event.data.size === 0) return;
      window.jarvis.audio.sendChunk(await blobToBase64(event.data));
    };

    recorder.start(250);
  }

  stop(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") return;
    // onstop fires strictly after the final ondataavailable, so audio_end is
    // guaranteed to reach the server after every chunk has been sent.
    this.mediaRecorder.onstop = () => {
      window.jarvis.audio.sendEnd();
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
