# PvP Anti-Cheat Rules

These checks belong on the backend. The frontend may show nice UI states, but it must not be trusted for real PvP results.

## Trust Boundary

Never trust the client for:

- Telegram identity
- current PvP word
- round number
- HP
- damage
- combo
- winner
- energy spending
- rating changes

The client can only send input attempts and typing progress.

## Required Checks

### Telegram Identity

Every request must validate `X-Telegram-Init-Data` using the bot token.
The authenticated Telegram user must map to exactly one `players.id`.

Reject requests when:

- `initData` is missing in production
- hash validation fails
- auth date is too old
- Telegram id does not match a battle participant

### Battle Membership

For every `/battles/:battleId/...` request:

- battle must exist
- player must belong to the battle
- battle must be `active` for typing and word submit
- finished battles reject further word submits

### Round Validation

Word submissions must include the current `round`.
Reject when:

- submitted round is lower than current round: `stale_round`
- submitted round is higher than current round: `stale_round`
- current player already completed this round

### Word Validation

Reject when:

- submitted word does not exactly match the player's current server word
- word belongs to the opponent
- word length differs from server `wordLength`
- word contains unsupported characters

### Timing Validation

For each battle player, store:

- when the current word was issued
- last typing progress timestamp
- last accepted word timestamp

Suggested first thresholds:

- minimum accepted word duration: `120ms * wordLength`
- hard impossible duration: below `70ms * wordLength`
- repeated near-limit submits trigger soft flagging
- typing progress updates faster than `80ms` can be ignored or throttled

Reject with `too_fast` only for clearly impossible timings.
For suspicious but not impossible timings, accept the move and add a `battle_events` flag for later review.

### Damage And Combo

Server decides:

- base damage
- combo bonus
- whether combo resets
- whether battle is finished

Client-provided combo is ignored in PvP.

### Energy

Spend energy only when:

- battle mode is `online`
- battle status becomes `finished`
- both players had a real matched battle
- energy has not already been spent for this battle/player

Do not spend energy for:

- search attempt
- unavailable matchmaking
- AI battle
- friend duel
- cancelled technical battle

### Leave And Timeout

`POST /battles/:battleId/leave` is idempotent.
Multiple leave requests from the same player should not create multiple losses or duplicated events.

Server may finish the battle as loss when:

- player leaves during active PvP
- player is disconnected beyond timeout

Server may cancel when:

- opponent never connected
- battle failed before first accepted action

## Event Logging

Write `battle_events` for:

- typing progress snapshots, optionally sampled
- accepted word hit
- rejected word
- leave
- finish
- energy spent
- suspicious timing flag

This gives enough data to debug unfair battles after launch.

## Response Behavior

Use predictable rejection reasons:

- `wrong_word`
- `too_fast`
- `stale_round`
- `battle_finished`

The client already handles soft battle errors and should not open a broken battle when required fields are missing.
