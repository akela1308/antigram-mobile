// ─────────────────────────────────────────────────────────────
// ANTIGRAM — Push Notifications
// Использует expo-notifications + Supabase push_tokens
// ─────────────────────────────────────────────────────────────

import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Показывать уведомления когда приложение открыто
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

/**
 * Запросить разрешение на уведомления и сохранить токен в Supabase.
 * Вызывается после успешного логина.
 */
export async function registerPushToken(userId: string): Promise<void> {
  // Push не работает в симуляторе/эмуляторе
  if (!Device.isDevice) return

  // Запрашиваем разрешение (iOS показывает системный диалог)
  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  // Пользователь отказал — молча выходим
  if (finalStatus !== 'granted') return

  try {
    // Получаем Expo Push Token
    const tokenData = await Notifications.getExpoPushTokenAsync()
    const token = tokenData.data
    const platform = Platform.OS === 'ios' ? 'ios' : 'android'

    // Сохраняем в Supabase (upsert — не дублируем)
    await supabase
      .from('push_tokens')
      .upsert(
        { user_id: userId, token, platform },
        { onConflict: 'user_id,token' }
      )
  } catch {
    // Ошибка получения токена (например, нет EAS projectId) — не крашим
  }
}

/**
 * Удалить push-токен текущего устройства при логауте.
 */
export async function unregisterPushToken(userId: string): Promise<void> {
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync()
    const token = tokenData.data
    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token)
  } catch {
    // Игнорируем если токена нет
  }
}
