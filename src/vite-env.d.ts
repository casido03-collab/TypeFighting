/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
  readonly VITE_TELEGRAM_APP_SHORT_NAME?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ALLOW_BROWSER_API_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
