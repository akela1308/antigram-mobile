# ANTIGRAM MOBILE APP — CLAUDE.md

## What is this project?

Antigram Mobile is the **React Native / Expo** counterpart to the Antigram Telegram Mini App. It is a native iOS/Android social camera app where users shoot photos through a film-emulation lens (choosing a film stock preset before shooting), apply analog LUT filters in-app, add emotion mood tags, and share "Moments." The social layer is identical to the webapp: follows, reactions (5 emotion types), albums, highlights, notifications, and Telegram-Stars-powered tipping.

Both apps share the **same Supabase backend project and database schema** — `lib/db.ts` in this folder and `src/lib/db.ts` in the webapp make functionally equivalent calls to the same tables.

IMPORTANT: Read the Expo versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any Expo-specific code. Do NOT use deprecated APIs from older Expo versions.

## Vision & Core Concept

The camera/film metaphor is core to the UX: the user first picks a "film" (a named LUT preset) before entering the camera — just as a film photographer loads their roll before shooting. The `[A]` branded center button in the tab bar triggers this `FilmSelection → CameraCapture` two-step flow. Photos are processed with analog grain, flare, and color-grading effects client-side before upload.

## Tech Stack

- **React Native 0.81.5** + **Expo SDK 54**
- **React Navigation v7**: `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`
- **Auth / DB**: Supabase (`@supabase/supabase-js` 2.108)
- **Camera**: `expo-camera` 17.0
- **Media**: `expo-image-picker` 17.0, `expo-image-manipulator` 14.0, `expo-media-library` 17.0
- **GL / LUT processing**: `expo-gl` 16.0, `expo-av` 16.0 (audio)
- **Push notifications**: `expo-notifications` 0.32
- **Error tracking**: `@sentry/react-native` 6.3
- **Analytics**: custom `lib/analytics.ts` (PostHog or similar)
- **Font**: JetBrains Mono ExtraBold via `@expo-google-fonts/jetbrains-mono`
- **Context**: React Context API (AppContext, PlayerContext, LanguageContext) — no Zustand/Redux
- **EAS Build**: `eas.json` configured for development, preview, and production profiles

## Project Structure

```
mobile/
├── App.tsx                         — entry: Sentry init, Supabase session, AppContext, TabNavigator
├── app.json                        — Expo config (bundle IDs, permissions, orientations)
├── eas.json                        — EAS Build profiles (development/preview/production)
├── lib/
│   ├── db.ts                       — all Supabase queries (same schema as webapp)
│   ├── supabase.ts                 — Supabase client
│   ├── database.types.ts           — generated DB types
│   ├── analytics.ts                — analytics events (Events enum, identify/reset/track)
│   └── pushNotifications.ts        — Expo push token register/unregister + push_tokens table
├── src/
│   ├── components/
│   │   ├── AlgoProcessor.tsx       — LUT/grain/flare algorithm processor
│   │   ├── LutProcessor.tsx        — applies .cube LUT files to images via expo-gl
│   │   ├── FilmStrip.tsx           — horizontal film-strip UI component
│   │   ├── FilmStripProfileHeader.tsx
│   │   ├── CategoryFilmStrip.tsx   — emotion category strip
│   │   ├── MomentCard.tsx          — shared card (feed, profile, explore)
│   │   ├── MiniPlayer.tsx          — background music mini player
│   │   ├── FabSpeedDial.tsx        — speed dial for camera FAB
│   │   ├── Avatar.tsx              — user avatar with fallback
│   │   └── ActionSheet.tsx         — bottom sheet action menu
│   ├── constants/
│   │   └── filmPresets.ts          — named film LUT preset definitions
│   ├── context/
│   │   ├── AppContext.tsx          — session, isAdmin, unreadCount — provided at app root
│   │   ├── LanguageContext.tsx     — ru/en i18n
│   │   └── PlayerContext.tsx       — background music state
│   ├── hooks/
│   │   └── useAuthGate.ts          — redirect unauthenticated users to login
│   ├── lib/
│   │   ├── photoProcessor.ts       — canvas/GL photo processing pipeline
│   │   └── reactions.ts            — reaction helpers
│   ├── navigation/
│   │   ├── TabNavigator.tsx        — 5-tab bottom bar
│   │   ├── FeedStack.tsx           — Feed → MomentDetail → Profile
│   │   ├── CollectionStack.tsx     — Search / Explore
│   │   ├── CameraStack.tsx         — FilmSelect → CameraCapture (tab bar hidden on camera)
│   │   ├── ReactionsStack.tsx      — Notifications
│   │   ├── ProfileStack.tsx        — Profile → EditProfile → FollowList → Albums
│   │   └── AuthNavigator.tsx       — Login → Register stack
│   └── screens/
│       ├── FeedScreen.tsx          — personal follows-based feed
│       ├── SearchScreen.tsx        — user search
│       ├── ShotsScrollFeed.tsx     — full-screen vertical scroll (TikTok-style)
│       ├── CollectionScreen.tsx    — explore / collections
│       ├── FilmSelectionScreen.tsx — film picker before camera
│       ├── CameraScreen.tsx        — live camera with film filter preview + capture
│       ├── MomentDetailScreen.tsx  — single moment: reactions, comments, Stars
│       ├── AlbumDetailScreen.tsx   — album contents
│       ├── CreateAlbumScreen.tsx   — new album creation
│       ├── ProfileScreen.tsx       — own profile
│       ├── OtherProfileScreen.tsx  — another user's profile
│       ├── EditProfileScreen.tsx   — edit bio/avatar
│       ├── FollowListScreen.tsx    — followers / following list
│       ├── ReactionsScreen.tsx     — notifications
│       ├── SavedScreen.tsx         — saved/bookmarked moments
│       ├── PrivacyPolicyScreen.tsx — privacy policy
│       └── auth/
│           ├── LoginScreen.tsx
│           └── RegisterScreen.tsx
```

