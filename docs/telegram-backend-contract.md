# Telegram Mini App Backend Contract

The Mini App sends Telegram `initData` in the `X-Telegram-Init-Data` header.
The backend must validate this value with the bot token before trusting `telegram_id`.

## Environment

- `VITE_TELEGRAM_BOT_USERNAME`: Telegram bot username without `@`.
- `VITE_API_BASE_URL`: HTTPS API base URL, for example `https://api.example.com`.

## Auth Rules

- Every server endpoint used by the Mini App should validate `X-Telegram-Init-Data`.
- The backend maps `telegram_id` to an internal player id.
- Client-side values for rating, HP, damage, winner, and energy are fallback/UI values only.
- Server state is the source of truth in real PvP.

## Session

### `POST /telegram/session`

Creates or refreshes the current Mini App player session.

Response:

```json
{
  "player": {
    "id": "123456789",
    "name": "Case",
    "league": "Silver League",
    "leagueCode": "SILVER II",
    "rank": 24,
    "score": 2880,
    "nextLeague": "GOLD LEAGUE",
    "nextScore": 3000,
    "wins": 71,
    "losses": 29,
    "winRate": "71%",
    "bestCombo": 12,
    "wpm": 288,
    "streak": 5,
    "invited": 8
  },
  "energy": {
    "value": 50,
    "date": "2026-05-16"
  },
  "serverTime": "2026-05-16T10:00:00.000Z"
}
```

### `GET /player`

Returns the latest player and energy state after the player returns to the app.

```json
{
  "player": {},
  "energy": {
    "value": 49,
    "date": "2026-05-16"
  }
}
```

## Rating

### `GET /leaderboard?period=today|week`

```json
{
  "period": "week",
  "leaders": [],
  "playerRank": 24
}
```

## Startapp

### `POST /duels`

Creates an invite for a friend duel.

```json
{
  "duelId": "duel_AB12CD",
  "startParam": "duel_AB12CD",
  "expiresAt": "2026-05-16T10:10:00.000Z"
}
```

### `POST /duels/:duelId/join`

Joins a duel when the Mini App is opened with `startapp=duel_...`.

```json
{
  "status": "joined",
  "battleId": "battle_AB12CD",
  "opponent": {
    "id": "987654321",
    "name": "Blade",
    "league": "SILVER II",
    "wpm": 280
  }
}
```

Allowed `status` values: `joined`, `expired`, `not_found`, `full`.

### `POST /referrals`

Applies a referral entry when the Mini App is opened with `startapp=ref_...`.

Body:

```json
{
  "referralCode": "CASE"
}
```

Response:

```json
{
  "accepted": true,
  "invitedBy": "CASE",
  "message": "Referral accepted."
}
```

## Matchmaking

### `POST /matchmaking`

The server should hold the matchmaking request for up to `20` seconds.
The client timeout is `22` seconds to avoid cutting off a normal server-side search.

If an opponent is found, return `matched` and a `battleId`.
The client starts an online battle immediately.

```json
{
  "status": "matched",
  "battleId": "battle_AB12CD",
  "opponent": {
    "id": "987654321",
    "name": "Blade",
    "league": "SILVER II",
    "wpm": 280
  }
}
```

If the server does not keep the long-poll request open, it may return `queued`.

```json
{
  "status": "queued",
  "estimatedWaitMs": 3000
}
```

If no opponent is found within `20` seconds, return `unavailable`.

```json
{
  "status": "unavailable",
  "message": "Try again."
}
```

## PvP Battle

### `GET /battles/:battleId`

Returns the current server-authoritative PvP battle state.

```json
{
  "battleId": "battle_AB12CD",
  "status": "active",
  "maxHp": 120,
  "round": 3,
  "wordLength": 6,
  "availableLetters": ["m", "o", "l", "n", "i", "a"],
  "player": {
    "id": "123456789",
    "name": "Case",
    "hp": 105,
    "word": "molnia",
    "typedCount": 2
  },
  "opponent": {
    "id": "987654321",
    "name": "Blade",
    "hp": 90,
    "word": "pobeda",
    "typedCount": 4
  },
  "serverTime": "2026-05-16T10:00:00.000Z",
  "winnerId": "123456789"
}
```

