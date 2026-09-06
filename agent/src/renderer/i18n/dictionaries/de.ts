import type { Dictionary } from "../types";

export const de: Dictionary = {
  app: {
    loading: "Lädt…",
    whatCanIAsk: "Was kann ich fragen?",
    settingsLink: "Einstellungen",
    micBlocked: "Der Mikrofonzugriff ist blockiert.",
    openMicSettings: "Windows-Mikrofoneinstellungen öffnen",
    continuousSessionHint: "Sitzung aktiv — Hotkey drücken zum Beenden",
  },
  orbLabels: {
    idle: "Drück Strg+Umschalt+Leertaste zum Sprechen",
    listening: "Hört zu…",
    thinking: "Denkt nach…",
    speaking: "Spricht…",
  },
  micButton: {
    startTalking: "Sprechen starten",
    stopTalking: "Sprechen beenden",
  },
  statusIndicator: {
    idle: "Nicht verbunden",
    connecting: "Verbindet…",
    connected: "Verbunden",
    reconnecting: "Verbindet erneut…",
    error: "Verbindung verloren",
    retryConnection: "Verbindung erneut versuchen",
  },
  login: {
    subtitle: "Melde dich an, um mit deinem Assistenten zu sprechen.",
    logInTab: "Anmelden",
    signUpTab: "Registrieren",
    emailLabel: "E-Mail",
    emailPlaceholder: "du@beispiel.de",
    passwordLabel: "Passwort",
    passwordPlaceholder: "Mind. 8 Zeichen",
    genericError: "Etwas ist schiefgelaufen — versuch es noch mal.",
    pleaseWait: "Einen Moment…",
    needAccount: "Noch kein Konto? ",
    alreadyHaveAccount: "Schon ein Konto? ",
  },
  consent: {
    heading: "Bevor es losgeht",
    bullets: [
      "Wenn du die Tastenkombination drückst und sprichst, wird dein Audio an unseren Server gesendet und über Groq verarbeitet, um es zu transkribieren und zu verstehen.",
      'Diese App kann in deinem Namen echte Aktionen auf deinem Computer ausführen — Apps öffnen und schließen, Medien steuern, Erinnerungen setzen, Websuchen durchführen und URLs öffnen — aber nur aus einer festen, sicheren Liste, die dein Assistent verwenden darf. Bei riskanten Aktionen (eine App schließen) oder Aktionen, die etwas Privates offenlegen könnten (deine Zwischenablage lesen, einen Screenshot machen), fragt er dich immer laut zuerst um Bestätigung — sag beim nächsten Mal einfach "ja", um es zu erlauben, oder irgendetwas anderes, um abzubrechen.',
      "Wenn du einen Screenshot bestätigst, wird ein Bild deines Bildschirms in diesem Moment an ein Cloud-KI-Modell gesendet, das es dir beschreibt — das ist sensibler als alles andere, was diese App teilt, weshalb das nie ohne vorherige Nachfrage passiert.",
      'Du kannst ihn bitten, eigene Apps zu dieser Liste hinzuzufügen (z. B. "füge Photoshop als App hinzu, die ich öffnen kann") — er fragt dich dabei immer zuerst um Bestätigung, und du wählst das Programm immer selbst in einer Dateiauswahl aus; nichts wird jemals automatisch hinzugefügt.',
      "Für Aufgaben, bei denen in einer App geklickt oder getippt werden muss (z. B. etwas in einen Warenkorb legen, eine Nachricht senden), kann er Screenshots machen und deine Maus/Tastatur Schritt für Schritt steuern — fragt dabei immer zuerst um Bestätigung, und noch einmal, bevor ein Kauf abgeschlossen, eine Nachricht gesendet oder etwas gelöscht wird. Dafür wird ein kostenloses KI-Modell verwendet, daher kann er manchmal das Falsche anklicken; du kannst jederzeit \"stopp\" sagen.",
      "Das ist eine frühe Betaversion. Manches kann noch nicht rundlaufen, und der Assistent versteht dich vielleicht ab und zu falsch.",
    ],
    accept: "Verstanden, weiter",
    privacyPolicyLink: "Lies unsere Datenschutzerklärung",
  },
  settings: {
    heading: "Einstellungen",
    languageTitle: "Sprache",
    languageHint:
      "Legt fest, in welcher Sprache Karvix zuhört, spricht und diese App anzeigt. Beschränkt auf die Sprachen, für die unser KI-Modell offiziell validiert ist — eine größere Auswahl würde riskieren, dass Anfragen unbemerkt falsch verstanden werden.",
    languageLabel: "Sprache",
    languageError: "Konnte das nicht speichern — versuch es noch mal.",
    groqKeyTitle: "Groq-API-Schlüssel",
    groqKeyHint: "Heutiges Gratis-Limit erreicht? Füge deinen eigenen kostenlosen Groq-Schlüssel (console.groq.com) hinzu, um das Tageslimit komplett aufzuheben.",
    groqKeyLabel: "API-Schlüssel",
    saving: "Speichert…",
    saveKey: "Schlüssel speichern",
    groqKeySaved: "Gespeichert — das Tageslimit gilt nicht mehr.",
    groqKeyError: "Konnte diesen Schlüssel nicht speichern — versuch es noch mal.",
    myAppsTitle: "Meine Apps",
    myAppsHint: 'Apps, die du Karvix hinzufügen lassen hast (z. B. "füge Photoshop als App hinzu, die ich öffnen kann"). Nur auf diesem Gerät.',
    remove: "Entfernen",
    noneAddedYet: "Noch keine hinzugefügt.",
    privacyPolicyLink: "Datenschutzerklärung",
    close: "Schließen",
  },
  help: {
    heading: "Was kann Karvix?",
    introBeforeHotkey: "Drück ",
    introAfterHotkey: " von überall — du musst nicht zu diesem Fenster wechseln — sag, was du möchtest, und drück sie noch mal, um zu stoppen.",
    confirmsFirst: "Fragt zuerst nach",
    footerHint:
      "Momentan nur unter Windows. Screenshots erfassen nur deinen Hauptmonitor. Erinnerungen und gemerkte Fakten werden noch nicht geräteübergreifend synchronisiert.",
    close: "Schließen",
    groups: [
      {
        title: "Apps",
        items: [
          {
            examples: ['"Öffne Chrome"', '"Öffne die Kamera"', '"Öffne den Explorer"'],
            description:
              "Startet eine App aus einer festen, sicheren Liste — Browser, Editoren, Office, Medien, Chat-Apps und gängige Systemwerkzeuge.",
          },
          {
            examples: ['"Schließe Chrome"', '"Schließe Spotify"'],
            description: 'Beendet eine laufende App aus dieser Liste zwangsweise — sag beim nächsten Mal "ja", um sie wirklich zu schließen.',
            confirms: true,
          },
          {
            examples: ['"Füge Photoshop als App hinzu, die ich öffnen kann"'],
            description:
              "Prüft zuerst deine installierten Apps (funktioniert auch für Microsoft-Store-Apps) oder öffnet eine Dateiauswahl, wenn keine eindeutige Übereinstimmung gefunden wird — nichts wird hinzugefügt, ohne dass du bestätigst oder auswählst. Store-Apps können nur so geöffnet, aber nicht geschlossen werden. Verwalte deine hinzugefügten Apps in den Einstellungen.",
            confirms: true,
          },
        ],
      },
      {
        title: "Medien & Erinnerungen",
        items: [
          {
            examples: ['"Pausier die Musik"', '"Mach lauter"', '"Überspring den Song"'],
            description: "Steuert, was gerade läuft, egal welche App gerade im Fokus ist.",
          },
          {
            examples: ['"Erinnere mich in 20 Minuten daran, Mama anzurufen"'],
            description:
              'Kommt nach dieser Zeit als Desktop-Benachrichtigung. Bisher nur relative Zeitangaben ("in 20 Minuten"), keine Uhrzeiten ("um 18 Uhr") — und die App muss dafür laufen.',
          },
        ],
      },
      {
        title: "Web",
        items: [
          { examples: ['"Suche nach der besten Pizza in Ahmedabad"'], description: "Öffnet eine Websuche in deinem Standardbrowser." },
          { examples: ['"Öffne example.com"'], description: "Öffnet eine bestimmte URL in deinem Standardbrowser." },
        ],
      },
      {
        title: "Datenschutzsensibel",
        items: [
          {
            examples: ['"Was ist in meiner Zwischenablage?"'],
            description: "Liest den aktuellen Text aus deiner Zwischenablage und teilt ihn mit dem Assistenten.",
            confirms: true,
          },
          {
            examples: ['"Was steht in dieser Fehlermeldung?"', '"Beschreib, was auf meinem Bildschirm ist"'],
            description: "Macht einen Screenshot deines Hauptmonitors und beschreibt ihn dir — das Sensibelste, worauf Karvix zugreifen kann.",
            confirms: true,
          },
        ],
      },
      {
        title: "Gedächtnis",
        items: [
          {
            examples: ['"Ich mag Chrome lieber als Edge"', '"Ich wohne in Ahmedabad"'],
            description:
              "Merkt sich möglicherweise etwas, das du sagst, als dauerhaften Fakt und bringt es später zur Sprache — nur wenn es das eindeutig für sinnvoll hält, nicht durch passives Mitschneiden.",
          },
        ],
      },
    ],
  },
  portal: {
    cards: [
      {
        title: "Apps",
        examples: '"Öffne Chrome" · "Schließe Spotify"',
        description: "Startet freigegebene Apps. Schließen oder Hinzufügen einer neuen App wird vorher bestätigt.",
      },
      {
        title: "Medien & Erinnerungen",
        examples: '"Pausier die Musik" · "Erinnere mich in 20 Min."',
        description: "Systemweite Wiedergabesteuerung und lokale Desktop-Benachrichtigungen.",
      },
      {
        title: "Kontextbewusst",
        examples: '"Beschreib meinen Bildschirm"',
        description: "Liest deine Zwischenablage oder analysiert deinen Hauptmonitor — fragt vorher um Bestätigung.",
      },
      {
        title: "Suche & Gedächtnis",
        examples: '"Suche nach Pizza" · "Ich mag Ubuntu"',
        description: "Öffnet Websuchen in deinem Browser und merkt sich dauerhafte Fakten, die du ihm erzählst.",
      },
    ],
  },
  automation: {
    heading: "Wird erledigt",
    starting: "Schaut sich deinen Bildschirm an…",
    stop: "Stopp",
  },
};
