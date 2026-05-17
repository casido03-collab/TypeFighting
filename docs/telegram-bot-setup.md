# Telegram Bot Setup

This checklist prepares Type Fight for a real Telegram Mini App launch.

## 1. Create Bot

In BotFather:

1. Create a bot with `/newbot`.
2. Save the bot token on the backend only.
3. Set bot name, description, avatar, and commands.

Suggested commands:

```txt
start - Open Type Fight
play - Find an opponent
profile - View profile
```

## 2. Create Mini App

In BotFather:

1. Open bot settings.
2. Create a Mini App / Web App.
3. Set the production HTTPS URL of the frontend.
4. Save the Mini App short name.

Frontend env:

```txt
VITE_TELEGRAM_BOT_USERNAME=your_bot_username
VITE_TELEGRAM_APP_SHORT_NAME=your_app_short_name
VITE_API_BASE_URL=https://your-api.example.com
VITE_ALLOW_BROWSER_API_MOCK=false
```

The frontend builds duel and referral links as:

```txt
https://t.me/<bot_username>/<app_short_name>?startapp=<duel_or_ref_param>
```

## 3. Backend Secrets

Backend env should include:

```txt
TELEGRAM_BOT_TOKEN=...
WEB_APP_URL=https://your-mini-app.example.com
API_PUBLIC_URL=https://your-api.example.com
```

Never expose `TELEGRAM_BOT_TOKEN` to the frontend.

## 4. InitData Validation

Every API request from the Mini App includes:

```txt
X-Telegram-Init-Data: <Telegram WebApp initData>
```

Backend must:

- validate the hash with the bot token
- reject old `auth_date`
- map `user.id` to `players.telegram_id`
- ignore client-provided identity fields after validation

## 5. Startapp Parameters

Supported params:

```txt
duel_<id>
ref_<code>
```

Rules:

- max length: `128`
- allowed chars: `A-Z`, `a-z`, `0-9`, `_`, `-`
- empty `duel_` and `ref_` are ignored

Expected flows:

- `startapp=duel_...` calls `POST /duels/:duelId/join`
- `startapp=ref_...` calls `POST /referrals`

## 6. Launch Checks

Before public testing:

- Mini App opens from Telegram bot button.
- `window.Telegram.WebApp.initData` is present inside Telegram.
- Local browser still works when `VITE_API_BASE_URL` is empty.
- Duel link opens the Mini App and starts/join the correct battle.
- Referral link opens the Mini App and applies referral once.
- BackButton returns from Battle/Rating/Profile to Main.
- Closing Mini App during active PvP calls `leave` once.
- Mobile safe-area and Telegram viewport fit on iOS and Android.

## 7. Bot Message Buttons

The bot can send a Web App button that opens the Mini App URL.

Example button target:

```txt
https://your-mini-app.example.com
```

For duel/referral sharing, use the direct Telegram links created by the frontend:

```txt
https://t.me/<bot_username>/<app_short_name>?startapp=duel_ABC123
https://t.me/<bot_username>/<app_short_name>?startapp=ref_CASE
```
