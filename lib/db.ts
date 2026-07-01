import { supabase } from './supabase'
import type { Profile, Moment, MomentWithProfile, ReactionType, ReactionWithDetails, HighlightWithMoment, Album, AlbumWithMoments, CommentWithProfile, SavedMoment, NotificationItem } from './database.types'
import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { track, Events } from './analytics'

// ─────────────────────────────────────────────
// PROFILES
// ─────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

export async function updateProfile(userId: string, updates: Partial<Omit<Profile, 'id' | 'created_at'>>) {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
  return { error }
}

// ─────────────────────────────────────────────
// MOMENTS
// ─────────────────────────────────────────────

// Лента: моменты людей, на которых подписан
export async function getFeed(userId: string, limit = 20): Promise<MomentWithProfile[]> {
  const { data: following } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)

  if (!following || following.length === 0) return []

  const followingIds = (following as { following_id: string }[]).map(f => f.following_id)

  const { data } = await supabase
    .from('moments')
    .select('*, profiles(*)')
    .eq('is_public', true)
    .in('user_id', followingIds)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as MomentWithProfile[]) ?? []
}

// Лента по эмоции — публичные моменты, отсортированные по кол-ву реакций этого типа
export async function getMomentsByEmotion(emotion: ReactionType, limit = 30): Promise<MomentWithProfile[]> {
  // Получаем все реакции нужного типа
  const { data: reactionData } = await supabase
    .from('reactions')
    .select('moment_id')
    .eq('type', emotion)

  if (!reactionData || reactionData.length === 0) return []

  // Считаем кол-во реакций по каждому моменту и сортируем
  const countMap: Record<string, number> = {}
  for (const r of reactionData as { moment_id: string }[]) {
    countMap[r.moment_id] = (countMap[r.moment_id] ?? 0) + 1
  }
  const sortedIds = Object.entries(countMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([id]) => id)

  // Загружаем моменты по ID
  const { data } = await supabase
    .from('moments')
    .select('*, profiles(*)')
    .eq('is_public', true)
    .in('id', sortedIds)

  if (!data) return []

  // Восстанавливаем порядок по убыванию реакций
  const momentMap = new Map((data as MomentWithProfile[]).map(m => [m.id, m]))
  return sortedIds.map(id => momentMap.get(id)).filter(Boolean) as MomentWithProfile[]
}

// Моменты конкретного пользователя (для профиля)
export async function getUserMoments(userId: string): Promise<Moment[]> {
  const { data } = await supabase
    .from('moments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return data ?? []
}

// Создать момент
export async function createMoment(params: {
  userId: string
  photoUrl: string
  caption?: string
  mood?: string
  customMoodEmoji?: string
  customMoodLabel?: string
}): Promise<{ data: Moment | null; error: any }> {
  // Базовый payload без custom_mood полей — они добавляются только если колонки существуют
  const payload: Record<string, any> = {
    user_id: params.userId,
    photo_url: params.photoUrl,
    caption: params.caption ?? null,
    mood: params.mood ?? null,
    is_public: true,
  }
  // Добавляем кастомное настроение только если значения есть
  // (если миграция ещё не запускалась — просто игнорируем)
  if (params.customMoodEmoji) payload.custom_mood_emoji = params.customMoodEmoji
  if (params.customMoodLabel) payload.custom_mood_label = params.customMoodLabel
  const { data, error } = await supabase
    .from('moments')
    .insert(payload)
    .select()
    .single()

  if (!error && data) {
    track(Events.PHOTO_POSTED, { mood: params.mood ?? null })
  }

  return { data, error }
}

// Удалить момент
export async function deleteMoment(momentId: string) {
  const { error } = await supabase
    .from('moments')
    .delete()
    .eq('id', momentId)
  return { error }
}

// ─────────────────────────────────────────────
// REACTIONS
// ─────────────────────────────────────────────

// Получить реакции на момент
export async function getReactions(momentId: string) {
  const { data } = await supabase
    .from('reactions')
    .select('*')
    .eq('moment_id', momentId)
  return data ?? []
}

// Поставить реакцию
export async function addReaction(momentId: string, userId: string, type: ReactionType) {
  const { error } = await supabase
    .from('reactions')
    .upsert({ moment_id: momentId, user_id: userId, type })
  if (!error) track(Events.REACTION_ADDED, { reaction_type: type })
  return { error }
}

// Убрать реакцию
export async function removeReaction(momentId: string, userId: string) {
  const { error } = await supabase
    .from('reactions')
    .delete()
    .eq('moment_id', momentId)
    .eq('user_id', userId)
  return { error }
}

// ─────────────────────────────────────────────
// FOLLOWS
// ─────────────────────────────────────────────

export async function followUser(followerId: string, followingId: string) {
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: followerId, following_id: followingId })
  if (!error) track(Events.USER_FOLLOWED)
  return { error }
}

