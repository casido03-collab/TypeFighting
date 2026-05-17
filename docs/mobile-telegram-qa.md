# Mobile And Telegram QA

Use this checklist before inviting real players.

## Target Devices

Minimum manual set:

- iPhone SE / small iPhone width around `320-375px`
- modern iPhone width around `390-430px`
- Android small width around `360px`
- Android common width around `412px`
- Telegram Desktop as a sanity check, but mobile WebView is the priority

## Viewports To Simulate Locally

- `320x568`
- `360x640`
- `375x667`
- `390x844`
- `412x915`
- `430x932`

## Main Screen

- No black or white top strip.
- Energy and rank fit in the top card.
- "Find opponent" is visible and not clipped.
- Failed search message appears under the hero card.
- Failed search message moves lower buttons down and disappears cleanly.
- AI and friend duel buttons stay reachable above bottom navigation.
- Duel invite modal fits, and the link wraps instead of overflowing.

## Battle Screen

- Header, HP bars, arena, typing field, and keyboard area all fit.
- Fighter letters under both characters are visible.
- Words are not displayed on top of characters.
- Typing input remains reachable when the real phone keyboard opens.
- Result overlay fits and the action button is not clipped.
- BackButton / menu action sends leave once for online battle.

## Rating

- Period tabs fit.
- Progress card does not overlap stats.
- Leaderboard rows do not overflow horizontally.
- Player names truncate cleanly.
- Bottom navigation does not cover the last visible row.

## Profile

- Stats grid remains readable.
- Invite friend card and settings remain reachable.
- Sound, vibration, and language buttons are tappable.
- Referral modal fits and the referral link wraps.
- Bottom navigation does not cover settings.

## Telegram WebView

- `viewport-fit=cover` is active.
- Safe areas are respected on iOS.
- `viewportChanged` updates layout height.
- `themeChanged` does not break readable text.
- `startapp=duel_...` joins or shows soft retry.
- `startapp=ref_...` applies referral once.
- Closing app during PvP calls `POST /battles/:battleId/leave`.

## Pass Criteria

The app is ready for public Telegram testing when:

- all screens fit without clipped primary controls on the target devices
- online battle can start, finish, and return to menu
- energy is only spent after completed PvP
- no horizontal page scroll appears
- no user-facing crash appears on bad network/API responses
