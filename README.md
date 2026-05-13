# Typing Kombat

Полный React/Vite проект с разделами:

- Главная
- Бой
- Рейтинг
- Профиль

## Запуск

```bash
npm install
npm run dev
```

Открой:

```txt
http://localhost:5173
```

## Структура

```txt
src/
  App.tsx
  main.tsx
  components/
    Background.tsx
    BottomNav.tsx
    HeroCharacter.tsx
    TopBar.tsx
  data/
    gameData.ts
  pages/
    MainMenuPage.tsx
    BattlePage.tsx
    RatingPage.tsx
    ProfilePage.tsx
  styles/
    styles.ts
    global.css
```

## Для Telegram Mini App

Для локального теста в Telegram можно использовать:

```bash
npm run dev
ngrok http 5173
```

## Последние правки

- Убраны иконки звука и настроек с верхней панели.
- Убрана надпись Telegram Mini App.
- Убрана награда дня с главной.
- В профиле кнопка «Ссылка» открывает модалку с реферальной ссылкой.
- В бою нижнее меню не отображается.
