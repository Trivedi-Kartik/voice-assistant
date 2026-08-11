import Groq from "groq-sdk";

// Confirmed via real testing: the original choice here (llama-3.2-11b-vision-preview)
// was already decommissioned by Groq by the time this shipped ("model_decommissioned").
// Groq's vision-model lineup has genuinely changed twice within this project's
// lifetime — a single named constant makes the next swap a one-line fix.
// Current per Groq's vision docs (console.groq.com/docs/vision): production status.
const VISION_MODEL = "qwen/qwen3.6-27b";

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
