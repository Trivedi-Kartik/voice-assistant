import type { Dictionary } from "../types";

export const pt: Dictionary = {
  app: {
    loading: "Carregando…",
    whatCanIAsk: "O que posso perguntar?",
    settingsLink: "Configurações",
    micBlocked: "O acesso ao microfone está bloqueado.",
    openMicSettings: "Abrir configurações de microfone do Windows",
  },
  orbLabels: {
    idle: "Pressione Ctrl+Shift+Space para falar",
    listening: "Ouvindo…",
    thinking: "Pensando…",
    speaking: "Falando…",
  },
  micButton: {
    startTalking: "Começar a falar",
    stopTalking: "Parar de falar",
  },
  statusIndicator: {
    idle: "Não conectado",
    connecting: "Conectando…",
    connected: "Conectado",
    reconnecting: "Reconectando…",
    error: "Conexão perdida",
    retryConnection: "Tentar novamente",
  },
  login: {
    subtitle: "Entre para falar com seu assistente.",
    logInTab: "Entrar",
    signUpTab: "Cadastrar-se",
    emailLabel: "E-mail",
    emailPlaceholder: "voce@exemplo.com",
    passwordLabel: "Senha",
    passwordPlaceholder: "Mínimo de 8 caracteres",
    genericError: "Algo deu errado — tente novamente.",
    pleaseWait: "Aguarde…",
    needAccount: "Não tem uma conta? ",
    alreadyHaveAccount: "Já tem uma conta? ",
  },
  consent: {
    heading: "Antes de começar",
    bullets: [
      "Quando você pressiona o atalho e fala, seu áudio é enviado ao nosso servidor e processado pelo Groq para transcrever e entender o que você disse.",
      'Este app pode realizar ações reais no seu computador em seu nome — abrir e fechar aplicativos, controlar a reprodução de mídia, criar lembretes, fazer buscas na web e abrir URLs — apenas a partir de uma lista fixa e segura que o assistente tem permissão para usar. Ações arriscadas (fechar um app) ou que possam expor algo privado (ler sua área de transferência, tirar um print da tela) sempre pedem confirmação em voz alta primeiro — basta dizer "sim" na sua próxima vez para permitir, ou qualquer outra coisa para cancelar.',
      "Se você confirmar um print, uma imagem da sua tela naquele momento é enviada a um modelo de IA na nuvem para ser descrita de volta para você — mais sensível do que qualquer outra coisa que este app compartilha, por isso nunca é feito sem pedir confirmação antes.",
      'Você pode pedir para adicionar seus próprios aplicativos a essa lista (por exemplo, "adicionar o Photoshop como um app que eu posso abrir") — ele sempre pede sua confirmação primeiro, e você sempre escolhe o programa em um seletor de arquivos; nada é adicionado automaticamente.',
      "Esta é uma versão beta inicial. Algumas coisas podem não funcionar direito, e o assistente pode, às vezes, entender errado o que você disse.",
    ],
    accept: "Entendi, continuar",
    privacyPolicyLink: "Leia nossa Política de Privacidade",
  },
  settings: {
    heading: "Configurações",
    languageTitle: "Idioma",
    languageHint:
      "Define o idioma em que o Karvix ouve, fala e exibe este app. Limitado aos idiomas em que nosso modelo de IA é oficialmente validado — uma lista mais ampla poderia entender errado o que você pede, sem perceber.",
    languageLabel: "Idioma",
    languageError: "Não foi possível salvar isso — tente novamente.",
    groqKeyTitle: "Chave de API do Groq",
    groqKeyHint: "Atingiu o limite gratuito de hoje? Adicione sua própria chave gratuita do Groq (console.groq.com) para remover o limite diário completamente.",
    groqKeyLabel: "Chave de API",
    saving: "Salvando…",
    saveKey: "Salvar chave",
    groqKeySaved: "Salvo — o limite diário não se aplica mais.",
    groqKeyError: "Não foi possível salvar essa chave — tente novamente.",
    myAppsTitle: "Meus apps",
    myAppsHint: 'Apps que você adicionou pedindo ao Karvix (por exemplo, "adicionar o Photoshop como um app que eu posso abrir"). Somente neste dispositivo.',
    remove: "Remover",
    noneAddedYet: "Nenhum adicionado ainda.",
    privacyPolicyLink: "Política de Privacidade",
    close: "Fechar",
  },
  help: {
    heading: "O que o Karvix pode fazer?",
    introBeforeHotkey: "Pressione ",
    introAfterHotkey: " de qualquer lugar — sem precisar abrir esta janela — diga o que você quer, depois pressione de novo para parar.",
    confirmsFirst: "Confirma antes",
    footerHint:
      "Por enquanto, apenas no Windows. Os prints só capturam o monitor principal. Lembretes e fatos memorizados ainda não sincronizam entre dispositivos.",
    close: "Fechar",
    groups: [
      {
        title: "Apps",
        items: [
          {
            examples: ['"Abrir o Chrome"', '"Abrir a câmera"', '"Abrir o explorador de arquivos"'],
            description:
              "Abre um app de uma lista fixa e segura — navegadores, editores, Office, mídia, apps de chat e ferramentas comuns do sistema.",
          },
          {
            examples: ['"Fechar o Chrome"', '"Fechar o Spotify"'],
            description: 'Fecha à força um app em execução dessa lista — diga "sim" na sua próxima vez para realmente fechá-lo.',
            confirms: true,
          },
          {
            examples: ['"Adicionar o Photoshop como um app que eu posso abrir"'],
            description:
              "Primeiro verifica seus apps instalados (também funciona com apps da Microsoft Store), ou abre um seletor de arquivos se não encontrar uma correspondência clara — nada é adicionado sem que você confirme ou selecione. Apps da Store só podem ser abertos assim, não fechados. Gerencie o que você adicionou em Configurações.",
            confirms: true,
          },
        ],
      },
      {
        title: "Mídia e lembretes",
        items: [
          {
            examples: ['"Pausar a música"', '"Aumentar o volume"', '"Pular essa música"'],
            description: "Controla o que estiver tocando no momento, não importa qual app está em foco.",
          },
          {
            examples: ['"Me lembre de ligar para minha mãe daqui a 20 minutos"'],
            description:
              'Dispara como uma notificação na área de trabalho depois desse tempo. Por enquanto, só aceita tempos relativos ("daqui a 20 minutos"), não horários fixos ("às 18h") — e precisa que o app esteja aberto para funcionar.',
          },
        ],
      },
      {
        title: "Web",
        items: [
          { examples: ['"Pesquisar a melhor pizza em Ahmedabad"'], description: "Abre uma busca na web no seu navegador padrão." },
          { examples: ['"Abrir example.com"'], description: "Abre uma URL específica no seu navegador padrão." },
        ],
      },
      {
        title: "Sensível à privacidade",
        items: [
          {
            examples: ['"O que tem na minha área de transferência?"'],
            description: "Lê o texto atual da sua área de transferência e compartilha com o assistente.",
            confirms: true,
          },
          {
            examples: ['"O que esse erro diz?"', '"Descreva o que tem na minha tela"'],
            description: "Tira um print do seu monitor principal e descreve para você — a coisa mais sensível que o Karvix pode acessar.",
            confirms: true,
          },
        ],
      },
      {
        title: "Memória",
        items: [
          {
            examples: ['"Eu prefiro o Chrome ao Edge"', '"Eu moro em Ahmedabad"'],
            description:
              "Pode guardar algo que você disser como um fato duradouro e trazer isso de volta depois — só quando decide que realmente vale a pena, sem ficar analisando tudo o que você fala.",
          },
        ],
      },
    ],
  },
  portal: {
    cards: [
      {
        title: "Apps",
        examples: '"Abrir o Chrome" · "Fechar o Spotify"',
        description: "Abre apps liberados. Fechar ou adicionar um novo pede confirmação antes.",
      },
      {
        title: "Mídia e lembretes",
        examples: '"Pausar a música" · "Me lembre em 20 min"',
        description: "Controle de reprodução em todo o sistema e notificações locais na área de trabalho.",
      },
      {
        title: "Consciente do contexto",
        examples: '"Descreva minha tela"',
        description: "Lê sua área de transferência ou analisa seu monitor principal — pede confirmação antes.",
      },
      {
        title: "Busca e memória",
        examples: '"Pesquisar pizza" · "Eu gosto do Ubuntu"',
        description: "Abre buscas na web no seu navegador e guarda fatos duradouros que você conta a ele.",
      },
    ],
  },
};
