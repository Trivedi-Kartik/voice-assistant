import type { Dictionary } from "../types";

export const es: Dictionary = {
  app: {
    loading: "Cargando…",
    whatCanIAsk: "¿Qué puedo preguntar?",
    settingsLink: "Configuración",
    micBlocked: "El acceso al micrófono está bloqueado.",
    openMicSettings: "Abrir la configuración de micrófono de Windows",
  },
  orbLabels: {
    idle: "Presiona Ctrl+Shift+Espacio para hablar",
    listening: "Escuchando…",
    thinking: "Pensando…",
    speaking: "Hablando…",
  },
  micButton: {
    startTalking: "Empezar a hablar",
    stopTalking: "Dejar de hablar",
  },
  statusIndicator: {
    idle: "Sin conexión",
    connecting: "Conectando…",
    connected: "Conectado",
    reconnecting: "Reconectando…",
    error: "Se perdió la conexión",
    retryConnection: "Reintentar conexión",
  },
  login: {
    subtitle: "Inicia sesión para hablar con tu asistente.",
    logInTab: "Iniciar sesión",
    signUpTab: "Registrarse",
    emailLabel: "Correo electrónico",
    emailPlaceholder: "tu@ejemplo.com",
    passwordLabel: "Contraseña",
    passwordPlaceholder: "Mínimo 8 caracteres",
    genericError: "Algo salió mal — inténtalo de nuevo.",
    pleaseWait: "Un momento…",
    needAccount: "¿No tienes una cuenta? ",
    alreadyHaveAccount: "¿Ya tienes una cuenta? ",
  },
  consent: {
    heading: "Antes de empezar",
    bullets: [
      "Cuando presionas la tecla rápida y hablas, tu audio se envía a nuestro servidor y se procesa mediante Groq para transcribirlo y entenderlo.",
      'Esta app puede realizar acciones reales en tu computadora en tu nombre — abrir y cerrar aplicaciones, controlar la reproducción multimedia, poner recordatorios, hacer búsquedas web y abrir URLs — solo desde una lista fija y segura que tu asistente puede usar. Las acciones riesgosas (cerrar una app) o que podrían exponer algo privado (leer tu portapapeles, tomar una captura de pantalla) siempre te piden confirmación en voz alta antes de hacerlas — basta con decir "sí" en tu siguiente turno para permitirlo, o cualquier otra cosa para cancelar.',
      "Si confirmas una captura de pantalla, se envía una imagen de tu pantalla en ese momento a un modelo de IA en la nube para que te la describa — es lo más sensible que esta app comparte, por eso nunca se hace sin preguntarte antes.",
      'Puedes pedirle que agregue tus propias apps a esa lista (por ejemplo, "agrega Photoshop como una app que pueda abrir") — siempre te pide confirmar primero, y tú siempre eliges el programa exacto en un selector de archivos; nada se agrega nunca de forma automática.',
      "Esta es una beta temprana. Puede que algo falle, y el asistente a veces puede malentenderte.",
    ],
    accept: "Entendido, continuar",
    privacyPolicyLink: "Lee nuestra Política de Privacidad",
  },
  settings: {
    heading: "Configuración",
    languageTitle: "Idioma",
    languageHint:
      "Define el idioma en el que Karvix escucha, habla y muestra esta app. Está limitado a los idiomas en los que nuestro modelo de IA está oficialmente validado — una lista más amplia arriesgaría malentender en silencio lo que pides.",
    languageLabel: "Idioma",
    languageError: "No se pudo guardar eso — inténtalo de nuevo.",
    groqKeyTitle: "Clave de API de Groq",
    groqKeyHint:
      "¿Llegaste al límite gratuito de hoy? Agrega tu propia clave gratuita de Groq (console.groq.com) para eliminar por completo el límite diario.",
    groqKeyLabel: "Clave de API",
    saving: "Guardando…",
    saveKey: "Guardar clave",
    groqKeySaved: "Guardado — el límite diario ya no aplica.",
    groqKeyError: "No se pudo guardar esa clave — inténtalo de nuevo.",
    myAppsTitle: "Mis apps",
    myAppsHint:
      'Apps que agregaste pidiéndoselo a Karvix (por ejemplo, "agrega Photoshop como una app que pueda abrir"). Solo en este dispositivo.',
    remove: "Quitar",
    noneAddedYet: "Todavía no has agregado ninguna.",
    privacyPolicyLink: "Política de Privacidad",
    close: "Cerrar",
  },
  help: {
    heading: "¿Qué puede hacer Karvix?",
    introBeforeHotkey: "Presiona ",
    introAfterHotkey:
      " desde cualquier lugar — sin necesidad de cambiar a esta ventana — di lo que quieres, y presiónala de nuevo para detenerte.",
    confirmsFirst: "Pide confirmación antes",
    footerHint:
      "Por ahora solo en Windows. Las capturas de pantalla solo ven tu monitor principal. Los recordatorios y los datos recordados todavía no se sincronizan entre dispositivos.",
    close: "Cerrar",
    groups: [
      {
        title: "Apps",
        items: [
          {
            examples: ['"Abre Chrome"', '"Abre la cámara"', '"Abre el explorador de archivos"'],
            description:
              "Abre una app de una lista fija y segura — navegadores, editores, Office, aplicaciones multimedia, apps de chat y herramientas comunes del sistema.",
          },
          {
            examples: ['"Cierra Chrome"', '"Cierra Spotify"'],
            description:
              'Fuerza el cierre de una app en ejecución de esa lista — di "sí" en tu siguiente turno para cerrarla de verdad.',
            confirms: true,
          },
          {
            examples: ['"Agrega Photoshop como una app que pueda abrir"'],
            description:
              "Primero revisa tus apps instaladas (también funciona con apps de Microsoft Store), o abre un selector de archivos si no encuentra una coincidencia clara — nunca se agrega nada sin que lo confirmes o lo selecciones tú. Las apps de la tienda solo se pueden abrir así, no cerrar. Administra lo que has agregado en Configuración.",
            confirms: true,
          },
        ],
      },
      {
        title: "Multimedia y recordatorios",
        items: [
          {
            examples: ['"Pausa la música"', '"Sube el volumen"', '"Salta esta canción"'],
            description: "Controla lo que sea que esté sonando en ese momento, sin importar qué app tenga el foco.",
          },
          {
            examples: ['"Recuérdame llamar a mamá en 20 minutos"'],
            description:
              'Aparece como una notificación de escritorio después de ese tiempo. Por ahora solo admite plazos relativos ("en 20 minutos"), no horas exactas ("a las 6pm") — y necesita que la app esté abierta para activarse.',
          },
        ],
      },
      {
        title: "Web",
        items: [
          {
            examples: ['"Busca la mejor pizza en Ahmedabad"'],
            description: "Abre una búsqueda web en tu navegador predeterminado.",
          },
          { examples: ['"Abre ejemplo.com"'], description: "Abre una URL específica en tu navegador predeterminado." },
        ],
      },
      {
        title: "Datos sensibles",
        items: [
          {
            examples: ['"¿Qué tengo copiado?"'],
            description: "Lee el texto que tienes copiado en el portapapeles y lo comparte con el asistente.",
            confirms: true,
          },
          {
            examples: ['"¿Qué dice este error?"', '"Describe lo que hay en mi pantalla"'],
            description:
              "Toma una captura de tu monitor principal y te la describe — lo más sensible a lo que Karvix puede acceder.",
            confirms: true,
          },
        ],
      },
      {
        title: "Memoria",
        items: [
          {
            examples: ['"Prefiero Chrome antes que Edge"', '"Vivo en Ahmedabad"'],
            description:
              "Puede recordar algo que dices como un dato duradero y mencionarlo más adelante — solo cuando decide que claramente vale la pena, no como un escaneo pasivo de todo lo que dices.",
          },
        ],
      },
    ],
  },
  portal: {
    cards: [
      {
        title: "Apps",
        examples: '"Abre Chrome" · "Cierra Spotify"',
        description: "Abre apps de la lista permitida. Cerrar o agregar una nueva siempre te lo confirma antes.",
      },
      {
        title: "Multimedia y recordatorios",
        examples: '"Pausa la música" · "Recuérdame en 20m"',
        description: "Controles de reproducción para todo el sistema y notificaciones locales de escritorio.",
      },
      {
        title: "Consciente del contexto",
        examples: '"Describe mi pantalla"',
        description: "Lee tu portapapeles o analiza tu monitor principal — siempre pide confirmación antes.",
      },
      {
        title: "Búsqueda y memoria",
        examples: '"Busca pizza" · "Me gusta Ubuntu"',
        description: "Abre búsquedas web en tu navegador y recuerda los datos duraderos que le cuentes.",
      },
    ],
  },
};
