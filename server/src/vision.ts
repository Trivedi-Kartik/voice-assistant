import Groq from "groq-sdk";

// Third swap of this constant, not the second — Groq's vision-model lineup
// keeps moving. This time "qwen/qwen3.6-27b" (404 model_not_found) is still
// listed in Groq's own docs but isn't actually enabled on this account;
// confirmed via a real request against api.groq.com/openai/v1/models with
// this project's own key that only "qwen/qwen3.8-27b" is present, then a
// real multimodal completion call against it before switching (it correctly
// identified a solid-red test image). Docs and actual account access have
// now drifted twice — verify against the live API, not the docs, next time.
const VISION_MODEL = "qwen/qwen3.8-27b";

const DESCRIBE_PROMPT =
  "Describe what's visible in this screenshot in a few sentences, in plain conversational language — this " +
  "will be spoken aloud to the user, so don't mention pixels, coordinates, or that it's a screenshot.";

// Deliberately no retry loop here (unlike llm.ts's runLlmStep) — this is a
// single best-effort description call, not the core tool-calling loop, and
// the caller (vision/routes.ts) already has its own error handling.
export async function describeImage(apiKey: string, imageDataUri: string): Promise<string> {
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: DESCRIBE_PROMPT },
          { type: "image_url", image_url: { url: imageDataUri } },
        ],
      },
    ],
  });
  return completion.choices[0]?.message?.content ?? "I couldn't make out anything useful in that screenshot.";
}
