/**
 * ShotsScrollFeed — вертикальный фид кадров одного пользователя.
 *
 * Открывается:
 *   - Тап на фото в сетке профиля (собственный или чужой)
 *   - Тап на фото в ленте
 *
 * Navigation params:
 *   userId:       чей фид показываем
 *   title:        "Мои кадры" | "Shots" | etc.
 *   startMomentId?: ID момента, до которого прокрутить при открытии
 *   isOwner?:     true = свой профиль (показываем все фото, включая приватные)
 */

import { useEffect, useRef, useState } from 'react'
import {
  View, FlatList, StyleSheet, Text, ActivityIndicator,
  TouchableOpacity, Dimensions, Alert,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import {
  addReaction, getProfile, getUserMoments, getFeedReactions,
  adminDeleteMoment, adminBanUser, adminBlockUser,
} from '../../lib/db'
import type { Moment, MomentWithProfile, Profile, ReactionType } from '../../lib/database.types'
import MomentCard from '../components/MomentCard'
import Avatar from '../components/Avatar'
import { C } from '../theme'
import { useAppContext } from '../context/AppContext'

const W = Dimensions.get('window').width

// Примерная высота одной карточки для getItemLayout
// Квадратное фото + отступ + автор + комментарий/реакция + время + разделитель
const PHOTO_SZ  = W - 24
const CARD_UI   = 130   // author≈50 + comment/reaction≈50 + time≈20 + divider≈1 + margins≈9
const ITEM_H    = PHOTO_SZ + CARD_UI

interface RouteParams {
  userId: string
  title?: string
  startMomentId?: string
  isOwner?: boolean
}

export default function ShotsScrollFeed() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { userId, title = 'Shots', startMomentId, isOwner = false } = route.params as RouteParams
  const { isAdmin } = useAppContext()

  const [moments, setMoments] = useState<MomentWithProfile[]>([])
  const [reactionMap, setReactionMap] = useState<Record<string, Partial<Record<ReactionType, number>>>>({})
  const [userReactionMap, setUserReactionMap] = useState<Record<string, ReactionType | null>>({})
  const [profile, setProfile] = useState<Profile | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)

  const listRef = useRef<FlatList>(null)
  const scrolledRef = useRef(false)

  // Индекс начального момента — вычисляем после загрузки для initialScrollIndex
  const startIdx = moments.length > 0 && startMomentId
    ? Math.max(0, moments.findIndex(m => m.id === startMomentId))
    : 0

  useEffect(() => {
    load()
  }, [userId])

  async function load() {
    setLoading(true)
    const [{ data: { user } }, prof, rawMoments] = await Promise.all([
      supabase.auth.getUser(),
      getProfile(userId),
      getUserMoments(userId),
    ])

    setCurrentUserId(user?.id)
    setProfile(prof)

    // Фильтр: для чужих — только публичные
    const filtered = isOwner
      ? rawMoments
      : rawMoments.filter(m => m.is_public)

    // Конвертируем Moment[] → MomentWithProfile[] (профиль уже есть)
    const withProfile: MomentWithProfile[] = filtered.map(m => ({
      ...m,
      profiles: prof ?? {
        id: userId,
        username: null,
        display_name: null,
        bio: null,
        avatar_url: null,
        website: null,
        created_at: '',
      },
    }))

    setMoments(withProfile)

    // Реакции
    if (withProfile.length > 0) {
      const ids = withProfile.map(m => m.id)
      const raw = await getFeedReactions(ids)
      const map: Record<string, Partial<Record<ReactionType, number>>> = {}
      const userMap: Record<string, ReactionType | null> = {}
      for (const r of raw) {
        if (!map[r.moment_id]) map[r.moment_id] = {}
        map[r.moment_id][r.type] = (map[r.moment_id][r.type] ?? 0) + 1
        if (user && r.user_id === user.id) userMap[r.moment_id] = r.type
      }
      setReactionMap(map)
      setUserReactionMap(userMap)
    }

    setLoading(false)
  }

  async function handleReact(momentId: string, type: ReactionType) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const previous = userReactionMap[momentId] ?? null
    if (previous === type) return

    setUserReactionMap(prev => ({ ...prev, [momentId]: type }))
    setReactionMap(prev => {
      const current = { ...(prev[momentId] ?? {}) }
      if (previous) current[previous] = Math.max(0, (current[previous] ?? 0) - 1)
      current[type] = (current[type] ?? 0) + 1
      return { ...prev, [momentId]: current }
    })

    const { error } = await addReaction(momentId, user.id, type)
    if (error) {
      setUserReactionMap(prev => ({ ...prev, [momentId]: previous }))
      setReactionMap(prev => {
        const current = { ...(prev[momentId] ?? {}) }
        current[type] = Math.max(0, (current[type] ?? 0) - 1)
        if (previous) current[previous] = (current[previous] ?? 0) + 1
        return { ...prev, [momentId]: current }
      })
    }
  }

  function handleAdminDelete(momentId: string) {
    Alert.alert('Удалить фото?', 'Это действие нельзя отменить', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive',
        onPress: async () => {
          const { error } = await adminDeleteMoment(momentId)
          if (!error) setMoments(prev => prev.filter(m => m.id !== momentId))
        },
      },
    ])
  }

  function handleAdminBan(targetUserId: string, username: string) {
    Alert.alert(`Забанить ${username}?`, 'Контент будет скрыт для всех', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Забанить', style: 'destructive', onPress: () => adminBanUser(targetUserId) },
    ])
  }

  function handleAdminBlock(targetUserId: string, username: string) {
    Alert.alert(`Заблокировать ${username}?`, 'Пользователь не сможет войти в приложение', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Заблокировать', style: 'destructive', onPress: () => adminBlockUser(targetUserId) },
    ])
  }

  // initialScrollIndex + getItemLayout обеспечивают скролл до нужного фото,
  // useEffect больше не нужен

  const displayName = profile?.display_name || profile?.username || ''

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.AMBER} />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>{title}</Text>

        {/* Аватар пользователя */}
        <View style={styles.headerRight}>
          <Avatar uri={profile?.avatar_url} name={displayName} size={32} borderColor={C.BORDER} />
        </View>
      </View>

      {/* Фид */}
      {moments.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Нет кадров</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={moments}
          keyExtractor={m => m.id}
          showsVerticalScrollIndicator={false}
          initialScrollIndex={startIdx}
          getItemLayout={(_, index) => ({
            length: ITEM_H,
            offset: ITEM_H * index,
            index,
          })}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0 })
            }, 300)
          }}
          renderItem={({ item }) => (
            <MomentCard
              moment={item}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              reactionCounts={reactionMap[item.id] ?? {}}
              userReaction={userReactionMap[item.id] ?? null}
              onReact={handleReact}
              onOpenDetail={() => navigation.navigate('MomentDetail', { moment: item, isOwner })}
              onAuthorPress={() => {
                if (isOwner) {
                  navigation.navigate('Profile')
                } else {
                  navigation.navigate('OtherProfile', { userId })
                }
              }}
              onAdminDelete={handleAdminDelete}
              onAdminBan={handleAdminBan}
              onAdminBlock={handleAdminBlock}
            />
          )}
          ListFooterComponent={<View style={{ height: 32 }} />}
        />
      )}
    </View>
  )
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },
  centered: { flex: 1, backgroundColor: C.BG, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: C.BG,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'flex-start' },
  backIcon: { color: C.TEXT, fontSize: 22 },
  headerTitle: {
    flex: 1,
    color: C.TEXT,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginRight: 36, // компенсирует ширину avatar справа
  },
  headerRight: {},
  headerAvatar: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, borderColor: C.BORDER,
  },
  headerAvatarFallback: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.BG_WARM,
    borderWidth: 1, borderColor: C.BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarLetter: { color: C.BROWN, fontWeight: '700', fontSize: 13 },

  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: C.TEXT_MUTED, fontSize: 15 },
})
