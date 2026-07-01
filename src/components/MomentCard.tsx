import { useState } from 'react'
import { View, Text, Image, TouchableOpacity, Pressable, StyleSheet, Dimensions, Alert, Share } from 'react-native'
import * as MediaLibrary from 'expo-media-library'
import * as FileSystem from 'expo-file-system/legacy'
import { MomentWithProfile, ReactionType } from '../../lib/database.types'
import { C } from '../theme'
import { EMOTIONS, getCustomReaction, getTopReaction } from '../lib/reactions'

const { width } = Dimensions.get('window')

interface Props {
  moment: MomentWithProfile
  currentUserId?: string
  isAdmin?: boolean
  reactionCounts?: Partial<Record<ReactionType, number>>
  userReaction?: ReactionType | null
  directTopReaction?: boolean
  onRegisterPrompt?: () => void
  onOpenDetail?: () => void
  onReact?: (momentId: string, type: ReactionType) => void
  onAuthorPress?: () => void
  onBookmark?: () => void
  onReport?: (momentId: string) => void
  onAdminDelete?: (momentId: string) => void
  onAdminBan?: (userId: string, username: string) => void
  onAdminBlock?: (userId: string, username: string) => void
  isSaved?: boolean
}

export default function MomentCard({
  moment, currentUserId, isAdmin = false,
  reactionCounts, userReaction, directTopReaction = false,
  onOpenDetail, onReact, onAuthorPress,
  onBookmark, onReport, onAdminDelete, onAdminBan, onAdminBlock,
  isSaved = false,
}: Props) {
  const profile = moment.profiles
  const displayName = profile?.display_name || profile?.username || 'antigram'
  const avatarLetter = displayName[0].toUpperCase()
  const [captionExpanded, setCaptionExpanded] = useState(false)
  const [showReactionPicker, setShowReactionPicker] = useState(false)

  const topReaction = getTopReaction(reactionCounts ?? {}, moment)
  const customReaction = getCustomReaction(moment)
  const isReacted = topReaction ? userReaction === topReaction.type : false

  async function handleDownload() {
    try {
      // Запрашиваем разрешение на доступ к галерее
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Нет доступа', 'Разреши доступ к галерее в настройках телефона')
        return
      }

      // Скачиваем фото во временный файл
      const filename = `antigram_${Date.now()}.jpg`
      const localUri = FileSystem.cacheDirectory + filename
      const { uri } = await FileSystem.downloadAsync(moment.photo_url, localUri)

      // Сохраняем в галерею
      await MediaLibrary.saveToLibraryAsync(uri)
      Alert.alert('Сохранено', 'Фото сохранено в галерею 📷')
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить фото')
    }
  }

  function handleShare() {
    Share.share({
      message: moment.caption ?? 'Смотри фото в Antigram',
      url: moment.photo_url,
    }).catch(() => {})
  }

  function handleBookmark() {
    if (onBookmark) {
      onBookmark()
    } else {
      Alert.alert('Закладки', 'Функция появится в следующем обновлении')
    }
  }

  function handleTopReactionPress() {
    if (!topReaction || !onReact) {
      onOpenDetail?.()
      return
    }
    if (directTopReaction) {
      onReact(moment.id, topReaction.type)
      setShowReactionPicker(false)
      return
    }
    setShowReactionPicker(open => !open)
  }

  function handleReact(type: ReactionType) {
    onReact?.(moment.id, type)
    setShowReactionPicker(false)
  }

  const hasLongCaption = (moment.caption?.length ?? 0) > 80
  const isOwnPost = currentUserId === moment.user_id
  const authorName = profile?.display_name || profile?.username || 'пользователя'

  function handleMoreMenu() {
    const adminOptions = isAdmin && !isOwnPost
      ? [
          {
            text: '🗑 Удалить пост',
            onPress: () => Alert.alert(
              'Удалить пост?',
              'Это действие необратимо.',
              [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Удалить', style: 'destructive', onPress: () => onAdminDelete?.(moment.id) },
              ],
            ),
          },
          {
            text: '🚫 Теневой бан',
            onPress: () => Alert.alert(
              `Забанить @${authorName}?`,
              'Контент пользователя будет скрыт от других. Сам пользователь ничего не заметит.',
              [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Забанить', style: 'destructive', onPress: () => onAdminBan?.(moment.user_id, authorName) },
              ],
            ),
          },
          {
            text: '⛔ Заблокировать',
            onPress: () => Alert.alert(
              `Заблокировать @${authorName}?`,
              'Пользователь не сможет войти в приложение.',
              [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Заблокировать', style: 'destructive', onPress: () => onAdminBlock?.(moment.user_id, authorName) },
              ],
            ),
          },
        ]
      : []

    Alert.alert(
      'Действия',
      undefined,
      [
        ...adminOptions,
        ...(!isOwnPost ? [{
          text: '⚑ Пожаловаться',
          onPress: () => {
            Alert.alert(
              'Причина жалобы',
              undefined,
              [
                { text: 'Спам', onPress: () => onReport?.(moment.id) },
                { text: 'Оскорбительный контент', onPress: () => onReport?.(moment.id) },
                { text: 'Другое', onPress: () => onReport?.(moment.id) },
                { text: 'Отмена', style: 'cancel' },
              ],
            )
          },
        }] : []),
        { text: 'Отмена', style: 'cancel' },
      ],
    )
  }

  return (
    <View style={styles.card}>

      {/* Фото — скруглённое, с отступами по бокам */}
      <Pressable onPress={onOpenDetail}>
        <View style={styles.photoWrap}>
          <Image source={{ uri: moment.photo_url }} style={styles.photoImg} resizeMode="cover" />
          {showReactionPicker && onReact && (
            <View style={styles.quickPicker}>
              {EMOTIONS.map(reaction => (
                <TouchableOpacity
                  key={reaction.type}
                  style={[
                    styles.quickReaction,
                    userReaction === reaction.type && styles.quickReactionActive,
                  ]}
                  onPress={(event) => {
                    event.stopPropagation()
                    handleReact(reaction.type)
                  }}
                >
                  <Text style={styles.quickReactionEmoji}>{reaction.emoji}</Text>
                </TouchableOpacity>
              ))}
              {customReaction && (
                <TouchableOpacity
                  style={[
                    styles.quickReactionCustom,
                    userReaction === 'custom' && styles.quickReactionActive,
                  ]}
                  onPress={(event) => {
                    event.stopPropagation()
                    handleReact('custom')
                  }}
                >
                  <Text style={styles.quickReactionEmoji}>{customReaction.emoji}</Text>
                  <Text style={styles.quickReactionLabel} numberOfLines={1}>{customReaction.label}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {topReaction && (
            <TouchableOpacity
              style={[styles.overlayReaction, isReacted && styles.overlayReactionActive]}
              onPress={(event) => {
                event.stopPropagation()
                handleTopReactionPress()
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.overlayReactionEmoji}>{topReaction.emoji}</Text>
              <Text
                style={[styles.overlayReactionLabel, isReacted && styles.overlayReactionTextActive]}
                numberOfLines={1}
              >
                {topReaction.label}
              </Text>
              <Text style={[styles.overlayReactionCount, isReacted && styles.overlayReactionTextActive]}>
                {topReaction.count}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </Pressable>

      {/* Автор + кнопки действий — под фото */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.authorArea}
          onPress={onAuthorPress}
          disabled={!onAuthorPress}
          activeOpacity={onAuthorPress ? 0.7 : 1}
        >
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.username}>{displayName}</Text>
            <Text style={styles.time}>{formatTime(moment.created_at)}</Text>
          </View>
        </TouchableOpacity>

        {/* Action buttons: Download + Share + Bookmark + More */}
        <View style={styles.actionBtns}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleDownload} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.actionIcon}>↓</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.actionIcon}>↗</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, isSaved && styles.actionBtnSaved]} onPress={handleBookmark} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.actionIcon, isSaved && styles.actionIconSaved]}>⌂</Text>
          </TouchableOpacity>
          {/* Меню: репорт + admin-действия */}
          {(!isOwnPost || isAdmin) && (
            <TouchableOpacity style={styles.actionBtn} onPress={handleMoreMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.actionIcon}>⋯</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Подпись с expand */}
      {moment.caption ? (
        <View style={styles.captionWrap}>
          <Text
            style={styles.caption}
            numberOfLines={captionExpanded ? undefined : 2}
          >
            {moment.caption}
          </Text>
          {hasLongCaption && (
            <TouchableOpacity onPress={() => setCaptionExpanded(v => !v)}>
              <Text style={styles.captionToggle}>
                {captionExpanded ? 'скрыть' : 'ещё'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Нижняя строка: комментарий + реакции + ⊕ */}
      <View style={styles.bottomRow}>
        <TouchableOpacity onPress={onOpenDetail} style={{ flex: 1 }}>
          <Text style={styles.commentPlaceholder}>Добавить комментарий...</Text>
        </TouchableOpacity>

        <View style={styles.reactionsArea}>
          <TouchableOpacity
            onPress={(event) => {
              event.stopPropagation()
              if (onReact) setShowReactionPicker(open => !open)
              else onOpenDetail?.()
            }}
            style={styles.addReactionBtn}
          >
            <Text style={styles.addReactionIcon}>⊕</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.divider} />
    </View>
  )
}

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'только что'
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  if (hours < 48) return 'вчера'
  return `${Math.floor(hours / 24)} д назад`
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.BG },

  photoWrap: {
    width: width - 24,
    alignSelf: 'center',
    marginTop: 10,
    borderRadius: 14,
    overflow: 'hidden',
    aspectRatio: 1,
  },
  photoImg: { width: '100%', height: '100%' },

  overlayReaction: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    maxWidth: '66%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(20,14,10,0.78)',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  overlayReactionActive: {
    backgroundColor: 'rgba(201,132,62,0.30)',
    borderColor: C.AMBER,
  },
  overlayReactionEmoji: { fontSize: 14 },
  overlayReactionLabel: {
    color: C.WHITE,
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 110,
  },
  overlayReactionCount: {
    color: C.WHITE,
    fontSize: 12,
    fontWeight: '800',
  },
  overlayReactionTextActive: {
    color: C.AMBER_LIGHT,
  },
  quickPicker: {
    position: 'absolute',
    left: 10,
    bottom: 52,
    maxWidth: '92%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(20,14,10,0.88)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(201,132,62,0.35)',
  },
  quickReaction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  quickReactionCustom: {
    height: 32,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  quickReactionActive: {
    backgroundColor: 'rgba(201,132,62,0.28)',
    borderColor: C.AMBER,
  },
  quickReactionEmoji: { fontSize: 16 },
  quickReactionLabel: {
    color: C.WHITE,
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 72,
  },

  // Header row: автор слева, кнопки справа
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  authorArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarImg: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: C.BORDER,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.BG_WARM,
    borderWidth: 1, borderColor: C.BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: C.BROWN, fontWeight: '700', fontSize: 14 },
  headerText: { flex: 1 },
  username: { color: C.BROWN_MID, fontWeight: '600', fontSize: 14 },
  time: { color: C.TEXT_MUTED, fontSize: 11, marginTop: 1 },

  // Action buttons ↓ ⌂
  actionBtns: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    flexShrink: 0,
  },
  actionBtn: {
    width: 34, height: 34,
    justifyContent: 'center', alignItems: 'center',
    borderRadius: 17,
    backgroundColor: 'rgba(201,146,42,0.08)',
  },
  actionBtnSaved: {
    backgroundColor: C.AMBER,
  },
  actionIcon: {
    color: C.AMBER,
    fontSize: 16,
    fontWeight: '600',
  },
  actionIconSaved: {
    color: C.WHITE,
  },

  // Caption
  captionWrap: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 4,
  },
  caption: {
    color: C.TEXT, fontSize: 14, lineHeight: 20,
  },
  captionToggle: {
    color: C.AMBER,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },

  // Bottom row
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  commentPlaceholder: { color: C.TEXT_MUTED, fontSize: 13 },

  reactionsArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },

  // ⊕ кнопка
  addReactionBtn: {
    width: 30, height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: C.AMBER,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  addReactionIcon: {
    color: C.AMBER,
    fontSize: 16,
    fontWeight: '300',
    lineHeight: 18,
  },

  divider: { height: 1, backgroundColor: C.DIVIDER },
})
