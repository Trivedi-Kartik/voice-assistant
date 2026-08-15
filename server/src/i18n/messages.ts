import type { LanguageCode } from "./languages.js";

// Every server-authored string that gets spoken back to the user via TTS
// (see ws/session.ts) — kept deterministic/hand-authored, not LLM-generated,
// same reasoning as the confirmation classifier: these fire in error paths
// where "probably right most of the time" isn't good enough. Machine/LLM-
// translated for the 7 non-English languages — a reasonable starting point,
// not a substitute for a native speaker's review before this ships to real
// users (see docs/ARCHITECTURE.md "Multi-language support").
export interface Messages {
  turnInProgress: string;
  dailyLimitReached: string;
  rateLimitedWithWait: (wait: string) => string;
  rateLimitedGeneric: string;
  sttUnclearError: string;
  sttEmptyError: string;
  leakedCallFallback: string;
  doneFallback: string;
  toolUseFailedRetry: string;
  turnFailedGeneric: string;
  factNotSaved: string;
  factSaved: string;
  factSaveFailed: string;
  deviceDisconnected: string;
  waitingForConfirmation: string;
  toolTimedOut: string;
}

const en: Messages = {
  turnInProgress: "Still working on your last request — one moment.",
  dailyLimitReached:
    "You've hit today's free limit. Add your own Groq API key in Settings for unlimited use, or try again after midnight UTC.",
  rateLimitedWithWait: (wait) => `Groq's usage limit is temporarily reached — try again in about ${wait}.`,
  rateLimitedGeneric: "Things are a bit busy right now — please try again in a few seconds.",
  sttUnclearError: "I didn't catch that clearly — could you try again?",
  sttEmptyError: "I didn't catch that — could you try again?",
  leakedCallFallback: "Sorry, something went wrong with that — can you try again?",
  doneFallback: "Done.",
  toolUseFailedRetry: "I had trouble with that — try asking one thing at a time.",
  turnFailedGeneric: "Something went wrong processing that — try again.",
  factNotSaved: "That didn't look like a fact I could save.",
  factSaved: "Got it, I'll remember that.",
  factSaveFailed: "Couldn't save that right now.",
  deviceDisconnected: "Device disconnected before finishing this action.",
  waitingForConfirmation: "Waiting for the user's confirmation.",
  toolTimedOut: "Tool timed out",
};

const hi: Messages = {
  turnInProgress: "मैं अभी भी आपके पिछले अनुरोध पर काम कर रहा हूँ — एक पल रुकिए।",
  dailyLimitReached:
    "आपने आज की मुफ़्त सीमा पूरी कर ली है। असीमित उपयोग के लिए सेटिंग्स में अपनी खुद की Groq API key जोड़ें, या आधी रात (UTC) के बाद फिर से कोशिश करें।",
  rateLimitedWithWait: (wait) => `Groq की उपयोग सीमा अभी अस्थायी रूप से पूरी हो गई है — लगभग ${wait} में फिर से कोशिश करें।`,
  rateLimitedGeneric: "अभी थोड़ी व्यस्तता है — कृपया कुछ सेकंड में फिर से कोशिश करें।",
  sttUnclearError: "मैं ठीक से समझ नहीं पाया — क्या आप फिर से कोशिश कर सकते हैं?",
  sttEmptyError: "मैं कुछ सुन नहीं पाया — क्या आप फिर से बोल सकते हैं?",
  leakedCallFallback: "माफ़ कीजिए, उसमें कुछ गड़बड़ हो गई — क्या आप फिर से कोशिश कर सकते हैं?",
  doneFallback: "हो गया।",
  toolUseFailedRetry: "मुझे इसमें दिक्कत हुई — कृपया एक बार में एक ही चीज़ पूछें।",
  turnFailedGeneric: "उसे प्रोसेस करने में कुछ गड़बड़ हो गई — फिर से कोशिश करें।",
  factNotSaved: "यह मुझे कोई ऐसी बात नहीं लगी जिसे मैं सहेज सकूँ।",
  factSaved: "ठीक है, मैं इसे याद रखूँगा।",
  factSaveFailed: "अभी उसे सहेज नहीं पाया।",
  deviceDisconnected: "यह काम पूरा होने से पहले डिवाइस डिस्कनेक्ट हो गया।",
  waitingForConfirmation: "उपयोगकर्ता की पुष्टि का इंतज़ार है।",
  toolTimedOut: "टूल का समय समाप्त हो गया",
};

