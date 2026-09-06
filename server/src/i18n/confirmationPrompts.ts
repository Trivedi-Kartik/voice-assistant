import { CONFIRMATION_PROMPTS as EN_PROMPTS } from "../tools/schemas.js";
import type { LanguageCode } from "./languages.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PromptFn = (args: any) => string;
type PromptMap = Partial<Record<string, PromptFn>>;

// Translations of tools/schemas.ts's CONFIRMATION_PROMPTS (the source of
// truth for English + which tools are confirmation-gated at all — see
// ws/session.ts, which still checks `CONFIRMATION_PROMPTS[call.name]`
// directly for that existence check, language-independent by design).
// Machine/LLM-translated — same review caveat as i18n/messages.ts.
const hi: PromptMap = {
  close_app: (args) => `क्या ${args?.app ?? "उसे"} बंद कर दूँ? पुष्टि के लिए हाँ कहें।`,
  read_clipboard: () => "क्या मैं आपका क्लिपबोर्ड देख सकता हूँ? पुष्टि के लिए हाँ कहें।",
  take_screenshot_and_describe: () => "क्या मैं स्क्रीनशॉट लेकर आपसे साझा करूँ? पुष्टि के लिए हाँ कहें।",
  add_custom_app: (args) => `क्या ${args?.name ?? "उसे"} एक ऐप के रूप में जोड़ दूँ जिसे आप खोल सकें? पुष्टि के लिए हाँ कहें।`,
  computer_use_task: () =>
    "इसके लिए मुझे आपकी स्क्रीन पर क्लिक और टाइप करना होगा — कभी-कभी गलत जगह क्लिक हो सकता है, और आप कभी भी रुकने को कह सकते हैं। आगे बढ़ूँ?",
};

const es: PromptMap = {
  close_app: (args) => `¿Cierro ${args?.app ?? "eso"}? Di sí para confirmar.`,
  read_clipboard: () => "¿Comparto tu portapapeles conmigo? Di sí para confirmar.",
  take_screenshot_and_describe: () => "¿Tomo una captura de pantalla y la comparto contigo? Di sí para confirmar.",
  add_custom_app: (args) => `¿Añado ${args?.name ?? "eso"} como una app que puedas abrir? Di sí para confirmar.`,
  computer_use_task: () =>
    "Esto me permite hacer clic y escribir en tu pantalla para hacerlo — a veces puede hacer clic en algo equivocado, y puedes decir 'para' en cualquier momento. ¿Adelante?",
};

const fr: PromptMap = {
  close_app: (args) => `Je ferme ${args?.app ?? "ça"} ? Dites oui pour confirmer.`,
  read_clipboard: () => "Je partage votre presse-papiers avec moi ? Dites oui pour confirmer.",
  take_screenshot_and_describe: () => "Je prends une capture d'écran et je la partage avec vous ? Dites oui pour confirmer.",
  add_custom_app: (args) => `J'ajoute ${args?.name ?? "ça"} comme application que vous pouvez ouvrir ? Dites oui pour confirmer.`,
  computer_use_task: () =>
    "Cela me permet de cliquer et de taper sur votre écran pour faire ça — il peut arriver que je clique au mauvais endroit, et vous pouvez dire stop à tout moment. On y va ?",
};

const de: PromptMap = {
  close_app: (args) => `Soll ich ${args?.app ?? "das"} schließen? Sag ja, um zu bestätigen.`,
  read_clipboard: () => "Soll ich deine Zwischenablage mit mir teilen? Sag ja, um zu bestätigen.",
  take_screenshot_and_describe: () => "Soll ich einen Screenshot machen und mit dir teilen? Sag ja, um zu bestätigen.",
  add_custom_app: (args) => `Soll ich ${args?.name ?? "das"} als App hinzufügen, die du öffnen kannst? Sag ja, um zu bestätigen.`,
  computer_use_task: () =>
    "Dafür klicke und tippe ich auf deinem Bildschirm — dabei kann manchmal das Falsche angeklickt werden, und du kannst jederzeit stopp sagen. Los geht's?",
};

const it: PromptMap = {
  close_app: (args) => `Chiudo ${args?.app ?? "quello"}? Di' sì per confermare.`,
  read_clipboard: () => "Condivido gli appunti con te? Di' sì per confermare.",
  take_screenshot_and_describe: () => "Faccio uno screenshot e lo condivido con te? Di' sì per confermare.",
  add_custom_app: (args) => `Aggiungo ${args?.name ?? "quello"} come app che puoi aprire? Di' sì per confermare.`,
  computer_use_task: () =>
    "Per farlo devo cliccare e scrivere sul tuo schermo — a volte potrei cliccare sulla cosa sbagliata, e puoi dire stop in qualsiasi momento. Procedo?",
};

const pt: PromptMap = {
  close_app: (args) => `Fecho ${args?.app ?? "isso"}? Diga sim para confirmar.`,
  read_clipboard: () => "Posso compartilhar sua área de transferência comigo? Diga sim para confirmar.",
  take_screenshot_and_describe: () => "Tiro uma captura de tela e compartilho com você? Diga sim para confirmar.",
  add_custom_app: (args) => `Adiciono ${args?.name ?? "isso"} como um app que você pode abrir? Diga sim para confirmar.`,
  computer_use_task: () =>
    "Para isso eu clico e digito na sua tela — às vezes posso clicar na coisa errada, e você pode dizer 'pare' a qualquer momento. Posso continuar?",
};

const th: PromptMap = {
  close_app: (args) => `ปิด ${args?.app ?? "แอปนั้น"} ไหม? พูดว่าใช่เพื่อยืนยัน`,
  read_clipboard: () => "ให้ฉันดูคลิปบอร์ดของคุณไหม? พูดว่าใช่เพื่อยืนยัน",
  take_screenshot_and_describe: () => "ให้ฉันจับภาพหน้าจอแล้วแชร์กับคุณไหม? พูดว่าใช่เพื่อยืนยัน",
  add_custom_app: (args) => `เพิ่ม ${args?.name ?? "แอปนั้น"} เป็นแอปที่คุณเปิดได้ไหม? พูดว่าใช่เพื่อยืนยัน`,
  computer_use_task: () =>
    "การทำแบบนี้ฉันต้องคลิกและพิมพ์บนหน้าจอของคุณ — บางครั้งอาจคลิกผิดที่ได้ และคุณสามารถพูดว่าหยุดได้ตลอดเวลา ให้ทำเลยไหม?",
};

const BY_LANGUAGE: Record<LanguageCode, PromptMap> = { en: EN_PROMPTS, hi, es, fr, de, it, pt, th };

export function getConfirmationPrompt(language: string, toolName: string): PromptFn | undefined {
  const map = BY_LANGUAGE[language as LanguageCode] ?? EN_PROMPTS;
  return map[toolName] ?? EN_PROMPTS[toolName];
}
