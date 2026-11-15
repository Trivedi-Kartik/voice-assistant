// Spoken confirmation questions for risky PC-agent steps, in the user's language. Deterministic (never
// LLM-generated), like the existing tool confirmations in i18n/confirmationPrompts.ts. The yes/no answer
// is classified with the same per-language keyword lists (i18n/confirmation.ts).
// Machine-translated for the 7 non-English languages — same native-review caveat as i18n/messages.ts.

export type ConfirmKind = "delete" | "overwrite" | "click" | "shift_delete" | "setting" | "screen" | "clipboard" | "shortcut" | "outbound";

type Templates = Record<ConfirmKind, (target: string) => string>;

const T: Record<string, Templates> = {
  en: {
    delete: (t) => `Move ${t} to the Trash? Say yes to confirm.`,
    overwrite: (t) => `Replace everything in ${t}? Say yes to confirm.`,
    click: (t) => `Click "${t}"? That may send, buy or delete something. Say yes to confirm.`,
    shift_delete: () => "Permanently delete the selected item? Say yes to confirm.",
    setting: (t) => `${t}? You might lose the connection to me or be locked out. Say yes to confirm.`,
    screen: () => "To do this I need to look at your screen and use the mouse. The screenshots are sent to an AI model to understand them. Say yes to allow that for this task.",
    clipboard: () => "Read what's on your clipboard? Say yes to confirm.",
    shortcut: (t) => `Press ${t}? That can close windows or open system menus. Say yes to confirm.`,
    outbound: () => "I've read private data from your computer. Should I now go to a website? Say yes to allow it.",
  },
  hi: {
    delete: (t) => `क्या ${t} को ट्रैश में डाल दूँ? पुष्टि के लिए हाँ कहें।`,
    overwrite: (t) => `क्या ${t} की पूरी सामग्री बदल दूँ? पुष्टि के लिए हाँ कहें।`,
    click: (t) => `क्या "${t}" पर क्लिक करूँ? इससे कुछ भेजा, खरीदा या मिटाया जा सकता है। पुष्टि के लिए हाँ कहें।`,
    shift_delete: () => "क्या चुनी हुई चीज़ हमेशा के लिए मिटा दूँ? पुष्टि के लिए हाँ कहें।",
    setting: (t) => `${t}? इससे मुझसे कनेक्शन टूट सकता है या स्क्रीन लॉक हो सकती है। पुष्टि के लिए हाँ कहें।`,
    screen: () => "यह करने के लिए मुझे आपकी स्क्रीन देखनी होगी और माउस इस्तेमाल करना होगा। स्क्रीनशॉट समझने के लिए एक AI मॉडल को भेजे जाते हैं। इस कार्य के लिए अनुमति देने को हाँ कहें।",
    clipboard: () => "क्या आपके क्लिपबोर्ड की सामग्री पढ़ूँ? पुष्टि के लिए हाँ कहें।",
    shortcut: (t) => `क्या ${t} दबाऊँ? इससे विंडो बंद हो सकती हैं या सिस्टम मेन्यू खुल सकते हैं। पुष्टि के लिए हाँ कहें।`,
    outbound: () => "मैंने आपके कंप्यूटर से निजी जानकारी पढ़ी है। क्या अब मैं किसी वेबसाइट पर जाऊँ? अनुमति के लिए हाँ कहें।",
  },
  es: {
    delete: (t) => `¿Muevo ${t} a la papelera? Di sí para confirmar.`,
    overwrite: (t) => `¿Reemplazo todo el contenido de ${t}? Di sí para confirmar.`,
    click: (t) => `¿Hago clic en "${t}"? Puede enviar, comprar o borrar algo. Di sí para confirmar.`,
    shift_delete: () => "¿Borro el elemento seleccionado para siempre? Di sí para confirmar.",
    setting: (t) => `¿${t}? Podrías perder la conexión conmigo o quedar bloqueado. Di sí para confirmar.`,
    screen: () => "Para hacerlo necesito ver tu pantalla y usar el ratón. Las capturas se envían a un modelo de IA para entenderlas. Di sí para permitirlo en esta tarea.",
    clipboard: () => "¿Leo lo que hay en tu portapapeles? Di sí para confirmar.",
    shortcut: (t) => `¿Pulso ${t}? Puede cerrar ventanas o abrir menús del sistema. Di sí para confirmar.`,
    outbound: () => "He leído datos privados de tu ordenador. ¿Voy ahora a un sitio web? Di sí para permitirlo.",
  },
  fr: {
    delete: (t) => `Je mets ${t} à la corbeille ? Dites oui pour confirmer.`,
    overwrite: (t) => `Je remplace tout le contenu de ${t} ? Dites oui pour confirmer.`,
    click: (t) => `Je clique sur « ${t} » ? Cela peut envoyer, acheter ou supprimer quelque chose. Dites oui pour confirmer.`,
    shift_delete: () => "Je supprime définitivement l'élément sélectionné ? Dites oui pour confirmer.",
    setting: (t) => `${t} ? Vous pourriez perdre la connexion avec moi ou être verrouillé. Dites oui pour confirmer.`,
    screen: () => "Pour cela, j'ai besoin de voir votre écran et d'utiliser la souris. Les captures sont envoyées à un modèle d'IA pour les comprendre. Dites oui pour l'autoriser pour cette tâche.",
    clipboard: () => "Je lis le contenu de votre presse-papiers ? Dites oui pour confirmer.",
    shortcut: (t) => `J'appuie sur ${t} ? Cela peut fermer des fenêtres ou ouvrir des menus système. Dites oui pour confirmer.`,
    outbound: () => "J'ai lu des données privées sur votre ordinateur. Puis-je maintenant aller sur un site web ? Dites oui pour l'autoriser.",
  },
  de: {
    delete: (t) => `Soll ich ${t} in den Papierkorb verschieben? Sag ja zum Bestätigen.`,
    overwrite: (t) => `Soll ich den gesamten Inhalt von ${t} ersetzen? Sag ja zum Bestätigen.`,
    click: (t) => `Soll ich auf „${t}“ klicken? Das kann etwas senden, kaufen oder löschen. Sag ja zum Bestätigen.`,
    shift_delete: () => "Soll ich das ausgewählte Element endgültig löschen? Sag ja zum Bestätigen.",
    setting: (t) => `${t}? Die Verbindung zu mir könnte abbrechen oder der Bildschirm gesperrt werden. Sag ja zum Bestätigen.`,
    screen: () => "Dafür muss ich deinen Bildschirm ansehen und die Maus benutzen. Die Screenshots werden zum Verstehen an ein KI-Modell gesendet. Sag ja, um das für diese Aufgabe zu erlauben.",
    clipboard: () => "Soll ich lesen, was in deiner Zwischenablage steht? Sag ja zum Bestätigen.",
    shortcut: (t) => `Soll ich ${t} drücken? Das kann Fenster schließen oder Systemmenüs öffnen. Sag ja zum Bestätigen.`,
    outbound: () => "Ich habe private Daten von deinem Computer gelesen. Soll ich jetzt eine Website aufrufen? Sag ja, um es zu erlauben.",
  },
  it: {
    delete: (t) => `Sposto ${t} nel cestino? Di' sì per confermare.`,
    overwrite: (t) => `Sostituisco tutto il contenuto di ${t}? Di' sì per confermare.`,
    click: (t) => `Clicco su "${t}"? Potrebbe inviare, acquistare o eliminare qualcosa. Di' sì per confermare.`,
    shift_delete: () => "Elimino definitivamente l'elemento selezionato? Di' sì per confermare.",
    setting: (t) => `${t}? Potresti perdere la connessione con me o restare bloccato. Di' sì per confermare.`,
    screen: () => "Per farlo devo guardare lo schermo e usare il mouse. Gli screenshot vengono inviati a un modello di IA per capirli. Di' sì per consentirlo per questa attività.",
    clipboard: () => "Leggo cosa c'è negli appunti? Di' sì per confermare.",
    shortcut: (t) => `Premo ${t}? Può chiudere finestre o aprire menu di sistema. Di' sì per confermare.`,
    outbound: () => "Ho letto dati privati dal tuo computer. Posso ora andare su un sito web? Di' sì per consentirlo.",
  },
  pt: {
    delete: (t) => `Movo ${t} para a lixeira? Diga sim para confirmar.`,
    overwrite: (t) => `Substituo todo o conteúdo de ${t}? Diga sim para confirmar.`,
    click: (t) => `Clico em "${t}"? Isso pode enviar, comprar ou apagar algo. Diga sim para confirmar.`,
    shift_delete: () => "Apago o item selecionado para sempre? Diga sim para confirmar.",
    setting: (t) => `${t}? Você pode perder a conexão comigo ou ficar bloqueado. Diga sim para confirmar.`,
    screen: () => "Para fazer isso preciso ver sua tela e usar o mouse. As capturas são enviadas a um modelo de IA para entendê-las. Diga sim para permitir nesta tarefa.",
    clipboard: () => "Leio o que está na sua área de transferência? Diga sim para confirmar.",
    shortcut: (t) => `Pressiono ${t}? Isso pode fechar janelas ou abrir menus do sistema. Diga sim para confirmar.`,
    outbound: () => "Li dados privados do seu computador. Posso agora ir a um site? Diga sim para permitir.",
  },
  th: {
    delete: (t) => `ย้าย ${t} ไปถังขยะไหม? พูดว่าใช่เพื่อยืนยัน`,
    overwrite: (t) => `แทนที่เนื้อหาทั้งหมดใน ${t} ไหม? พูดว่าใช่เพื่อยืนยัน`,
    click: (t) => `คลิก "${t}" ไหม? อาจเป็นการส่ง ซื้อ หรือลบบางอย่าง พูดว่าใช่เพื่อยืนยัน`,
    shift_delete: () => "ลบรายการที่เลือกอย่างถาวรไหม? พูดว่าใช่เพื่อยืนยัน",
    setting: (t) => `${t} ไหม? อาจทำให้การเชื่อมต่อกับฉันหลุดหรือหน้าจอถูกล็อก พูดว่าใช่เพื่อยืนยัน`,
    screen: () => "ในการทำเรื่องนี้ ฉันต้องดูหน้าจอและใช้เมาส์ ภาพหน้าจอจะถูกส่งไปให้โมเดล AI เพื่อทำความเข้าใจ พูดว่าใช่เพื่ออนุญาตสำหรับงานนี้",
    clipboard: () => "อ่านสิ่งที่อยู่ในคลิปบอร์ดไหม? พูดว่าใช่เพื่อยืนยัน",
    shortcut: (t) => `กด ${t} ไหม? อาจปิดหน้าต่างหรือเปิดเมนูระบบ พูดว่าใช่เพื่อยืนยัน`,
    outbound: () => "ฉันอ่านข้อมูลส่วนตัวจากคอมพิวเตอร์ของคุณแล้ว ตอนนี้ไปเว็บไซต์ได้ไหม? พูดว่าใช่เพื่ออนุญาต",
  },
};

export function confirmPrompt(kind: ConfirmKind, target: string, language: string): string {
  return (T[language] ?? T.en)[kind](target);
}
