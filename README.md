# Typing Kombat

React/Vite prototype for a Telegram Mini App typing fighting game.

## Run Locally

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:5173
```

On Windows PowerShell, if script execution blocks `npm run ...`, use:

```powershell
npm.cmd run dev
npm.cmd run build
```

## Environment

Copy `.env.example` to `.env` when connecting real services.

```txt
VITE_TELEGRAM_BOT_USERNAME=typing_kombat_bot
VITE_TELEGRAM_APP_SHORT_NAME=app
VITE_API_BASE_URL=
VITE_ALLOW_BROWSER_API_MOCK=false
```

- `VITE_TELEGRAM_BOT_USERNAME`: Telegram bot username without `@`.
- `VITE_TELEGRAM_APP_SHORT_NAME`: Mini App short name from BotFather, used in `https://t.me/<bot>/<short_name>?startapp=...` links.
- `VITE_API_BASE_URL`: HTTPS API base URL. Empty value keeps local fallback mode.
- `VITE_ALLOW_BROWSER_API_MOCK`: local-only switch that lets the browser call a mock API without Telegram `initData`.

## Local Startapp Testing

Telegram passes duel and referral entries through `startapp`.
For local browser checks, use query params:

```txt
http://localhost:5173/?startapp=duel_TEST
http://localhost:5173/?startapp=ref_CASE
```

## Current Frontend Features

- Main menu, AI battle, rating, profile.
- Adaptive Telegram Mini App viewport and safe-area layout.
- Energy UI with local fallback.
- Profile settings for sound, vibration, language.
- 50 local battle words from 3 to 6 letters.
- AI battle tempo calibration and typing-progress animation.
- Local fallback for matchmaking, duels, rating, and profile.
- Safe local storage fallback for energy, settings, history, and pending battle results.
- Telegram `startapp` handling for `duel_...` and `ref_...`.
- Telegram BackButton, close handling, and haptic feedback.
- API contracts for session, profile, rating, matchmaking, duels, referrals, battle state, battle words, typing progress, leave, and battle result.

## Backend Contract

See:

```txt
docs/telegram-backend-contract.md
docs/backend-integration-roadmap.md
docs/backend-database-schema.sql
docs/server-authoritative-pvp.md
docs/pvp-anti-cheat-rules.md
docs/telegram-bot-setup.md
docs/mobile-telegram-qa.md
docs/api-fixtures.md
```

Important server responsibilities:

- Validate Telegram `initData`.
- Treat server state as source of truth for PvP words, HP, damage, combo, winner, energy, and rating.
- Search matchmaking for up to 20 seconds.
- Return `matched` with `battleId` or `unavailable` if no opponent is found.
- Issue equal-length PvP words for both players.
- Reject wrong, stale, or suspiciously fast word submissions.
- Spend 1 energy only after a completed PvP battle.

## Project Structure

```txt
src/
  App.tsx
  components/
  config/
  data/
  lib/
  pages/
  styles/
vite.config.ts
```

## Build Check

```bash
npm run build
```

Validate API fixture JSON blocks:

```bash
npm run check:fixtures
```

Run the local mock API:

```bash
npm run mock:api
```

Then use this `.env` for browser testing:

```txt
VITE_API_BASE_URL=http://localhost:8787
VITE_ALLOW_BROWSER_API_MOCK=true
```

Keep `VITE_ALLOW_BROWSER_API_MOCK=false` for production.

Run mock API smoke checks:

```bash
npm run smoke:mock-api
```

## Git Notes

Commit source files, docs, `.env.example`, and config files.
Do not commit generated `dist/`, local `.env`, or `node_modules/`; they are ignored by `.gitignore`.