Allowed `status` values: `waiting`, `active`, `finished`, `cancelled`.

Word rules:

- The server is the source of truth for both players' words.
- `player.word` is the current word for the authenticated player.
- `opponent.word` is the opponent's current word.
- Both words in the same round must have the same number of letters.
- `wordLength` must match both word lengths.
- `round` increments when the server issues a new pair of words.
- The client resets local typed text when `player.word` changes.
- `availableLetters` is optional and can later be used for keyboard hints or anti-cheat.

### `POST /battles/:battleId/words`

Submits a correctly typed word.

Body:

```json
{
  "word": "molnia",
  "round": 3
}
```

Response:

```json
{
  "accepted": true,
  "damage": 15,
  "combo": 3,
  "outcome": "hit",
  "rejectionReason": null,
  "state": {
    "battleId": "battle_AB12CD",
    "status": "active",
    "maxHp": 120,
    "round": 4,
    "wordLength": 5,
    "player": {},
    "opponent": {},
    "serverTime": "2026-05-16T10:00:01.000Z"
  },
  "nextWord": "burya"
}
```

Damage and validation rules:

- The server is the source of truth for damage, HP, combo, and winner.
- The client must not reduce HP locally in PvP.
- If `accepted` is `false`, the client shows a wrong-word state and does not animate a hit.
- If `accepted` is `true`, the client applies `state`, uses `combo` if provided, and animates a hit.
- Allowed `outcome` values: `hit`, `rejected`, `finished`.
- Allowed `rejectionReason` values: `wrong_word`, `too_fast`, `stale_round`, `battle_finished`.
- The server must reject stale rounds and suspiciously fast submissions.
- When the battle ends, `state.status` must be `finished` and `winnerId` must be present.

### `POST /battles/:battleId/typing`

Updates player typing progress so the opponent can see filled letters in near real time.

Body:

```json
{
  "typedCount": 3
}
```

Response:

```json
{
  "accepted": true,
  "state": {
    "battleId": "battle_AB12CD",
    "status": "active",
    "maxHp": 120,
    "player": {},
    "opponent": {},
    "serverTime": "2026-05-16T10:00:01.000Z"
  }
}
```

The client throttles typing progress updates to roughly `120ms`.
The server should clamp `typedCount` between `0` and the current word length.

### `POST /battles/:battleId/leave`

Called when a player goes back, leaves the battle, or closes the Telegram Mini App.
The server decides whether this is a loss, cancellation, or technical leave.
The client sends this request with browser `keepalive` where available, so the backend should keep the endpoint lightweight.

### `POST /battles`

Stores the result of a completed battle and returns updated player progress and energy.

Body:

```json
{
  "mode": "online",
  "outcome": "win",
  "combo": 5,
  "playerHp": 30,
  "enemyHp": 0,
  "wordsCompleted": 8,
  "durationMs": 74200,
  "finishedAt": "2026-05-16T10:00:00.000Z"
}
```

Response:

```json
{
  "accepted": true,
  "energySpent": 1,
  "player": {},
  "energy": {
    "value": 49,
    "date": "2026-05-16"
  }
}
```

## Energy Rules

- Maximum energy: `50`.
- Energy refills to `50` once per day.
- Searching for an opponent does not spend energy.
- One completed PvP battle spends `1` energy regardless of win or loss.
- AI battle and friend duel currently do not spend energy.
- The server spends energy only after a completed PvP battle.
- The server returns the latest `energy` in the `POST /battles` response.
- The client must not treat local energy as the source of truth in PvP.

## Telegram Bot Notes

- The bot button should open the Mini App Web App URL.
- Duel and referral scenarios are passed via `startapp`.
- Use `startapp=duel_...` for friend duels.
- Use `startapp=ref_...` for referrals.
- The server stores the `telegram_id -> player_id` mapping.
- Any game changes that affect rating or energy must be confirmed by the server.
