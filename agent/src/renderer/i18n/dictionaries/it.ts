import type { Dictionary } from "../types";

export const it: Dictionary = {
  app: {
    loading: "Caricamento…",
    whatCanIAsk: "Cosa posso chiedere?",
    settingsLink: "Impostazioni",
    micBlocked: "L'accesso al microfono è bloccato.",
    openMicSettings: "Apri le impostazioni del microfono di Windows",
    continuousSessionHint: "Sessione attiva — premi il tasto di scelta rapida per terminare",
  },
  orbLabels: {
    idle: "Premi Ctrl+Shift+Spazio per parlare",
    listening: "Ascolto…",
    thinking: "Sto pensando…",
    speaking: "Sto parlando…",
  },
  micButton: {
    startTalking: "Inizia a parlare",
    stopTalking: "Smetti di parlare",
  },
  statusIndicator: {
    idle: "Non connesso",
    connecting: "Connessione…",
    connected: "Connesso",
    reconnecting: "Riconnessione…",
    error: "Connessione persa",
    retryConnection: "Riprova a connetterti",
  },
  login: {
    subtitle: "Accedi per parlare con il tuo assistente.",
    logInTab: "Accedi",
    signUpTab: "Registrati",
    emailLabel: "Email",
    emailPlaceholder: "tu@esempio.com",
    passwordLabel: "Password",
    passwordPlaceholder: "Minimo 8 caratteri",
    genericError: "Qualcosa è andato storto — riprova.",
    pleaseWait: "Attendi…",
    needAccount: "Non hai un account? ",
    alreadyHaveAccount: "Hai già un account? ",
  },
  consent: {
    heading: "Prima di iniziare",
    bullets: [
      "Quando premi il tasto di scelta rapida e parli, il tuo audio viene inviato al nostro server ed elaborato tramite Groq per trascriverlo e capirlo.",
      'Questa app può compiere azioni reali sul tuo computer per tuo conto — aprire e chiudere app, controllare i contenuti multimediali, impostare promemoria, fare ricerche sul web e aprire URL — solo da un elenco fisso e sicuro che il tuo assistente può usare. Le azioni rischiose (chiudere un\'app) o che potrebbero esporre qualcosa di privato (leggere gli appunti, fare uno screenshot) ti chiedono sempre a voce di confermare prima — basta dire "sì" al turno successivo per permetterlo, o qualsiasi altra cosa per annullare.',
      "Se confermi uno screenshot, un'immagine del tuo schermo in quel momento viene inviata a un modello IA nel cloud per essere descritta a voce — è la cosa più sensibile che questa app condivide, motivo per cui non viene mai fatto senza chiedere prima il tuo permesso.",
      'Puoi chiederle di aggiungere le tue app a quell\'elenco (ad esempio "aggiungi Photoshop tra le app che posso aprire") — ti chiede sempre di confermare prima, e sei sempre tu a scegliere il programma effettivo in un selettore di file; non viene mai aggiunto nulla automaticamente.',
      "Per attività che richiedono di cliccare o scrivere dentro un'app (ad esempio aggiungere qualcosa a un carrello, inviare un messaggio), può fare screenshot e controllare mouse/tastiera passo dopo passo — chiede sempre prima conferma, e di nuovo prima di qualsiasi cosa che concluda un acquisto, invii un messaggio o elimini qualcosa. Usa un modello IA gratuito per questo, quindi a volte può cliccare sulla cosa sbagliata; puoi dire \"stop\" in qualsiasi momento.",
      "Questa è una beta iniziale. Alcune cose potrebbero non funzionare a dovere, e l'assistente potrebbe ogni tanto fraintenderti.",
    ],
    accept: "Ho capito, continua",
    privacyPolicyLink: "Leggi la nostra Informativa sulla Privacy",
  },
  settings: {
    heading: "Impostazioni",
    languageTitle: "Lingua",
    languageHint:
      "Imposta la lingua in cui Karvix ascolta, parla e mostra questa app. Limitata alle lingue per cui il nostro modello IA è ufficialmente validato — un elenco più ampio rischierebbe di fraintendere silenziosamente quello che chiedi.",
    languageLabel: "Lingua",
    languageError: "Non è stato possibile salvare — riprova.",
    groqKeyTitle: "Chiave API Groq",
    groqKeyHint: "Hai raggiunto il limite gratuito di oggi? Aggiungi la tua chiave Groq gratuita (console.groq.com) per rimuovere del tutto il limite giornaliero.",
    groqKeyLabel: "Chiave API",
    saving: "Salvataggio…",
    saveKey: "Salva chiave",
    groqKeySaved: "Salvata — il limite giornaliero non si applica più.",
    groqKeyError: "Non è stato possibile salvare questa chiave — riprova.",
    myAppsTitle: "Le mie app",
    myAppsHint: 'Le app che hai aggiunto chiedendolo a Karvix (ad esempio "aggiungi Photoshop tra le app che posso aprire"). Solo su questo dispositivo.',
    remove: "Rimuovi",
    noneAddedYet: "Nessuna app aggiunta finora.",
    privacyPolicyLink: "Informativa sulla Privacy",
    close: "Chiudi",
  },
  help: {
    heading: "Cosa può fare Karvix?",
    introBeforeHotkey: "Premi ",
    introAfterHotkey: " da qualsiasi punto — non serve passare a questa finestra — di' cosa vuoi, poi premilo di nuovo per fermarti.",
    confirmsFirst: "Chiede prima conferma",
    footerHint:
      "Per ora solo su Windows. Gli screenshot vedono solo il monitor principale. I promemoria e i fatti memorizzati non si sincronizzano ancora tra i dispositivi.",
    close: "Chiudi",
    groups: [
      {
        title: "App",
        items: [
          {
            examples: ['"Apri Chrome"', '"Apri la fotocamera"', '"Apri Esplora file"'],
            description:
              "Apre un'app da un elenco fisso e sicuro — browser, editor, Office, app multimediali, app di chat e strumenti di sistema comuni.",
          },
          {
            examples: ['"Chiudi Chrome"', '"Chiudi Spotify"'],
            description: 'Forza la chiusura di un\'app in esecuzione da quell\'elenco — di\' "sì" al turno successivo per chiuderla davvero.',
            confirms: true,
          },
          {
            examples: ['"Aggiungi Photoshop tra le app che posso aprire"'],
            description:
              "Controlla prima le app installate (funziona anche per le app del Microsoft Store), oppure apre un selettore di file se non trova una corrispondenza chiara — non viene mai aggiunto nulla senza la tua conferma o la tua selezione. Le app dello Store possono essere aperte solo così, non chiuse. Gestisci le app aggiunte nelle Impostazioni.",
            confirms: true,
          },
        ],
      },
      {
        title: "Contenuti multimediali e promemoria",
        items: [
          {
            examples: ['"Metti in pausa la musica"', '"Alza il volume"', '"Salta questa canzone"'],
            description: "Controlla qualsiasi cosa sia in riproduzione, indipendentemente dall'app attiva.",
          },
          {
            examples: ['"Ricordami di chiamare la mamma tra 20 minuti"'],
            description:
              'Scatta come notifica desktop dopo quel tempo. Per ora solo ritardi relativi ("tra 20 minuti"), non orari precisi ("alle 18") — e serve che l\'app sia in esecuzione per attivarsi.',
          },
        ],
      },
      {
        title: "Web",
        items: [
          { examples: ['"Cerca la migliore pizza ad Ahmedabad"'], description: "Apre una ricerca web nel tuo browser predefinito." },
          { examples: ['"Apri example.com"'], description: "Apre un URL specifico nel tuo browser predefinito." },
        ],
      },
      {
        title: "Dati sensibili",
        items: [
          {
            examples: ['"Cosa c\'è sui miei appunti?"'],
            description: "Legge il testo attualmente negli appunti e lo condivide con l'assistente.",
            confirms: true,
          },
          {
            examples: ['"Cosa dice questo errore?"', '"Descrivi cosa c\'è sul mio schermo"'],
            description: "Fa uno screenshot del monitor principale e te lo descrive a voce — la cosa più sensibile a cui Karvix può accedere.",
            confirms: true,
          },
        ],
      },
      {
        title: "Memoria",
        items: [
          {
            examples: ['"Preferisco Chrome a Edge"', '"Vivo ad Ahmedabad"'],
            description:
              "Può ricordare qualcosa che dici come un fatto duraturo e tirarlo fuori più avanti — solo quando decide che ne vale chiaramente la pena, non con una scansione passiva della trascrizione.",
          },
        ],
      },
    ],
  },
  portal: {
    cards: [
      {
        title: "App",
        examples: '"Apri Chrome" · "Chiudi Spotify"',
        description: "Apre app da un elenco autorizzato. Chiuderne una o aggiungerne una nuova richiede prima la tua conferma.",
      },
      {
        title: "Contenuti multimediali e promemoria",
        examples: '"Metti in pausa la musica" · "Ricordamelo tra 20m"',
        description: "Controlli di riproduzione validi in tutto il sistema e notifiche desktop locali.",
      },
      {
        title: "Consapevole del contesto",
        examples: '"Descrivi il mio schermo"',
        description: "Legge i tuoi appunti o analizza il monitor principale — chiede prima conferma.",
      },
      {
        title: "Ricerca e memoria",
        examples: '"Cerca pizza" · "Mi piace Ubuntu"',
        description: "Apre ricerche web nel tuo browser e ricorda i fatti duraturi che gli dici.",
      },
    ],
  },
  automation: {
    heading: "Ci sto lavorando",
    starting: "Sto dando un'occhiata al tuo schermo…",
    stop: "Ferma",
  },
};
