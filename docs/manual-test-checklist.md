# Manual Test Checklist

Use this checklist before connecting the real Telegram bot/backend.

## Local Browser

- App opens at `http://localhost:5173`.
- Main screen fits without clipped buttons.
- Failed local opponent search shows "Try again" banner under the hero card and moves lower buttons down.
- Energy badge opens the info banner and closes correctly.
- Duel invite modal fits on a small mobile viewport.
- Duel invite copy button changes to "Copied" and resets.
- Duel invite share button uses native share or copy fallback.
- Referral modal fits on a small mobile viewport.
- Referral copy/share buttons give visible feedback.
- AI battle starts and can be completed.
- AI battle clears typed text after opponent hit.
- AI and player words have matching length in battle.
- Typing progress appears under both fighters.
- Rating screen has no top black/white strip.
- Profile screen has no top black/white strip.
- Profile sound, vibration, and language controls toggle and persist.

## Responsive

- Use `docs/mobile-telegram-qa.md` for the full device and Telegram WebView checklist.
- Main, Battle, Rating, Profile fit on a narrow mobile viewport.
- Bottom navigation stays visible and does not overlap content.
- Battle keyboard area does not crush the arena on short screens.
- Safe-area padding works on tall and short mobile layouts.

## Telegram Mini App

- `viewport-fit=cover` is active.
- Telegram viewport variables update layout height.
- Local URL `?startapp=duel_TEST` is parsed as a duel fallback.
- Local URL `?startapp=ref_CASE` is parsed as a referral fallback.
- Empty or invalid `duel_` / `ref_` start params do not trigger broken flows.
- BackButton appears outside the main screen.
- BackButton returns from Rating/Profile/Battle to Main.
- Closing Mini App during live battle calls leave endpoint.
- Haptic feedback does not break browser fallback.

## API Fallbacks

- Empty `VITE_API_BASE_URL` keeps local fallback mode.
- `npm run mock:api` starts local server checks at `http://localhost:8787`.
- `npm run smoke:mock-api` validates the local mock API contract.
- `VITE_ALLOW_BROWSER_API_MOCK=true` lets the browser call the mock API without Telegram `initData`.
- Matchmaking fallback waits roughly 2 seconds and shows retry message.
- Rating fallback uses local leaders.
- Duel invite fallback still creates a Telegram startapp link.
- Local storage unavailable does not crash energy, settings, or battle result fallback.
- Corrupted local battle history/pending result entries are ignored.

## Server Mode Later

- Follow `docs/backend-integration-roadmap.md` phase order.
- Use `docs/api-fixtures.md` as reference data for mock backend checks.
- `POST /telegram/session` loads player and energy.
- `POST /matchmaking` waits up to 20 seconds.
- `matched` starts online battle with `battleId`.
- `matched` without `battleId` shows a retry message and does not open a broken battle.
- Joined duel without `battleId` shows a retry message and does not open a broken battle.
- `unavailable` shows retry message.
- `GET /battles/:battleId` updates HP, words, and typed progress.
- Server returns same-length `player.word` and `opponent.word` for every PvP round.
- Client shows a soft battle error instead of playing if battle state is incomplete or unfair.
- `POST /battles/:battleId/words` applies server damage/combo/outcome.
- `POST /battles/:battleId/typing` updates opponent-visible progress.
- `finished` shows victory/defeat using `winnerId`.
- `POST /battles/:battleId/leave` is sent once on exit.
- Battle leave request uses browser keepalive during close/pagehide.
- Finished server battle overlay returns to menu instead of restarting the old battle id.
- `POST /battles` returns updated player progress and energy after completed PvP.