const es: Messages = {
  turnInProgress: "Todavía estoy trabajando en tu última solicitud — un momento.",
  dailyLimitReached:
    "Has alcanzado el límite gratuito de hoy. Añade tu propia clave de API de Groq en Configuración para uso ilimitado, o inténtalo de nuevo después de medianoche UTC.",
  rateLimitedWithWait: (wait) => `El límite de uso de Groq se ha alcanzado temporalmente — inténtalo de nuevo en unos ${wait}.`,
  rateLimitedGeneric: "Ahora mismo hay bastante actividad — inténtalo de nuevo en unos segundos.",
  sttUnclearError: "No entendí bien eso — ¿puedes intentarlo de nuevo?",
  sttEmptyError: "No escuché nada — ¿puedes intentarlo de nuevo?",
  leakedCallFallback: "Lo siento, algo salió mal con eso — ¿puedes intentarlo de nuevo?",
  doneFallback: "Listo.",
  toolUseFailedRetry: "Tuve problemas con eso — intenta pedir una cosa a la vez.",
  turnFailedGeneric: "Algo salió mal al procesar eso — inténtalo de nuevo.",
  factNotSaved: "Eso no parecía un dato que pudiera guardar.",
  factSaved: "Entendido, lo recordaré.",
  factSaveFailed: "No pude guardar eso ahora mismo.",
  deviceDisconnected: "El dispositivo se desconectó antes de terminar esta acción.",
  waitingForConfirmation: "Esperando la confirmación del usuario.",
  toolTimedOut: "La herramienta agotó el tiempo de espera",
};

const fr: Messages = {
  turnInProgress: "Je travaille encore sur votre dernière demande — un instant.",
  dailyLimitReached:
    "Vous avez atteint la limite gratuite d'aujourd'hui. Ajoutez votre propre clé API Groq dans les paramètres pour un usage illimité, ou réessayez après minuit UTC.",
  rateLimitedWithWait: (wait) => `La limite d'utilisation de Groq est temporairement atteinte — réessayez dans environ ${wait}.`,
  rateLimitedGeneric: "C'est un peu chargé en ce moment — veuillez réessayer dans quelques secondes.",
  sttUnclearError: "Je n'ai pas bien compris — pouvez-vous réessayer ?",
  sttEmptyError: "Je n'ai rien entendu — pouvez-vous réessayer ?",
  leakedCallFallback: "Désolé, quelque chose s'est mal passé — pouvez-vous réessayer ?",
  doneFallback: "C'est fait.",
  toolUseFailedRetry: "J'ai eu du mal avec ça — essayez de demander une seule chose à la fois.",
  turnFailedGeneric: "Quelque chose s'est mal passé — réessayez.",
  factNotSaved: "Cela ne ressemblait pas à un fait que je pouvais enregistrer.",
  factSaved: "Compris, je m'en souviendrai.",
  factSaveFailed: "Je n'ai pas pu enregistrer cela pour le moment.",
  deviceDisconnected: "L'appareil s'est déconnecté avant la fin de cette action.",
  waitingForConfirmation: "En attente de la confirmation de l'utilisateur.",
  toolTimedOut: "L'outil a expiré",
};

const de: Messages = {
  turnInProgress: "Ich arbeite noch an deiner letzten Anfrage — einen Moment.",
  dailyLimitReached:
    "Du hast das heutige kostenlose Limit erreicht. Füge in den Einstellungen deinen eigenen Groq-API-Schlüssel hinzu, oder versuche es nach Mitternacht UTC erneut.",
  rateLimitedWithWait: (wait) => `Das Groq-Nutzungslimit ist vorübergehend erreicht — versuche es in etwa ${wait} erneut.`,
  rateLimitedGeneric: "Gerade ist es etwas voll — bitte versuche es in ein paar Sekunden erneut.",
  sttUnclearError: "Das habe ich nicht klar verstanden — kannst du es noch einmal versuchen?",
  sttEmptyError: "Ich habe nichts gehört — kannst du es noch einmal versuchen?",
  leakedCallFallback: "Entschuldigung, dabei ist etwas schiefgelaufen — kannst du es noch einmal versuchen?",
  doneFallback: "Erledigt.",
  toolUseFailedRetry: "Damit hatte ich Schwierigkeiten — bitte frage jeweils nur nach einer Sache.",
  turnFailedGeneric: "Bei der Verarbeitung ist etwas schiefgelaufen — versuche es erneut.",
  factNotSaved: "Das sah nicht wie eine Tatsache aus, die ich speichern konnte.",
  factSaved: "Verstanden, das merke ich mir.",
  factSaveFailed: "Das konnte ich gerade nicht speichern.",
  deviceDisconnected: "Das Gerät hat die Verbindung getrennt, bevor diese Aktion abgeschlossen war.",
  waitingForConfirmation: "Warte auf die Bestätigung des Nutzers.",
  toolTimedOut: "Zeitüberschreitung beim Tool",
};

