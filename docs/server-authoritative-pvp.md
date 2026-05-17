# Server-Authoritative PvP Flow

This document defines the production PvP rules. In real online battles the client renders state, but the server owns the battle.

## Matchmaking

1. Client calls `POST /matchmaking`.
2. Server validates Telegram `initData`.
3. Server checks player energy is above `0`.
4. Server tries to match two available players for up to `20` seconds.
5. If matched, server creates:
   - `battles`
   - two `battle_players`
   - first `battle_rounds` row
6. Server returns:

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

If no opponent is found after `20` seconds:

```json
{
  "status": "unavailable",
  "message": "Try again."
}
```

Search attempts do not spend energy.

## Battle State

The client polls or subscribes to `GET /battles/:battleId`.
The server response is the only source of truth:

- battle status
- round number
- player HP
- opponent HP
- current words
- typed progress
- winner

Client-side HP changes are only animations. The next server state must correct the UI if needed.

## Word Assignment

Every round has one word pair stored in `battle_rounds`.

Rules:

- Both words must have the same length.
- First word of a battle should be at least `5` letters.
- Later words can be `3` to `6` letters.
- Server assigns the current player's word based on authenticated player id.
- Client must never choose the PvP word.

## Typing Progress

Client sends:

```json
{
  "typedCount": 3
}
```

Server clamps `typedCount` between `0` and current word length and broadcasts/stores it.
This powers the filled-letter animation under each fighter.

## Word Submit

Client sends:

```json
{
  "word": "molnia",
  "round": 3
}
```

Server validates:

- battle exists
- battle is active
- player belongs to battle
- submitted round equals current round
- submitted word equals current player's server word
- submit timing is plausible

If valid:

- apply damage
- update combo
- increment words completed
- reduce opponent HP
- create a `battle_events.word_hit`
- if opponent HP reaches `0`, finish battle
- otherwise create next same-length word pair

If invalid:

- do not apply damage
- create a `battle_events.word_rejected`
- return rejection reason

## Finish

Battle finishes when:

- one player HP reaches `0`
- one player leaves and server decides it is a loss
- server cancels the battle because of technical timeout

Only completed PvP battles spend `1` energy.
Friend duels currently do not spend energy.

## Client Behavior

The client should:

- show online battle only when `battleId` exists
- display filled letters from server `typedCount`
- submit typed word with current `round`
- reset local input when server word changes
- show victory/defeat by `winnerId`
- send `leave` once when exiting or closing the Mini App
- show a soft error if the server state is malformed or unfair
