import type { ChatMessage } from "../llm.js";

// Keep the system prompt plus the last `maxTurns` user turns. The whole history is sent to the
// LLM on every step and re-serialized into Redis every turn, so unbounded growth means ever-
// slower, ever-costlier turns and eventually a prompt over the model's context/TPM limit.
// Cutting only at a "user" message guarantees an assistant message with tool_calls is never
// separated from its tool results (every turn begins with the user's message).
export const MAX_HISTORY_TURNS = 20;

export function trimHistory(history: ChatMessage[], maxTurns: number = MAX_HISTORY_TURNS): ChatMessage[] {
  const userIdx: number[] = [];
  history.forEach((m, i) => {
    if (i > 0 && m.role === "user") userIdx.push(i);
  });
  if (userIdx.length <= maxTurns) return history;
  const cut = userIdx[userIdx.length - maxTurns];
  return [history[0], ...history.slice(cut)];
}
