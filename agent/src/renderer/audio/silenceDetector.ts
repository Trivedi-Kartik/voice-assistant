// Voice-activity/silence detection for continuous-conversation mode — a
// separate concern from MicCapture (which owns MediaRecorder/IPC streaming):
// keeping them apart guarantees MicCapture behaves completely unchanged when
// continuous mode is off, and lets this class be reasoned about in
// isolation. Built on the SAME MediaStream MicCapture already holds (via
// its getStream() getter) — never calls getUserMedia itself, so there's no
// second permission prompt or second capture stream.
//
// Time-domain RMS, not frequency-domain/FFT — cheaper, and sufficient for a
// simple voice-vs-silence signal (no need to distinguish pitch/tone).
//
// All three constants below are starting points, not tuned against a real
// mic/room — see docs/ARCHITECTURE.md and the continuous-conversation
// plan's verification notes. Expect to retune after real usage.
const POLL_INTERVAL_MS = 100;
const RMS_SPEECH_THRESHOLD = 0.02;
// The silence timer isn't allowed to fire until at least this much
// above-threshold audio has been seen — otherwise a fresh recording (before
// the user has said anything at all) would immediately auto-stop itself.
const MIN_SPEECH_MS_BEFORE_ARMED = 400;
// Natural pause length before treating the utterance as finished — long
// enough to survive a mid-sentence breathing pause, short enough to not
// feel laggy.
const SILENCE_STOP_MS = 1500;

export class SilenceDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private speechMsSeen = 0;
  private silenceMsSeen = 0;

  start(stream: MediaStream, onSilenceDetected: () => void): void {
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
    // Backed by an explicit ArrayBuffer, not the plainer Uint8Array(number)
    // form — newer @types/web has getByteTimeDomainData requiring
    // Uint8Array<ArrayBuffer> specifically, which plain construction doesn't
    // always infer.
    this.dataArray = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    this.speechMsSeen = 0;
    this.silenceMsSeen = 0;

    this.pollHandle = setInterval(() => {
      if (!this.analyser || !this.dataArray) return;
      this.analyser.getByteTimeDomainData(this.dataArray);

      let sumSquares = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        // Samples are unsigned bytes centered at 128 — normalize to [-1, 1].
        const normalized = (this.dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / this.dataArray.length);

      if (rms >= RMS_SPEECH_THRESHOLD) {
        this.speechMsSeen += POLL_INTERVAL_MS;
        this.silenceMsSeen = 0;
        return;
      }

      if (this.speechMsSeen < MIN_SPEECH_MS_BEFORE_ARMED) return; // not armed yet — nothing said

      this.silenceMsSeen += POLL_INTERVAL_MS;
      if (this.silenceMsSeen >= SILENCE_STOP_MS) {
        // Real bug caught before it shipped: without stopping itself here
        // first, this would keep firing onSilenceDetected() every poll tick
        // (100ms) until something external calls stop() — and that's async
        // (MicCapture.stop() waits for its chunk-send chain to drain before
        // finishing), leaving a window for multiple redundant fires. Stop
        // immediately, synchronously, before invoking the callback; the
        // caller's own stop() (paired 1:1 with MicCapture.stop()) becomes a
        // harmless no-op on top of this.
        this.stop();
        onSilenceDetected();
      }
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    this.analyser = null;
    this.dataArray = null;
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