## How to Run Locally

```bash
cd mobile
npm install
# create .env with EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SENTRY_DSN
npx expo start         # starts Metro bundler, scan QR in Expo Go
npx expo start --ios   # requires macOS + Xcode Simulator
```

EAS builds (requires EAS CLI + Expo account):
```bash
npm run build:dev     # eas build --profile development (development client)
npm run build:prod    # eas build --profile production
```

The `development` EAS profile creates a dev client (allows Expo DevTools, hot reload on device). The `production` profile sets `autoIncrement: true` for build numbers.

## Architecture & Key Decisions

### 5-tab navigation

`TabNavigator.tsx` mounts 5 bottom tabs:

| Tab | Stack | Content |
|---|---|---|
| Feed | FeedStack | FeedScreen → MomentDetailScreen / OtherProfileScreen |
| Search | CollectionStack | SearchScreen → CollectionScreen |
| `[A]` Camera (center FAB) | CameraStack | FilmSelectionScreen → CameraScreen |
| Reactions | ReactionsStack | ReactionsScreen (notifications) |
| Profile | ProfileStack | ProfileScreen → EditProfileScreen / FollowListScreen / AlbumDetailScreen |

The center camera tab uses a custom `CameraButton` component (raised `[A]` button, styled in dark amber, lifts `-18dp` above the tab bar). When the user navigates to `CameraCapture`, the tab bar is hidden via `tabBarStyle: { display: 'none' }`.

### Film/camera metaphor

`FilmSelectionScreen` → user picks a named film preset (Kodak MIX, Fujifilm MIX, AGFA, Bleach Bypass, Technicolor, etc.) → taps "Load film" → navigated to `CameraScreen` with `filmId` in route params. `CameraScreen` renders a live preview with the selected LUT applied via `expo-gl`/`LutProcessor`. On capture, `AlgoProcessor` applies grain/flare effects and the LUT to the captured image before uploading to Supabase Storage.

### Auth in App.tsx

`App.tsx` calls `supabase.auth.getSession()` on mount and listens to `onAuthStateChange`. On sign-in, it also:
- Checks admin status (`isUserAdmin`)
- Checks if blocked (`isUserBlocked`)
- Loads unread notification count
- Registers push token (`registerPushToken`)
- Calls `identify()` for analytics

On sign-out: unregisters the push token, calls `reset()` for analytics.

`AppContext` provides `{ session, isGuest, isAdmin, unreadCount }` to all screens.

### Push notifications

`lib/pushNotifications.ts` uses `expo-notifications` to request permission, get the Expo push token, and write it to the `push_tokens` Supabase table. On sign-out, the token row is deleted. The actual notification sending happens server-side (not in this codebase).

### Shared Supabase backend

