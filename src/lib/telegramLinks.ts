import { appConfig } from "../config/appConfig";
import { normalizeStartAppParam } from "./startApp";

export function buildStartAppLink(startParam: string) {
  const safeParam = normalizeStartAppParam(startParam);
  const encodedParam = encodeURIComponent(safeParam);

  return `https://t.me/${appConfig.telegramBotUsername}/${appConfig.telegramAppShortName}?startapp=${encodedParam}`;
}

export function buildBotStartLink(startParam: string) {
  const safeParam = normalizeStartAppParam(startParam);
  const encodedParam = encodeURIComponent(safeParam);

  return `https://t.me/${appConfig.telegramBotUsername}?start=${encodedParam}`;
}
