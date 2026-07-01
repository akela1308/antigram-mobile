# ANTIGRAM — Инструкция по сборке через EAS

## Шаг 0 — Найди свой Expo username

1. Зайди на https://expo.dev
2. Войди через Google (akela1308@gmail.com)
3. Нажми на аватар → увидишь имя вида `@username`
4. Открой `app.json` и замени `YOUR_EXPO_USERNAME` на своё имя

---

## Шаг 1 — Установить EAS CLI

В терминале в любой папке:

```bash
npm install -g eas-cli
```

---

## Шаг 2 — Войти в Expo

```bash
eas login
```

Откроется браузер или попросит email/пароль. Войди через Google.

---

## Шаг 3 — Связать проект с Expo

В папке `ANTIGRAM/mobile`:

```bash
cd ~/Desktop/ANTIGRAM/mobile
eas init --id YOUR_PROJECT_ID
```

Если проект ещё не создан на expo.dev — EAS спросит и создаст автоматически.  
Можно проще:

```bash
eas build:configure
```

Это создаст проект на expo.dev и обновит app.json.

---

## Шаг 4 — Первая сборка (обе платформы)

### Production (для App Store / Google Play):
```bash
eas build --platform all --profile production
```

### Только iOS (быстрее для первого теста):
```bash
eas build --platform ios --profile production
```

### Только Android:
```bash
eas build --platform android --profile production
```

> EAS соберёт приложение в облаке — не нужен Mac для iOS-сборки.  
> Сборка занимает ~15-30 минут. Ссылка на скачивание придёт на email.

---

## Шаг 5 — Что нужно для App Store

Нужно заранее:

1. **Apple Developer Account** — https://developer.apple.com ($99/год)
2. **App Store Connect** — создать приложение вручную:
   - Войди на https://appstoreconnect.apple.com
   - New App → выбери iOS → Bundle ID: `com.antigram.app`
   - Запиши `App ID` (цифры) — вставь в `eas.json` → `ascAppId`
3. **Иконка 1024×1024** — без скруглений, PNG, без прозрачности  
   (`./assets/icon.png` должна быть именно такой)
4. **Скриншоты** — минимум 3 для iPhone 6.7" (iPhone 15 Pro Max)
5. **Privacy Policy URL** — обязательно, App Store не примет без неё

---

## Шаг 6 — Что нужно для Google Play

1. **Google Play Console** — https://play.google.com/console ($25 однократно)
2. Создать приложение → Internal testing
3. Скачать `google-service-account.json` для автосабмита через EAS
4. Скриншоты 2+ для телефона

---

## Команда сабмита (после успешной сборки)

```bash
# iOS
eas submit --platform ios --profile production

# Android
eas submit --platform android --profile production
```

---

## Полезные команды

```bash
# Статус текущих сборок
eas build:list

# Посмотреть логи конкретной сборки
eas build:view BUILD_ID

# Обновить OTA (без пересборки, только JS)
eas update --branch production --message "Fix: ..."
```

---

## Важно перед сборкой

- [ ] Заменить `YOUR_EXPO_USERNAME` в `app.json`
- [ ] Иконка `assets/icon.png` — 1024×1024, без прозрачности
- [ ] Splash `assets/splash-icon.png` — любой размер, PNG
- [ ] Supabase URL и ANON_KEY прописаны в `lib/supabase.ts` (не в .env!)
- [ ] Все функции работают на реальном устройстве через Expo Go
