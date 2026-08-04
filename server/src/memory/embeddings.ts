import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

// Local embeddings — no API cost, no external network call per embed, runs
// entirely inside this process. Xenova/all-MiniLM-L6-v2 produces 384-dim
// vectors, matching the `vector(384)` column on memory_facts.embedding (see
// prisma/schema.prisma). Model weights download once on first use and are
// cached on disk (see env.cacheDir default) — the first embed after a fresh
// deploy is slower than subsequent ones.
const MODEL = "Xenova/all-MiniLM-L6-v2";

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as unknown as ArrayLike<number>);
}
