import Groq from "groq-sdk";

// Shared error classification used by both stt.ts and llm.ts (both call Groq),
// so retry policy and user-facing messaging stay consistent across the two.

export function isGroqRateLimit(err: unknown): boolean {
  return err instanceof Groq.RateLimitError;
}

// Confirmed via real, repeated testing (not hypothetical): Llama 3.3 on Groq
// occasionally generates a malformed tool call — literally
// `<function=open_app{...}</function>` pseudo-XML instead of a proper
// structured call — and Groq's API rejects the whole completion with a 400
// `tool_use_failed` before it ever reaches us. Generation-quality noise, not a
// deterministic bug: identical requests succeed on retry most of the time.
export function isRetryableToolUseFailure(err: unknown): boolean {
  if (!(err instanceof Groq.APIError) || err.status !== 400) return false;
  const body = err.error as { error?: { code?: string } } | undefined;
  return body?.error?.code === "tool_use_failed";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