export async function unfollowUser(followerId: string, followingId: string) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
  return { error }
}

// Поиск пользователей по имени или username
export async function searchUsers(query: string): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(30)
  return (data as Profile[]) ?? []
}

// Уведомления из таблицы notifications (все типы: follow, reaction, comment)
export async function getMyNotifications(userId: string): Promise<NotificationItem[]> {
  const { data } = await supabase
    .from('notifications')
    .select('*, profiles!actor_id(*), moments(photo_url)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data as NotificationItem[]) ?? []
}

// Отметить все уведомления как прочитанные
export async function markNotificationsRead(userId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)
}

// Количество непрочитанных уведомлений (для бейджа на колокольчике)
export async function getUnreadNotificationsCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)
  return count ?? 0
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const { data } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .single()
  return !!data
}

export async function getFollowersCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', userId)
  return count ?? 0
}

export async function getFollowingCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', userId)
  return count ?? 0
}

export async function getRandomMoments(limit: number): Promise<MomentWithProfile[]> {
  const { data } = await supabase
    .from('moments')
    .select('*, profiles(*)')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit * 3)
  if (!data || data.length === 0) return []
  const shuffled = [...data].sort(() => Math.random() - 0.5)
  return (shuffled.slice(0, limit) as MomentWithProfile[])
}

export async function getPhotoOfDay(): Promise<MomentWithProfile | null> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: moments } = await supabase
    .from('moments')
    .select('id')
    .eq('is_public', true)
    .gte('created_at', since)
  if (!moments || moments.length === 0) return null

  const momentIds = (moments as { id: string }[]).map(m => m.id)
  const { data: reactions } = await supabase
    .from('reactions')
    .select('moment_id')
    .in('moment_id', momentIds)
  if (!reactions) return null

  const counts: Record<string, number> = {}
  for (const r of reactions as { moment_id: string }[]) {
    counts[r.moment_id] = (counts[r.moment_id] ?? 0) + 1
  }
  const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!topId) return null

  const { data } = await supabase
    .from('moments')
    .select('*, profiles(*)')
    .eq('id', topId)
    .single()
  return (data as MomentWithProfile) ?? null
}

export async function getRandomUser(): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .limit(20)
  if (!data || data.length === 0) return null
  return (data as Profile[])[Math.floor(Math.random() * data.length)]
}

export async function uploadAvatarPhoto(userId: string, uri: string): Promise<string | null> {
  const filename = `${userId}/avatar.jpg`
  let base64: string
  try {
    base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
  } catch (e) {
    return null
  }
  const arrayBuffer = decode(base64)
  const { error } = await supabase.storage
    .from('avatars')
    .upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: true })
  if (error) {
    return null
  }
  const { data } = supabase.storage.from('avatars').getPublicUrl(filename)
  return data.publicUrl
}

// ─────────────────────────────────────────────
// STORAGE — загрузка фото
// ─────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export async function uploadMomentPhoto(userId: string, uri: string): Promise<string | null> {
  const filename = `${userId}/${Date.now()}.jpg`

  // 1. Verify auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 2. Read file
  let base64: string
  try {
    base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
  } catch (e) {
    return null
  }

  const arrayBuffer = decode(base64)

  // 3. Primary: supabase-js SDK upload
  const { error: uploadError } = await supabase.storage
    .from('moments')
    .upload(filename, arrayBuffer, { contentType: 'image/jpeg' })

  if (!uploadError) {
    const { data } = supabase.storage.from('moments').getPublicUrl(filename)
    return data.publicUrl
  }

  // 4. Fallback: direct REST API via fetch()
  return uploadViaRest(filename, arrayBuffer)
}

