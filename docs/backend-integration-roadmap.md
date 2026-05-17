# Backend Integration Roadmap

This roadmap is the practical order for connecting the Mini App to a real Telegram bot and API.

## Phase 1: Bot And Web App Entry

Goal: open the Mini App from Telegram and trust user identity on the backend.

Use `docs/telegram-bot-setup.md` for BotFather, env, and launch checks.

- Create the Telegram bot through BotFather.
- Set the Mini App Web App URL after the frontend is deployed over HTTPS.
- Configure production frontend env:
  - `VITE_TELEGRAM_BOT_USERNAME`
  - `VITE_API_BASE_URL`
- Backend validates `X-Telegram-Init-Data` on every API request.
- Backend creates or finds player by `telegram_id`.
- Implement `POST /telegram/session`.

Frontend checks:

- Mini App opens inside Telegram.
- User profile uses Telegram user data.
- Local browser still works when `VITE_API_BASE_URL` is empty.

## Phase 2: Player State And Rating

Goal: move profile, energy, and leaderboard from local fallback to server data.

- Implement `GET /player`.
- Implement `GET /leaderboard?period=today|week`.
- Store player stats:
  - wins
  - losses
  - win rate
  - best combo
  - WPM
  - league/rank
  - invited count
- Store energy:
  - max `50`
  - refill to `50` once per day

Frontend checks:

- Profile shows server data after reload.
- Rating switches between today/week.
- Energy badge shows server energy when API is connected.

## Phase 3: Referrals And Friend Duels

Goal: make `startapp=ref_...` and `startapp=duel_...` useful.

- Implement `POST /referrals`.
- Implement `POST /duels`.
- Implement `POST /duels/:duelId/join`.
- Store duel invite:
  - duel id
  - creator player id
  - expiration time
  - joined player id
  - created battle id
- Reject expired, missing, or full duels.

Frontend checks:

- Referral link opens Mini App and applies referral.
- Friend duel link opens Mini App and joins the duel.
- Joined duel without `battleId` shows retry and does not open a broken battle.

## Phase 4: Matchmaking

Goal: make "Find Opponent" search for a real player.

- Implement `POST /matchmaking`.
- Hold request for up to `20` seconds.
- Return `matched` with `battleId` if opponent is found.
- Return `unavailable` if no opponent is found.
- Optional: return `queued` only if the backend chooses not to hold long-polling.

Frontend checks:

- Search waits for server response.
- `matched` starts online battle.
- `unavailable` shows retry message.
- `matched` without `battleId` shows retry and does not open a broken battle.

## Phase 5: Server-Authoritative PvP

Goal: make battle fair and impossible to cheat from the client.

Use `docs/server-authoritative-pvp.md` as the implementation flow.
Use `docs/pvp-anti-cheat-rules.md` for validation and suspicious input handling.

- Implement `GET /battles/:battleId`.
- Implement `POST /battles/:battleId/words`.
- Implement `POST /battles/:battleId/typing`.
- Implement `POST /battles/:battleId/leave`.
- Server owns:
  - current words
  - round number
  - HP
  - damage
  - combo
  - winner
  - finish/cancel state
- Server must issue same-length words for both players.
- Server must reject:
  - wrong word
  - stale round
  - suspiciously fast submit
  - submit after battle finished

Frontend checks:

- Filled letters update for both players.
- HP changes only from server state.
- Finished battle shows winner by `winnerId`.
- Leaving battle sends `leave` once.
- Closing Telegram Mini App sends lightweight `leave` request.

## Phase 6: Result Persistence And Energy

Goal: save battle result and spend energy correctly.

- Implement `POST /battles`.
- Spend `1` energy only after completed PvP.
- Do not spend energy on:
  - search attempt
  - AI battle
  - friend duel for now
- Return updated player and energy.
- Update rating after accepted result.

Frontend checks:

- Completed PvP reduces energy by `1`.
- Failed search does not reduce energy.
- AI battle does not reduce energy.
- Offline/pending results sync when API becomes available.

## Suggested Backend Data Tables

Use `docs/backend-database-schema.sql` as the first PostgreSQL schema draft.

Core tables:

- `players`
- `player_stats`
- `player_energy`
- `referrals`
- `duel_invites`
- `matchmaking_queue`
- `battles`
- `battle_players`
- `battle_rounds`
- `battle_events`

## Minimal First Server Milestone

For the first real Telegram test, implement only:

- `POST /telegram/session`
- `GET /player`
- `GET /leaderboard`
- `POST /referrals`

After that, add:

- `POST /duels`
- `POST /duels/:duelId/join`

Then move to:

- `POST /matchmaking`
- live PvP battle endpoints
