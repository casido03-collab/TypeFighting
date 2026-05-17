function normalizeBotUsername(username: string) {
  return username.replace(/^@/, "").trim();
}

function normalizeTelegramAppShortName(shortName: string) {
  return shortName.replace(/^\/+|\/+$/g, "").trim();
}

const telegramBotUsername = normalizeBotUsername(
  import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "typing_kombat_bot"
);
const telegramAppShortName = normalizeTelegramAppShortName(
  import.meta.env.VITE_TELEGRAM_APP_SHORT_NAME || "app"
);

export const appConfig = {
  telegramBotUsername: telegramBotUsername || "typing_kombat_bot",
  telegramAppShortName: telegramAppShortName || "app",
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, ""),
  allowBrowserApiMock: import.meta.env.VITE_ALLOW_BROWSER_API_MOCK === "true",
};
