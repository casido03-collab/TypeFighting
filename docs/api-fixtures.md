# API Fixtures

Use these fixtures as reference responses while building or mocking the backend.

## `POST /telegram/session`

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
  "settings": {
    "soundEnabled": true,
    "vibrationEnabled": true,
    "language": "RU"
  },
  "serverTime": "2026-05-16T10:00:00.000Z"
}
```

## `GET /leaderboard?period=week`

```json
{
  "period": "week",
  "playerRank": 24,
  "leaders": [
    {
      "rank": 1,
      "name": "SHADOW",
      "league": "MYTHIC",
      "wpm": 412,
      "wins": "98%",
      "streak": 12,
      "color": "#a855f7"
    },
    {
      "rank": 24,
      "name": "CASE D",
      "league": "SILVER II",
      "wpm": 288,
      "wins": "71%",
      "streak": 5,
      "color": "#fde047",
      "me": true
    }
  ]
}
```

## `POST /matchmaking` Matched

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

## `POST /matchmaking` Unavailable

```json
{
  "status": "unavailable",
  "message": "Попробуйте еще раз!"
}
```

## `POST /duels`

```json
{
  "duelId": "duel_AB12CD",
  "startParam": "duel_AB12CD",
  "expiresAt": "2026-05-16T10:10:00.000Z"
}
```

## `POST /duels/:duelId/join`

```json
{
  "status": "joined",
  "battleId": "battle_FRIEND1",
  "opponent": {
    "id": "987654321",
    "name": "Blade",
    "league": "SILVER II",
    "wpm": 280
  }
}
```

## `GET /battles/:battleId`

```json
{
  "battleId": "battle_AB12CD",
  "status": "active",
  "maxHp": 120,
  "round": 3,
  "wordLength": 6,
  "availableLetters": ["м", "о", "л", "н", "и", "я"],
  "player": {
    "id": "123456789",
    "name": "Case",
    "hp": 105,
    "word": "молния",
    "typedCount": 2
  },
  "opponent": {
    "id": "987654321",
    "name": "Blade",
    "hp": 90,
    "word": "победа",
    "typedCount": 4
  },
  "serverTime": "2026-05-16T10:00:00.000Z"
}
```

## `POST /battles/:battleId/words`

```json
{
  "accepted": true,
  "damage": 15,
  "combo": 3,
  "outcome": "hit",
  "state": {
    "battleId": "battle_AB12CD",
    "status": "active",
    "maxHp": 120,
    "round": 4,
    "wordLength": 4,
    "availableLetters": ["б", "у", "р", "я"],
    "player": {
      "id": "123456789",
      "name": "Case",
      "hp": 105,
      "word": "буря",
      "typedCount": 0
    },
    "opponent": {
      "id": "987654321",
      "name": "Blade",
      "hp": 75,
      "word": "лава",
      "typedCount": 0
    },
    "serverTime": "2026-05-16T10:00:01.000Z"
  },
  "nextWord": "буря"
}
```

## `POST /battles/:battleId/typing`

```json
{
  "accepted": true,
  "state": {
    "battleId": "battle_AB12CD",
    "status": "active",
    "maxHp": 120,
    "round": 4,
    "wordLength": 4,
    "player": {
      "id": "123456789",
      "name": "Case",
      "hp": 105,
      "word": "буря",
      "typedCount": 2
    },
    "opponent": {
      "id": "987654321",
      "name": "Blade",
      "hp": 75,
      "word": "лава",
      "typedCount": 1
    },
    "serverTime": "2026-05-16T10:00:01.000Z"
  }
}
```

## Finished Battle State

```json
{
  "battleId": "battle_AB12CD",
  "status": "finished",
  "maxHp": 120,
  "round": 8,
  "wordLength": 5,
  "player": {
    "id": "123456789",
    "name": "Case",
    "hp": 45,
    "word": "арена",
    "typedCount": 0
  },
  "opponent": {
    "id": "987654321",
    "name": "Blade",
    "hp": 0,
    "word": "битва",
    "typedCount": 0
  },
  "serverTime": "2026-05-16T10:00:45.000Z",
  "winnerId": "123456789"
}
```

## `POST /battles`

```json
{
  "accepted": true,
  "energySpent": 1,
  "player": {
    "id": "123456789",
    "name": "Case",
    "league": "Silver League",
    "leagueCode": "SILVER II",
    "rank": 23,
    "score": 2910,
    "nextLeague": "GOLD LEAGUE",
    "nextScore": 3000,
    "wins": 72,
    "losses": 29,
    "winRate": "71%",
    "bestCombo": 14,
    "wpm": 292,
    "streak": 6,
    "invited": 8
  },
  "energy": {
    "value": 49,
    "date": "2026-05-16"
  }
}
```