`lib/db.ts` is functionally equivalent to the webapp's `src/lib/db.ts` — same tables, same query patterns. The two clients connect to the same Supabase project. Profile data, moments, reactions, follows, albums, comments, notifications, and star totals are all shared between web and mobile users.

## Database / Backend

Same schema as the Telegram webapp — see that CLAUDE.md's Database section for the full table list. Key differences in the mobile implementation:

- Image uploads use `expo-file-system/legacy` to read the file as base64 → decoded via `base64-arraybuffer` → uploaded with `supabase.storage.from('moments').upload(...)`.
- `push_tokens` table stores Expo push tokens per user (not present in the webapp's db.ts).
- Admin functions `isUserAdmin()` and `isUserBlocked()` are called at session init in `App.tsx`.

## Key Features Implemented

- Full auth: email/password sign-up and login (`auth/LoginScreen`, `auth/RegisterScreen`)
- Guest mode: `isGuest` flag in AppContext (limited functionality without auth)
- Film selection → live LUT preview → capture → process (grain/flare/color) → upload
- Photo posts with mood tagging, public/private toggle
- Personal feed (follows), explore feed (global emotion-filtered), full-screen vertical scroll
- Reactions (5 emotion types)
- Comments on moments
- Follow/unfollow users with counts
- Albums: create, add/remove moments, view detail
- Highlights: pin moments to profile header
- Saved/bookmarked moments
- Notifications screen with unread badge on Reactions tab
- Background music player (MiniPlayer, PlayerContext, expo-av)
- Language switching (Russian/English, LanguageContext)
- Sentry error tracking (enabled when `EXPO_PUBLIC_SENTRY_DSN` is set)
- Analytics: `identify()`, `reset()`, `track()` wrappers

## Known Issues / Not Yet Implemented

- **EAS build configuration**: `eas.json` development profile targets physical devices only (`"simulator": false`) — if you need simulator builds, change this.
- **Supabase credentials in lib/supabase.ts**: must come from env vars — hardcoded credentials are a security risk; verify `.env` is properly set up and not committed.
- **LUT processing performance**: `expo-gl`-based LUT processing can be slow on older devices; `AlgoProcessor` and `LutProcessor` may need profiling on target hardware.
- **No deep linking**: the app has no URL scheme or universal links configured in `app.json` — deep links to specific moments/profiles from Telegram or web won't work.
- **No Telegram Stars in mobile**: the Stars tipping flow is webapp-only (depends on Telegram's WebApp payment API); the mobile app uses standard in-app displays for star totals but cannot trigger new payments.
- **`ShotsScrollFeed.tsx`**: full-screen scroll requires testing on both iOS and Android for scroll performance and video autoplay behavior.
- **Push notification delivery**: the token registration is implemented; the actual notification sending (via Expo Push Notification Service) requires a server-side job not in this codebase.

## Business Context

Same product as the Telegram Mini App — analog film-aesthetic photo sharing. The mobile app is the standalone native version; the webapp is the Telegram-embedded version. Both target the same audience and share backend data.

## Environment Variables

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry error tracking DSN (optional — Sentry is disabled if empty) |

Additional Supabase secrets required for Edge Functions (set via Supabase CLI):
- `TELEGRAM_BOT_TOKEN` — used by the `telegram-auth` function shared with the webapp

## Deployment

- **iOS**: `eas build --platform ios --profile production` → submit to App Store via `eas submit`
- **Android**: `eas build --platform android --profile production` → submit to Google Play via `eas submit`
- **Development builds**: `eas build --profile development` → install `.ipa`/`.apk` directly on device

EAS project is linked via `app.json`'s `"owner": "antigram"` and `"slug": "antigram"`.

## Important Files to Read First

1. `App.tsx` — session management, auth flow, AppContext population, push token registration
2. `src/navigation/TabNavigator.tsx` — 5-tab structure, `[A]` camera button, tab bar visibility
3. `src/screens/FilmSelectionScreen.tsx` + `CameraScreen.tsx` — the film/camera two-step flow
4. `lib/db.ts` — all Supabase queries (shared schema with webapp)
5. `src/components/LutProcessor.tsx` + `AlgoProcessor.tsx` — the photo processing pipeline
6. `src/context/AppContext.tsx` — global session and admin state
7. `lib/pushNotifications.ts` — push token lifecycle
