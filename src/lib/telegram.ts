type TelegramHapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft";

type TelegramThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
};

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
    start_param?: string;
  };
  colorScheme?: "light" | "dark";
  themeParams?: TelegramThemeParams;
  viewportHeight?: number;
  viewportStableHeight?: number;
  ready: () => void;
  expand: () => void;
  close: () => void;
  onEvent: (eventType: string, callback: () => void) => void;
  offEvent: (eventType: string, callback: () => void) => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred: (style: TelegramHapticStyle) => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

function getWebApp() {
  return window.Telegram?.WebApp;
}

function getUrlStartParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get("startapp") || params.get("tgWebAppStartParam") || "";
}

function setViewportVars() {
  const webApp = getWebApp();
  const viewportHeight = webApp?.viewportHeight || window.innerHeight;
  const stableHeight = webApp?.viewportStableHeight || viewportHeight;
  const visualHeight = window.visualViewport?.height || viewportHeight;
  const appHeight = Math.min(viewportHeight, visualHeight);

  document.documentElement.style.setProperty("--tg-viewport-height", `${viewportHeight}px`);
  document.documentElement.style.setProperty("--tg-viewport-stable-height", `${stableHeight}px`);
  document.documentElement.style.setProperty("--tk-app-height", `${appHeight}px`);
}

function setThemeVars() {
  const theme = getWebApp()?.themeParams;
  if (!theme) return;

  const root = document.documentElement;
  if (theme.bg_color) root.style.setProperty("--tg-theme-bg-color", theme.bg_color);
  if (theme.text_color) root.style.setProperty("--tg-theme-text-color", theme.text_color);
  if (theme.button_color) root.style.setProperty("--tg-theme-button-color", theme.button_color);
  if (theme.button_text_color) {
    root.style.setProperty("--tg-theme-button-text-color", theme.button_text_color);
  }
}

export const telegram = {
  get webApp() {
    return getWebApp();
  },

  get isAvailable() {
    return Boolean(getWebApp());
  },

  get initData() {
    return getWebApp()?.initData || "";
  },

  get user() {
    return getWebApp()?.initDataUnsafe?.user || null;
  },

  get startParam() {
    return getWebApp()?.initDataUnsafe?.start_param || getUrlStartParam();
  },

  init() {
    const webApp = getWebApp();
    setViewportVars();
    setThemeVars();

    if (!webApp) {
      window.addEventListener("resize", setViewportVars);
      window.visualViewport?.addEventListener("resize", setViewportVars);
      return () => {
        window.removeEventListener("resize", setViewportVars);
        window.visualViewport?.removeEventListener("resize", setViewportVars);
      };
    }

    webApp.ready();
    webApp.expand();
    webApp.onEvent("viewportChanged", setViewportVars);
    webApp.onEvent("themeChanged", setThemeVars);
    window.visualViewport?.addEventListener("resize", setViewportVars);

    return () => {
      webApp.offEvent("viewportChanged", setViewportVars);
      webApp.offEvent("themeChanged", setThemeVars);
      window.visualViewport?.removeEventListener("resize", setViewportVars);
    };
  },

  impact(style: TelegramHapticStyle = "light") {
    getWebApp()?.HapticFeedback?.impactOccurred(style);
  },

  notify(type: "error" | "success" | "warning") {
    getWebApp()?.HapticFeedback?.notificationOccurred(type);
  },

  showBackButton(callback: () => void) {
    const backButton = getWebApp()?.BackButton;
    if (!backButton) return () => {};

    backButton.show();
    backButton.onClick(callback);

    return () => {
      backButton.offClick(callback);
      backButton.hide();
    };
  },

  onClose(callback: () => void) {
    const webApp = getWebApp();
    if (!webApp) return () => {};

    webApp.onEvent("close", callback);

    return () => webApp.offEvent("close", callback);
  },
};
