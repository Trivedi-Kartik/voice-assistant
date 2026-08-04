import Groq from "groq-sdk";

// Groq's own "preview" labeling for vision models means this may get
// renamed/replaced later — a single named constant makes that a one-line
// fix, same pattern as MODEL in llm.ts. See docs/ARCHITECTURE.md
// "take_screenshot_and_describe".
const VISION_MODEL = "llama-3.2-11b-vision-preview";

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
