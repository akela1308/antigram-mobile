// ─────────────────────────────────────────────────────────────
// ANTIGRAM Analytics — PostHog wrapper
//
// Ключ: получи на https://posthog.com → Project Settings → API Keys
// Вставь значение phc_... в POSTHOG_API_KEY ниже.
// ─────────────────────────────────────────────────────────────

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY || ''
const POSTHOG_HOST = 'https://eu.i.posthog.com' // EU Cloud (GDPR)

let _distinctId: string | null = null

function endpoint(path: string) {
  return `${POSTHOG_HOST}${path}`
}

async function post(path: string, body: object) {
  if (!POSTHOG_API_KEY) return
  try {
    await fetch(endpoint(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // аналитика не должна крашить приложение
  }
}

/** Идентифицировать пользователя после логина */
export function identify(userId: string, properties?: Record<string, any>) {
  _distinctId = userId
  post('/capture/', {
    api_key: POSTHOG_API_KEY,
    distinct_id: userId,
    event: '$identify',
    properties: {
      $set: { ...properties },
    },
  })
}

/** Сбросить при логауте */
export function reset() {
  _distinctId = null
}

/** Трекнуть событие */
export function track(event: string, properties?: Record<string, any>) {
  if (!_distinctId) return // не трекаем гостей
  post('/capture/', {
    api_key: POSTHOG_API_KEY,
    distinct_id: _distinctId,
    event,
    properties: {
      ...properties,
      $lib: 'antigram-rn',
    },
  })
}

// ─────────────────────────────────────────────────────────────
// Ключевые события ANTIGRAM
// ─────────────────────────────────────────────────────────────

/** Пользователь завершил онбординг */
export const Events = {
  ONBOARDING_COMPLETE: 'onboarding_complete',
  /** Первое фото опубликовано — главная activation metric */
  FIRST_PHOTO_POSTED: 'first_photo_posted',
  /** Любое фото опубликовано */
  PHOTO_POSTED: 'photo_posted',
  /** Прокрутка ленты — с глубиной */
  FEED_SCROLLED: 'feed_scrolled',
  /** Реакция добавлена */
  REACTION_ADDED: 'reaction_added',
  /** Подписался на пользователя */
  USER_FOLLOWED: 'user_followed',
  /** Открыл приложение (сессия) */
  APP_OPENED: 'app_opened',
  /** Применил плёночный фильтр */
  FILTER_APPLIED: 'filter_applied',
} as const
