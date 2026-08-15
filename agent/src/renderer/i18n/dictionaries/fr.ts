import type { Dictionary } from "../types";

export const fr: Dictionary = {
  app: {
    loading: "Chargement…",
    whatCanIAsk: "Qu'est-ce que je peux demander ?",
    settingsLink: "Paramètres",
    micBlocked: "L'accès au micro est bloqué.",
    openMicSettings: "Ouvrir les paramètres micro de Windows",
  },
  orbLabels: {
    idle: "Appuie sur Ctrl+Shift+Espace pour parler",
    listening: "Écoute…",
    thinking: "Réflexion…",
    speaking: "Je parle…",
  },
  micButton: {
    startTalking: "Commencer à parler",
    stopTalking: "Arrêter de parler",
  },
  statusIndicator: {
    idle: "Non connecté",
    connecting: "Connexion…",
    connected: "Connecté",
    reconnecting: "Reconnexion…",
    error: "Connexion perdue",
    retryConnection: "Réessayer la connexion",
  },
  login: {
    subtitle: "Connecte-toi pour parler à ton assistant.",
    logInTab: "Connexion",
    signUpTab: "Inscription",
    emailLabel: "E-mail",
    emailPlaceholder: "toi@exemple.com",
    passwordLabel: "Mot de passe",
    passwordPlaceholder: "8 caractères minimum",
    genericError: "Une erreur s'est produite — réessaie.",
    pleaseWait: "Patiente…",
    needAccount: "Besoin d'un compte ? ",
    alreadyHaveAccount: "Tu as déjà un compte ? ",
  },
  consent: {
    heading: "Avant de commencer",
    bullets: [
      "Quand tu appuies sur le raccourci et que tu parles, ton audio est envoyé à notre serveur et traité via Groq pour être transcrit et compris.",
      'Cette appli peut effectuer de vraies actions sur ton ordinateur en ton nom — ouvrir et fermer des applis, contrôler les médias, programmer des rappels, lancer des recherches sur le web et ouvrir des URL — uniquement à partir d\'une liste fixe et sûre que ton assistant est autorisé à utiliser. Les actions risquées (fermer une appli) ou qui pourraient exposer quelque chose de privé (lire ton presse-papiers, prendre une capture d\'écran) te demandent toujours de confirmer à voix haute — dis simplement "oui" au tour suivant pour l\'autoriser, ou autre chose pour annuler.',
      "Si tu confirmes une capture d'écran, une image de ton écran à ce moment-là est envoyée à un modèle d'IA dans le cloud pour t'en faire une description — c'est plus sensible que tout ce que cette appli partage, c'est pourquoi ça ne se fait jamais sans te le demander d'abord.",
      'Tu peux lui demander d\'ajouter tes propres applis à cette liste (par ex. "ajoute Photoshop aux applis que je peux ouvrir") — il te demande toujours de confirmer d\'abord, et tu choisis toujours toi-même le programme dans un sélecteur de fichiers ; rien n\'est jamais ajouté automatiquement.',
      "C'est une bêta précoce. Des choses peuvent ne pas fonctionner, et l'assistant peut parfois mal te comprendre.",
    ],
    accept: "J'ai compris, continuer",
    privacyPolicyLink: "Lire notre politique de confidentialité",
  },
  settings: {
    heading: "Paramètres",
    languageTitle: "Langue",
    languageHint:
      "Définit la langue dans laquelle Karvix t'écoute, te parle et affiche cette appli. Limité aux langues sur lesquelles notre modèle d'IA est officiellement validé — une liste plus large risquerait de mal comprendre silencieusement ce que tu demandes.",
    languageLabel: "Langue",
    languageError: "Impossible d'enregistrer — réessaie.",
    groqKeyTitle: "Clé API Groq",
    groqKeyHint: "Tu as atteint la limite gratuite du jour ? Ajoute ta propre clé Groq gratuite (console.groq.com) pour supprimer complètement le plafond quotidien.",
    groqKeyLabel: "Clé API",
    saving: "Enregistrement…",
    saveKey: "Enregistrer la clé",
    groqKeySaved: "Enregistré — le plafond quotidien ne s'applique plus.",
    groqKeyError: "Impossible d'enregistrer cette clé — réessaie.",
    myAppsTitle: "Mes applis",
    myAppsHint: 'Applis que tu as ajoutées en le demandant à Karvix (par ex. "ajoute Photoshop aux applis que je peux ouvrir"). Seulement sur cet appareil.',
    remove: "Supprimer",
    noneAddedYet: "Aucune ajoutée pour l'instant.",
    privacyPolicyLink: "Politique de confidentialité",
    close: "Fermer",
  },
  help: {
    heading: "Que peut faire Karvix ?",
    introBeforeHotkey: "Appuie sur ",
    introAfterHotkey: " depuis n'importe où — pas besoin de revenir sur cette fenêtre — dis ce que tu veux, puis appuie de nouveau dessus pour arrêter.",
    confirmsFirst: "Confirme d'abord",
    footerHint:
      "Windows uniquement pour l'instant. Les captures d'écran ne voient que ton moniteur principal. Les rappels et les faits mémorisés ne se synchronisent pas encore entre appareils.",
    close: "Fermer",
    groups: [
      {
        title: "Applis",
        items: [
          {
            examples: ['"Ouvre Chrome"', '"Ouvre la caméra"', '"Ouvre l\'explorateur de fichiers"'],
            description:
              "Lance une appli depuis une liste fixe et sûre — navigateurs, éditeurs, Office, médias, applis de messagerie et outils système courants.",
          },
          {
            examples: ['"Ferme Chrome"', '"Ferme Spotify"'],
            description: 'Force la fermeture d\'une appli en cours d\'exécution dans cette liste — dis "oui" au tour suivant pour vraiment la fermer.',
            confirms: true,
          },
          {
            examples: ['"Ajoute Photoshop aux applis que je peux ouvrir"'],
            description:
              "Vérifie d'abord tes applis installées (ça marche aussi pour les applis du Microsoft Store), ou ouvre un sélecteur de fichiers s'il ne trouve pas de correspondance claire — rien n'est jamais ajouté sans que tu confirmes ou sélectionnes toi-même. Les applis du Store ne peuvent être ouvertes que de cette façon, pas fermées. Gère ce que tu as ajouté dans les Paramètres.",
            confirms: true,
          },
        ],
      },
      {
        title: "Médias et rappels",
        items: [
          {
            examples: ['"Mets la musique en pause"', '"Monte le volume"', '"Passe à la chanson suivante"'],
            description: "Contrôle ce qui est en train de jouer, quelle que soit l'appli active.",
          },
          {
            examples: ['"Rappelle-moi d\'appeler maman dans 20 minutes"'],
            description:
              'Se déclenche comme une notification sur le bureau après ce délai. Seulement des délais relatifs ("dans 20 minutes"), pas encore d\'heures précises ("à 18h") — et l\'appli doit être ouverte pour que ça se déclenche.',
          },
        ],
      },
      {
        title: "Web",
        items: [
          { examples: ['"Cherche la meilleure pizza à Ahmedabad"'], description: "Ouvre une recherche web dans ton navigateur par défaut." },
          { examples: ['"Ouvre example.com"'], description: "Ouvre une URL précise dans ton navigateur par défaut." },
        ],
      },
      {
        title: "Sensible à la vie privée",
        items: [
          {
            examples: ['"Qu\'est-ce qu\'il y a dans mon presse-papiers ?"'],
            description: "Lit le texte actuellement dans ton presse-papiers et le partage avec l'assistant.",
            confirms: true,
          },
          {
            examples: ['"Que dit ce message d\'erreur ?"', '"Décris ce qu\'il y a sur mon écran"'],
            description: "Prend une capture de ton moniteur principal et te la décrit — la chose la plus sensible à laquelle Karvix peut accéder.",
            confirms: true,
          },
        ],
      },
      {
        title: "Mémoire",
        items: [
          {
            examples: ['"Je préfère Chrome à Edge"', '"J\'habite à Ahmedabad"'],
            description:
              "Peut retenir ce que tu dis comme un fait durable et le ressortir plus tard — seulement quand il juge que ça en vaut clairement la peine, pas par une lecture passive de la transcription.",
          },
        ],
      },
    ],
  },
  portal: {
    cards: [
      {
        title: "Applis",
        examples: '"Ouvre Chrome" · "Ferme Spotify"',
        description: "Lance des applis autorisées. Fermer ou en ajouter une nouvelle te demande d'abord confirmation.",
      },
      {
        title: "Médias et rappels",
        examples: '"Mets la musique en pause" · "Rappelle-moi dans 20 min"',
        description: "Contrôles de lecture à l'échelle du système et notifications locales sur le bureau.",
      },
      {
        title: "Sensible au contexte",
        examples: '"Décris mon écran"',
        description: "Lit ton presse-papiers ou analyse ton moniteur principal — demande confirmation d'abord.",
      },
      {
        title: "Recherche et mémoire",
        examples: '"Cherche des pizzas" · "J\'aime bien Ubuntu"',
        description: "Ouvre des recherches web dans ton navigateur et retient les faits durables que tu lui dis.",
      },
    ],
  },
};