const it: Messages = {
  turnInProgress: "Sto ancora lavorando alla tua ultima richiesta — un momento.",
  dailyLimitReached:
    "Hai raggiunto il limite gratuito di oggi. Aggiungi la tua chiave API Groq nelle Impostazioni per un uso illimitato, oppure riprova dopo mezzanotte UTC.",
  rateLimitedWithWait: (wait) => `Il limite di utilizzo di Groq è temporaneamente raggiunto — riprova tra circa ${wait}.`,
  rateLimitedGeneric: "In questo momento c'è un po' di traffico — riprova tra qualche secondo.",
  sttUnclearError: "Non ho capito bene — puoi riprovare?",
  sttEmptyError: "Non ho sentito nulla — puoi riprovare?",
  leakedCallFallback: "Mi dispiace, qualcosa è andato storto — puoi riprovare?",
  doneFallback: "Fatto.",
  toolUseFailedRetry: "Ho avuto difficoltà con questo — prova a chiedere una cosa alla volta.",
  turnFailedGeneric: "Qualcosa è andato storto durante l'elaborazione — riprova.",
  factNotSaved: "Non sembrava un fatto che potessi salvare.",
  factSaved: "Capito, me lo ricorderò.",
  factSaveFailed: "Non sono riuscito a salvarlo in questo momento.",
  deviceDisconnected: "Il dispositivo si è disconnesso prima che questa azione fosse completata.",
  waitingForConfirmation: "In attesa della conferma dell'utente.",
  toolTimedOut: "Lo strumento ha superato il tempo limite",
};

const pt: Messages = {
  turnInProgress: "Ainda estou trabalhando no seu último pedido — um momento.",
  dailyLimitReached:
    "Você atingiu o limite gratuito de hoje. Adicione sua própria chave de API do Groq nas Configurações para uso ilimitado, ou tente novamente após a meia-noite UTC.",
  rateLimitedWithWait: (wait) => `O limite de uso do Groq foi atingido temporariamente — tente novamente em cerca de ${wait}.`,
  rateLimitedGeneric: "Está um pouco ocupado agora — tente novamente em alguns segundos.",
  sttUnclearError: "Não entendi bem isso — pode tentar de novo?",
  sttEmptyError: "Não ouvi nada — pode tentar de novo?",
  leakedCallFallback: "Desculpe, algo deu errado com isso — pode tentar de novo?",
  doneFallback: "Pronto.",
  toolUseFailedRetry: "Tive dificuldade com isso — tente pedir uma coisa de cada vez.",
  turnFailedGeneric: "Algo deu errado ao processar isso — tente novamente.",
  factNotSaved: "Isso não pareceu um fato que eu pudesse salvar.",
  factSaved: "Entendido, vou lembrar disso.",
  factSaveFailed: "Não consegui salvar isso agora.",
  deviceDisconnected: "O dispositivo desconectou antes de concluir esta ação.",
  waitingForConfirmation: "Aguardando a confirmação do usuário.",
  toolTimedOut: "A ferramenta expirou",
};

const th: Messages = {
  turnInProgress: "ฉันยังทำงานกับคำขอล่าสุดของคุณอยู่ — รอสักครู่นะ",
  dailyLimitReached:
    "คุณใช้โควตาฟรีของวันนี้หมดแล้ว เพิ่ม Groq API key ของคุณเองในหน้าตั้งค่าเพื่อใช้งานได้ไม่จำกัด หรือลองใหม่หลังเที่ยงคืน UTC",
  rateLimitedWithWait: (wait) => `ขีดจำกัดการใช้งานของ Groq ถึงชั่วคราวแล้ว — ลองใหม่อีกครั้งในอีกประมาณ ${wait}`,
  rateLimitedGeneric: "ตอนนี้มีคนใช้งานเยอะนิดหน่อย — โปรดลองใหม่อีกครั้งในอีกไม่กี่วินาที",
  sttUnclearError: "ฉันฟังไม่ค่อยชัด — ลองพูดอีกครั้งได้ไหม?",
  sttEmptyError: "ฉันไม่ได้ยินอะไรเลย — ลองพูดอีกครั้งได้ไหม?",
  leakedCallFallback: "ขอโทษที มีบางอย่างผิดพลาด — ลองอีกครั้งได้ไหม?",
  doneFallback: "เรียบร้อยแล้ว",
  toolUseFailedRetry: "ฉันติดปัญหากับเรื่องนี้ — ลองถามทีละเรื่องนะ",
  turnFailedGeneric: "มีบางอย่างผิดพลาดระหว่างประมวลผล — ลองใหม่อีกครั้ง",
  factNotSaved: "อันนี้ดูไม่เหมือนข้อมูลที่ฉันจะบันทึกได้",
  factSaved: "รับทราบ ฉันจะจำไว้",
  factSaveFailed: "ตอนนี้บันทึกไม่ได้",
  deviceDisconnected: "อุปกรณ์หลุดการเชื่อมต่อก่อนที่การทำงานนี้จะเสร็จสิ้น",
  waitingForConfirmation: "กำลังรอการยืนยันจากผู้ใช้",
  toolTimedOut: "เครื่องมือหมดเวลา",
};

const MESSAGES: Record<LanguageCode, Messages> = { en, hi, es, fr, de, it, pt, th };

export function getMessages(language: string): Messages {
  return MESSAGES[language as LanguageCode] ?? en;
}
