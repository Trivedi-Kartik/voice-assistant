import { db } from "../db.js";
import { embedText } from "./embeddings.js";

// memory_facts.embedding is Prisma's `Unsupported("vector(384)")` type — Prisma
// Client can't generate typed accessors for pgvector's `vector` type, so every
// read/write to that column goes through raw SQL here rather than the normal
// db.memoryFact.* API. See prisma/schema.prisma for why.

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

// Only ever called from the server-handled `remember_preference` tool (see
// tools/schemas.ts, ws/session.ts) — never by passively scanning conversations.
// That keeps what gets remembered predictable and attributable to a specific
// moment the assistant decided to remember something, not a black-box heuristic.
export async function saveMemoryFact(userId: string, factText: string, sourceMessageId?: string): Promise<void> {
  const embedding = await embedText(factText);
  const vectorLiteral = toVectorLiteral(embedding);
  await db.$executeRaw`
    INSERT INTO memory_facts (id, user_id, fact_text, embedding, source_message_id, created_at)
    VALUES (gen_random_uuid(), ${userId}, ${factText}, ${vectorLiteral}::vector, ${sourceMessageId ?? null}, now())
  `;
}

export interface RelevantMemory {
  factText: string;
  distance: number; // cosine distance (pgvector `<=>`), lower = more relevant
}

const RELEVANCE_THRESHOLD = 0.8; // empirically "clearly related", not just any match

// Called once per turn with the user's transcript as the query — results get
// injected into the system prompt (see ws/session.ts) so the model has relevant
// context without needing to explicitly call a "recall" tool itself.
export async function findRelevantMemories(userId: string, queryText: string, limit = 5): Promise<RelevantMemory[]> {
  const embedding = await embedText(queryText);
  const vectorLiteral = toVectorLiteral(embedding);
  const rows = await db.$queryRaw<Array<{ fact_text: string; distance: number }>>`
    SELECT fact_text, embedding <=> ${vectorLiteral}::vector AS distance
    FROM memory_facts
    WHERE user_id = ${userId}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ factText: r.fact_text, distance: r.distance })).filter((m) => m.distance < RELEVANCE_THRESHOLD);
}
