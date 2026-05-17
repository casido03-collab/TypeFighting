import { PLAYER } from "../data/gameData";
import type { TelegramWebAppUser } from "./telegram";

export type PlayerProfile = typeof PLAYER & {
  id?: string;
  telegramUsername?: string;
  photoUrl?: string;
  languageCode?: string;
};

function getTelegramDisplayName(user: TelegramWebAppUser) {
  if (user.first_name) {
    return user.first_name;
  }

  if (user.username) {
    return user.username;
  }

  return PLAYER.name;
}

export function createPlayerProfile(user: TelegramWebAppUser | null): PlayerProfile {
  if (!user) {
    return { ...PLAYER };
  }

  return {
    ...PLAYER,
    id: String(user.id),
    name: getTelegramDisplayName(user),
    telegramUsername: user.username,
    photoUrl: user.photo_url,
    languageCode: user.language_code,
  };
}