async function uploadViaRest(filename: string, body: ArrayBuffer): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const url = `${SUPABASE_URL}/storage/v1/object/moments/${filename}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
      },
      body: new Uint8Array(body),
    })

    if (!response.ok) return null

    return `${SUPABASE_URL}/storage/v1/object/public/moments/${filename}`
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────
// HIGHLIGHTS
// ─────────────────────────────────────────────

export async function getHighlights(userId: string): Promise<HighlightWithMoment[]> {
  const { data } = await supabase
    .from('highlights')
    .select('*, moments(*)')
    .eq('user_id', userId)
    .order('position', { ascending: true })
  return (data as HighlightWithMoment[]) ?? []
}

export async function addHighlight(userId: string, momentId: string): Promise<{ error: any }> {
  const { data: existing } = await supabase
    .from('highlights')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: false })
    .limit(1)
  const nextPos = existing && existing.length > 0 ? (existing[0] as any).position + 1 : 0
  const { error } = await supabase
    .from('highlights')
    .insert({ user_id: userId, moment_id: momentId, position: nextPos })
  return { error }
}

export async function removeHighlight(userId: string, momentId: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('highlights')
    .delete()
    .eq('user_id', userId)
    .eq('moment_id', momentId)
  return { error }
}

/** Устанавливает конкретный момент на конкретную позицию (0–4) в плёнке профиля.
 *  Если на этой позиции уже есть другой момент — удаляет его. */
export async function setHighlightAtPosition(
  userId: string,
  momentId: string,
  position: number,
): Promise<{ error: any }> {
  // Удалить всё что сейчас занимает эту позицию
  await supabase
    .from('highlights')
    .delete()
    .eq('user_id', userId)
    .eq('position', position)
  // Вставить новый момент на эту позицию
  const { error } = await supabase
    .from('highlights')
    .insert({ user_id: userId, moment_id: momentId, position })
  return { error }
}

// ─────────────────────────────────────────────
// ALBUMS
// ─────────────────────────────────────────────

export async function getUserAlbums(userId: string): Promise<AlbumWithMoments[]> {
  const { data: albums } = await supabase
    .from('albums')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (!albums || albums.length === 0) return []

  // For each album get count + first photo
  const result: AlbumWithMoments[] = await Promise.all(
    (albums as Album[]).map(async (album) => {
      const { data: am } = await supabase
        .from('album_moments')
        .select('moment_id, moments(photo_url)')
        .eq('album_id', album.id)
        .order('added_at', { ascending: true })
        .limit(1)
      const firstUrl = am && am.length > 0
        ? (am[0] as any).moments?.photo_url ?? null
        : null
      const { count } = await supabase
        .from('album_moments')
        .select('*', { count: 'exact', head: true })
        .eq('album_id', album.id)
      return { ...album, moments_count: count ?? 0, first_moment_url: firstUrl }
    })
  )
  return result
}

export async function createAlbum(userId: string, title: string): Promise<{ data: Album | null; error: any }> {
  const { data, error } = await supabase
    .from('albums')
    .insert({ user_id: userId, title: title.trim() })
    .select()
    .single()
  return { data: data as Album | null, error }
}

export async function addMomentToAlbum(albumId: string, momentId: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('album_moments')
    .insert({ album_id: albumId, moment_id: momentId })
  return { error }
}

export async function getAlbumMoments(albumId: string): Promise<Moment[]> {
  const { data } = await supabase
    .from('album_moments')
    .select('moments(*)')
    .eq('album_id', albumId)
    .order('added_at', { ascending: false })
  if (!data) return []
  return data.map((row: any) => row.moments as Moment)
}

export async function removeMomentFromAlbum(albumId: string, momentId: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('album_moments')
    .delete()
    .eq('album_id', albumId)
    .eq('moment_id', momentId)
  return { error }
}

export async function deleteAlbum(albumId: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('albums')
    .delete()
    .eq('id', albumId)
  return { error }
}

export async function updateAlbumTitle(albumId: string, title: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('albums')
    .update({ title: title.trim() })
    .eq('id', albumId)
  return { error }
}

// Batch-загрузка реакций для ленты (один запрос на все моменты)
export async function getFeedReactions(momentIds: string[]): Promise<{ moment_id: string; user_id: string; type: ReactionType }[]> {
  if (momentIds.length === 0) return []
  const { data } = await supabase
    .from('reactions')
    .select('moment_id, user_id, type')
    .in('moment_id', momentIds)
  return (data as { moment_id: string; user_id: string; type: ReactionType }[]) ?? []
}

// ─────────────────────────────────────────────
// COMMENTS
// ─────────────────────────────────────────────

export async function getComments(momentId: string): Promise<CommentWithProfile[]> {
  const { data: comments } = await supabase
    .from('comments')
    .select('*')
    .eq('moment_id', momentId)
    .order('created_at', { ascending: true })
  if (!comments || comments.length === 0) return []

  // Подгружаем профили отдельным запросом (нет FK comments→profiles)
  const userIds = [...new Set(comments.map((c: any) => c.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('id', userIds)
  const profileMap: Record<string, any> = {}
  for (const p of profiles ?? []) profileMap[p.id] = p

  return comments.map((c: any) => ({ ...c, profiles: profileMap[c.user_id] ?? null }))
}

export async function addComment(momentId: string, userId: string, text: string): Promise<{ data: any; error: any }> {
  const { data: comment, error } = await supabase
    .from('comments')
    .insert({ moment_id: momentId, user_id: userId, text: text.trim() })
    .select('*')
    .single()
  if (error || !comment) return { data: null, error }

  // Подгружаем профиль автора отдельно
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return { data: { ...comment, profiles: profile ?? null }, error: null }
}

export async function deleteComment(commentId: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
  return { error }
}

// ─────────────────────────────────────────────
// SAVED MOMENTS (закладки)
// ─────────────────────────────────────────────

export async function saveMoment(userId: string, momentId: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('saved_moments')
    .insert({ user_id: userId, moment_id: momentId })
  return { error }
}

export async function unsaveMoment(userId: string, momentId: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('saved_moments')
    .delete()
    .eq('user_id', userId)
    .eq('moment_id', momentId)
  return { error }
}

/** Возвращает ID всех сохранённых моментов пользователя */
export async function getSavedMomentIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('saved_moments')
    .select('moment_id')
    .eq('user_id', userId)
  return (data as { moment_id: string }[])?.map(r => r.moment_id) ?? []
}

/** Возвращает сохранённые моменты с профилями авторов */
export async function getSavedMoments(userId: string): Promise<MomentWithProfile[]> {
  const { data } = await supabase
    .from('saved_moments')
    .select('moment_id, moments(*, profiles(*))')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false })
  if (!data) return []
  return data
    .map((row: any) => row.moments as MomentWithProfile)
    .filter(Boolean)
}

// ─────────────────────────────────────────────
// MODERATION
// ─────────────────────────────────────────────

/** Проверяет, является ли пользователь админом */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single()
  return (data as any)?.is_admin === true
}

/** Проверяет, заблокирован ли пользователь (не может пользоваться приложением) */
export async function isUserBlocked(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('is_blocked')
    .eq('id', userId)
    .single()
  return (data as any)?.is_blocked === true
}

/** Отправить репорт на момент */
export async function reportMoment(
  reporterId: string,
  momentId: string,
  reason: string,
): Promise<{ error: any }> {
  const { error } = await supabase
    .from('reports')
    .insert({ reporter_id: reporterId, reported_moment_id: momentId, reason })
  return { error }
}

/** Отправить репорт на пользователя */
export async function reportUser(
  reporterId: string,
  userId: string,
  reason: string,
): Promise<{ error: any }> {
  const { error } = await supabase
    .from('reports')
    .insert({ reporter_id: reporterId, reported_user_id: userId, reason })
  return { error }
}

/** [ADMIN] Получить список репортов */
export async function getReports(status?: 'pending' | 'reviewed' | 'dismissed') {
  let query = supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data } = await query
  return data ?? []
}

/** [ADMIN] Обновить статус репорта */
export async function updateReportStatus(
  reportId: string,
  status: 'reviewed' | 'dismissed',
  adminNote?: string,
): Promise<{ error: any }> {
  const { error } = await supabase
    .from('reports')
    .update({ status, ...(adminNote ? { admin_note: adminNote } : {}) })
    .eq('id', reportId)
  return { error }
}

/** [ADMIN] Удалить любой момент */
export async function adminDeleteMoment(momentId: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('moments')
    .delete()
    .eq('id', momentId)
  return { error }
}

/** [ADMIN] Теневой бан — контент скрыт для всех кроме самого пользователя и админов */
export async function adminBanUser(userId: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_banned: true })
    .eq('id', userId)
  return { error }
}

/** [ADMIN] Снять теневой бан */
export async function adminUnbanUser(userId: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_banned: false })
    .eq('id', userId)
  return { error }
}

/** [ADMIN] Жёсткий блок — пользователь не может зайти в приложение */
export async function adminBlockUser(userId: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_blocked: true })
    .eq('id', userId)
  return { error }
}

/** [ADMIN] Снять жёсткий блок */
export async function adminUnblockUser(userId: string): Promise<{ error: any }> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_blocked: false })
    .eq('id', userId)
  return { error }
}

/** [ADMIN] Получить профиль с полями модерации */
export async function getProfileWithModerationStatus(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (!data) return null
  const d = data as any
  return {
    ...d,
    is_admin:   d.is_admin   ?? false,
    is_blocked: d.is_blocked ?? false,
    is_banned:  d.is_banned  ?? false,
  } as Profile & { is_admin: boolean; is_blocked: boolean; is_banned: boolean }
}
