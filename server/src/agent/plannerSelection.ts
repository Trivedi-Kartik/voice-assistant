import { db } from "../db.js";
import { decryptApiKey } from "../crypto.js";
import { resolveGroqKey } from "../groqKey.js";
import { GroqPlanner, type Planner } from "./planner.js";
import { buildProviderPlanner, PROVIDERS, type ProviderId } from "./providers.js";

export interface SelectedPlanner {
  planner: Planner;
  // True when the user pays for the model themselves (their own Groq key or their own provider) — exempt from the
  // shared-key daily cap.
  usesOwnKey: boolean;
  label: string;
}

// Which model drives the PC agent for this user. Groq is the default; another provider is used ONLY if the user chose
// one in Settings. There is deliberately no automatic fallback between them (a failure is reported to the user).
export async function selectPlanner(userId: string): Promise<SelectedPlanner> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plannerProvider: true, plannerModel: true, plannerApiKeyEnc: true },
  });
  if (user.plannerProvider && user.plannerModel && user.plannerApiKeyEnc && user.plannerProvider in PROVIDERS) {
    const provider = user.plannerProvider as ProviderId;
    return {
      planner: buildProviderPlanner(provider, user.plannerModel, decryptApiKey(Buffer.from(user.plannerApiKeyEnc))),
      usesOwnKey: true,
      label: `${PROVIDERS[provider].label} ${user.plannerModel}`,
    };
  }
  const { apiKey, isByok } = await resolveGroqKey(userId);
  return { planner: new GroqPlanner(apiKey), usesOwnKey: isByok, label: "Groq (default)" };
}
