import { useAppStore } from "../state/store";
import type { Dictionary } from "./types";
import { en } from "./dictionaries/en";
import { hi } from "./dictionaries/hi";
import { es } from "./dictionaries/es";
import { fr } from "./dictionaries/fr";
import { de } from "./dictionaries/de";
import { it } from "./dictionaries/it";
import { pt } from "./dictionaries/pt";
import { th } from "./dictionaries/th";

const DICTIONARIES: Record<string, Dictionary> = { en, hi, es, fr, de, it, pt, th };

// Falls back to English for an unrecognized/not-yet-hydrated code — same
// fallback the server side uses (see server/src/i18n/messages.ts's
// getMessages) so client and server never disagree about the default.
export function getDictionary(language: string): Dictionary {
  return DICTIONARIES[language] ?? en;
}

// The one hook every component uses instead of hardcoding English strings —
// re-renders automatically when the store's language changes (e.g. right
// after SettingsPanel's language picker saves), same as any other
// useAppStore selector.
export function useDictionary(): Dictionary {
  return useAppStore((s) => getDictionary(s.language));
}
