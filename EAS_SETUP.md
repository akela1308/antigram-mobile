# EAS — что заполнить перед сабмитом

В `eas.json` есть два плейсхолдера, которые нужно заменить до первого `eas submit`.

---

## ascAppId — App Store Connect App ID

1. Войди на https://appstoreconnect.apple.com  
2. Открой **My Apps** → выбери приложение Antigram  
3. Перейди: **General → App Information → Apple ID** (числовой, например `6743821905`)  
4. Скопируй его и вставь в `eas.json`:

```json
"ascAppId": "6743821905"
```

> Если приложение ещё не создано — создай его через **My Apps → + → New App**.  
> Bundle ID должен совпадать с `app.json`: `com.antigram.app`.

---

## appleTeamId — Apple Developer Team ID

1. Войди на https://developer.apple.com/account  
2. В левом меню: **Membership Details**  
3. Скопируй **Team ID** (10 символов, например `A1B2C3D4E5`)  
4. Вставь в `eas.json`:

```json
"appleTeamId": "A1B2C3D4E5"
```

---

## Google Play — Service Account

Уже настроен путь `./google-service-account.json`. Чтобы его создать:

1. Открой https://play.google.com/console  
2. **Setup → API access → Create new service account**  
3. Выдай роль **Release Manager**  
4. Скачай JSON-ключ и положи его как `mobile/google-service-account.json`

> Добавь `google-service-account.json` в `.gitignore` — это секретный ключ!

---

## Итог — финальный вид submit-секции в eas.json

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "akela1308@gmail.com",
      "ascAppId": "ВСТАВЬ_ЧИСЛОВОЙ_ID",
      "appleTeamId": "ВСТАВЬ_TEAM_ID"
    },
    "android": {
      "serviceAccountKeyPath": "./google-service-account.json",
      "track": "internal"
    }
  }
}
```
