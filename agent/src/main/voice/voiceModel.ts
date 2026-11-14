import { app } from "electron";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Natural local voice: Kokoro-82M v1.0 (Apache-2.0 weights), full-precision build from sherpa-onnx.
// Downloaded once, automatically, into the app's data folder on first launch — no account, key or
// configuration. Until it's ready (or if it ever fails) the app keeps using the system voice.
//
// Why this exact build (measured on an Intel i3-1115G4, 2 cores, 2026-11-14):
//   - v1.0 multi-lang has natural voices for en, hi, es, fr, it, pt (no de/th) and pronounces ANY word
//     via its bundled espeak-ng data with sherpa-onnx-node 1.13.x (pinned): sherpa 2.x dropped espeak and
//     silently SKIPS words missing from its lexicon ("opened", "Karvix" vanished in testing).
//   - full precision (model.onnx, 350 MB) ran ~1.6x realtime vs ~0.8x for the int8 build on this CPU —
//     int8 was too slow to stream sentences without gaps.
export const KOKORO = {
  id: "kokoro-multi-lang-v1_0",
  url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2",
  // Pinned from a verified download: a truncated or tampered file is rejected and re-fetched.
  bytes: 349_886_476,
  sha256: "60703707bc05ccd48d60e1eb723f38b07d6e474795a0b6a588d7220400e0f7a4",
};

export interface ModelPaths {
  model: string;
  voices: string;
  tokens: string;
  dataDir: string;
  lexicon: string;
  dictDir: string;
}

function voicesRoot(): string {
  return path.join(app.getPath("userData"), "voices");
}

export function modelPaths(): ModelPaths {
  const dir = path.join(voicesRoot(), KOKORO.id);
  return {
    model: path.join(dir, "model.onnx"),
    voices: path.join(dir, "voices.bin"),
    tokens: path.join(dir, "tokens.txt"),
    dataDir: path.join(dir, "espeak-ng-data"),
    // Comma-separated, as sherpa expects; the zh lexicon is required by the multi-lang model even if unused.
    lexicon: `${path.join(dir, "lexicon-us-en.txt")},${path.join(dir, "lexicon-zh.txt")}`,
    dictDir: path.join(dir, "dict"),
  };
}

function markerPath(): string {
  return path.join(voicesRoot(), KOKORO.id, ".complete");
}

export function isModelInstalled(): boolean {
  const p = modelPaths();
  return fs.existsSync(markerPath()) && [p.model, p.voices, p.tokens, p.dataDir, p.dictDir].every((f) => fs.existsSync(f));
}

// Resumable download: slow/flaky connections are common (a 350 MB file can take a while), so each attempt
// continues from the bytes already on disk instead of starting over.
//
// Uses node:https rather than fetch so the address-family race can be tuned: on some networks (seen on
// the developer's own, via NAT64) IPv6 takes a few hundred ms to connect but is ~25x faster than IPv4.
// The default happy-eyeballs window (~250 ms) falls back to slow IPv4; a longer window keeps IPv6.
function getFollowingRedirects(url: string, headers: Record<string, string>, redirects = 0): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    // autoSelectFamily* are supported by Node 20's net.connect (Electron 32) but missing from @types/node 20's RequestOptions.
    const options = { headers, autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 2500 } as https.RequestOptions;
    const req = https.get(url, options, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location && redirects < 10) {
        res.resume();
        resolve(getFollowingRedirects(new URL(res.headers.location, url).toString(), headers, redirects + 1));
        return;
      }
      resolve(res);
    });
    req.setTimeout(30_000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function downloadResumable(url: string, dest: string): Promise<void> {
  const MAX_ATTEMPTS = 40;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const have = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    try {
      const res = await getFollowingRedirects(url, have > 0 ? { Range: `bytes=${have}-` } : {});
      const status = res.statusCode ?? 0;
      if (status === 416) {
        res.resume();
        return; // already complete
      }
      if (status !== 200 && status !== 206) {
        res.resume();
        throw new Error(`http_${status}`);
      }
      const append = status === 206;
      const expectedTotal = append
        ? Number(String(res.headers["content-range"] ?? "").split("/")[1] ?? 0)
        : Number(res.headers["content-length"] ?? 0);
      await pipeline(res, fs.createWriteStream(dest, { flags: append ? "a" : "w" }));
      if (!expectedTotal || fs.statSync(dest).size >= expectedTotal) return;
    } catch (err) {
      console.warn(`[voice] download attempt ${attempt} interrupted:`, (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, Math.min(30_000, 2000 * attempt)));
  }
  throw new Error("voice_download_failed");
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    fs.createReadStream(file)
      .on("data", (d) => h.update(d))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
}

let inFlight: Promise<void> | null = null;

// Idempotent and single-flight; safe to call on every launch.
export function ensureModel(): Promise<void> {
  if (isModelInstalled()) return Promise.resolve();
  inFlight ??= (async () => {
    const root = voicesRoot();
    fs.mkdirSync(root, { recursive: true });
    const archive = path.join(root, `${KOKORO.id}.tar.bz2.part`);
    await downloadResumable(KOKORO.url, archive);
    if (KOKORO.bytes && fs.statSync(archive).size !== KOKORO.bytes) {
      fs.rmSync(archive, { force: true }); // corrupt/truncated — start clean next launch
      throw new Error("voice_download_size_mismatch");
    }
    if (KOKORO.sha256 && (await sha256File(archive)) !== KOKORO.sha256) {
      fs.rmSync(archive, { force: true });
      throw new Error("voice_download_hash_mismatch");
    }
    // `tar` ships with Linux and with Windows 10+ (bsdtar, which reads .bz2). Fixed argv, no shell.
    await execFileAsync("tar", ["-xjf", archive, "-C", root], { timeout: 5 * 60_000 });
    fs.writeFileSync(markerPath(), new Date().toISOString());
    fs.rmSync(archive, { force: true });
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
