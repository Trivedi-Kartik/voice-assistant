import type { FeatureExtractionPipeline } from "@xenova/transformers";

// Local embeddings — no API cost, no external network call per embed, runs
// entirely inside this process. Xenova/all-MiniLM-L6-v2 produces 384-dim
// vectors, matching the `vector(384)` column on memory_facts.embedding (see
// prisma/schema.prisma). Model weights download once on first use and are
// cached on disk (see env.cacheDir default) — the first embed after a fresh
// deploy is slower than subsequent ones.
const MODEL = "Xenova/all-MiniLM-L6-v2";

// Deliberately a DYNAMIC import, not a static one at the top of this file.
// @xenova/transformers unconditionally imports `onnxruntime-node` (a native
// N-API addon) as soon as it's loaded under Node — with no config to avoid it.
// That native binary has failed to load on at least one real Windows machine
// (missing/mismatched VC++ runtime), and because a static top-level import
// forces Node to resolve the whole chain immediately, that single native-module
// failure was crashing the ENTIRE server on startup — not just memory features.
// A dynamic import confines the blast radius to whatever actually calls
// embedText() (already wrapped in try/catch at every call site in
// memoryStore.ts and ws/session.ts), so the core voice loop keeps working even
// on a machine where this native dependency can't load at all.
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = import("@xenova/transformers").then(
      (mod) => mod.pipeline("feature-extraction", MODEL) as Promise<FeatureExtractionPipeline>
    );
  }
  return extractorPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as unknown as ArrayLike<number>);
}
