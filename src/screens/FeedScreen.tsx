import { useState, useCallback, useRef } from 'react'
import {
  View, FlatList, StyleSheet, Text, Image, Alert,
  RefreshControl, ActivityIndicator, TouchableOpacity, Platform,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { getFeed, getMomentsByEmotion, getFeedReactions, getProfile, getSavedMomentIds, saveMoment, unsaveMoment, reportMoment, adminDeleteMoment, adminBanUser, adminBlockUser } from '../../lib/db'
import { track, Events } from '../../lib/analytics'
import { MomentWithProfile, Profile, ReactionType } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import MomentCard from '../components/MomentCard'
import CategoryFilmStrip, { CategoryItem } from '../components/CategoryFilmStrip'
import { useAppContext } from '../context/AppContext'
import { C } from '../theme'

// Эмоции — те же что на карточке момента, совпадают с ReactionType
const EMOTION_IDS = new Set<string>(['warm', 'nostalgic', 'calm', 'wow', 'relatable'])

const BASE_CATEGORIES: CategoryItem[] = [
  { id: 'for_you',    label: 'For you'       },
  { id: 'warm',       label: '🔥 Тепло'      },
  { id: 'nostalgic',  label: '🌅 Ностальгия' },
  { id: 'calm',       label: '🌿 Спокойно'   },
  { id: 'wow',        label: '✨ Вау'         },
  { id: 'relatable',  label: '🤍 Близко'     },
]

export default function FeedScreen() {
  const { exitGuestMode, isGuest, isAdmin } = useAppContext()
  const navigation = useNavigation<any>()
  const [moments, setMoments]       = useState<MomentWithProfile[]>([])
  const [reactionMap, setReactionMap] = useState<Record<string, Partial<Record<ReactionType, number>>>>({})
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | undefined>()
  const [myProfile, setMyProfile]   = useState<Profile | null>(null)
  const [activeCatId, setActiveCatId] = useState('for_you')
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [categories, setCategories] = useState<CategoryItem[]>(BASE_CATEGORIES)

  // Флаг: лента уже загружена — не перезагружаем при возврате назад
  const feedLoaded = useRef(false)

  // Загружаем превью (топ-1 фото) для каждой эмоции в стрипе — один раз при старте
  const thumbnailsLoaded = useRef(false)
  async function loadEmotionThumbnails() {
    if (thumbnailsLoaded.current) return
    thumbnailsLoaded.current = true
    const emotions = ['warm', 'nostalgic', 'calm', 'wow', 'relatable'] as ReactionType[]
    const results = await Promise.all(
      emotions.map(e => getMomentsByEmotion(e, 1))
    )
    setCategories(prev => prev.map(cat => {
      const idx = emotions.indexOf(cat.id as ReactionType)
      if (idx === -1) return cat
      const top = results[idx][0]
      return top ? { ...cat, photoUrl: top.photo_url } : cat
    }))
  }

  useFocusEffect(
    useCallback(() => {
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        setCurrentUserId(user?.id)
        if (user && !myProfile) {
          const prof = await getProfile(user.id)
          setMyProfile(prof)
        }
      })
      // Загружаем только при первом открытии — pull-to-refresh для обновления
      if (!feedLoaded.current) {
        feedLoaded.current = true
        loadFeed(false, activeCatId)
      }
      loadEmotionThumbnails()
    }, [])
  )

  async function loadFeed(silent = false, catId = activeCatId) {
    if (!silent) setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    let data: MomentWithProfile[] = []
    if (EMOTION_IDS.has(catId)) {
      // Лента по эмоции — публичные посты, топ по кол-ву этой реакции
      data = await getMomentsByEmotion(catId as ReactionType, 30)
    } else {
      // For you — персональная лента по подпискам
      data = user ? await getFeed(user.id, 30) : []
    }
    setMoments(data)

    if (data.length > 0) {
      const ids = data.map(m => m.id)
      const [rawReactions, savedList] = await Promise.all([
        getFeedReactions(ids),
        user ? getSavedMomentIds(user.id) : Promise.resolve([] as string[]),
      ])
      const map: Record<string, Partial<Record<ReactionType, number>>> = {}
      for (const r of rawReactions) {
        if (!map[r.moment_id]) map[r.moment_id] = {}
        map[r.moment_id][r.type] = (map[r.moment_id][r.type] ?? 0) + 1
      }
      setReactionMap(map)
      setSavedIds(new Set(savedList))
    } else {
      setReactionMap({})
      setSavedIds(new Set())
    }

    setLoading(false)
  }

  async function handleBookmark(momentId: string) {
    if (isGuest) { exitGuestMode(); return }
    // Берём user напрямую — не зависим от currentUserId state (race condition)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const uid = user.id
    // Обновляем currentUserId если ещё не установлен
    if (!currentUserId) setCurrentUserId(uid)

    const isSaved = savedIds.has(momentId)
    // Оптимистичное обновление
    setSavedIds(prev => {
      const next = new Set(prev)
      if (isSaved) next.delete(momentId)
      else next.add(momentId)
      return next
    })

    if (isSaved) {
      const { error } = await unsaveMoment(uid, momentId)
      if (error) {
        // Откат при ошибке
        setSavedIds(prev => { const next = new Set(prev); next.add(momentId); return next })
      }
    } else {
      const { error } = await saveMoment(uid, momentId)
      if (error) {
        // Откат + показываем ошибку чтобы не было немого бага
        setSavedIds(prev => { const next = new Set(prev); next.delete(momentId); return next })
        Alert.alert('Не удалось сохранить', error.message ?? 'Попробуй ещё раз')
      }
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadFeed(false, activeCatId)
    setRefreshing(false)
  }, [activeCatId])

  async function handleReport(momentId: string) {
    if (!currentUserId) return
    await reportMoment(currentUserId, momentId, 'reported')
    Alert.alert('Жалоба отправлена', 'Мы рассмотрим её в ближайшее время.')
  }

  async function handleAdminDelete(momentId: string) {
    await adminDeleteMoment(momentId)
    setMoments(prev => prev.filter(m => m.id !== momentId))
  }

  async function handleAdminBan(userId: string, username: string) {
    await adminBanUser(userId)
    setMoments(prev => prev.filter(m => m.user_id !== userId))
    Alert.alert('Готово', `@${username} получил теневой бан.`)
  }

  async function handleAdminBlock(userId: string, username: string) {
    await adminBlockUser(userId)
    setMoments(prev => prev.filter(m => m.user_id !== userId))
    Alert.alert('Готово', `@${username} заблокирован.`)
  }

  const myAvatarLetter = (myProfile?.display_name || myProfile?.username || 'A')[0].toUpperCase()

  function handleSearchTap() {
    if (isGuest) { exitGuestMode(); return }
    navigation.navigate('Search')
  }

  function handleMyAvatarTap() {
    if (isGuest) { exitGuestMode(); return }
    navigation.navigate('Profile')
  }

  function handleCategorySelect(id: string) {
    if (isGuest) { exitGuestMode(); return }
    if (id === activeCatId) return  // уже выбрана
    setActiveCatId(id)
    feedLoaded.current = false      // сбрасываем флаг чтобы перезагрузить
    loadFeed(false, id)
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.AMBER} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={moments}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {/* ── AppHeader ── */}
            <View style={styles.appHeader}>
              <Text style={styles.appLogo}>Antigram</Text>

              <TouchableOpacity style={styles.searchWrap} onPress={handleSearchTap} activeOpacity={0.75}>
                <Text style={styles.searchIcon}>🔍</Text>
                <Text style={styles.searchPlaceholder}>Поиск</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleMyAvatarTap} style={styles.myAvatarWrap}>
                {myProfile?.avatar_url ? (
                  <Image source={{ uri: myProfile.avatar_url }} style={styles.myAvatar} />
                ) : (
                  <View style={styles.myAvatarFallback}>
                    <Text style={styles.myAvatarLetter}>{myAvatarLetter}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* ── CategoryFilmStrip ── */}
            <CategoryFilmStrip
              categories={categories}
              activeId={activeCatId}
              onSelect={handleCategorySelect}
            />
          </>
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyEmoji}>📷</Text>
            <Text style={styles.emptyTitle}>Пока здесь пусто</Text>
            <Text style={styles.emptyHint}>Опубликуй первый момент</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <>
            {/* "Фото дня" — метка перед первым постом */}
            {index === 0 && (
              <View style={styles.photoDayLabel}>
                <Text style={styles.photoDayDot}>✦</Text>
                <Text style={styles.photoDayText}>Фото дня</Text>
              </View>
            )}
            <MomentCard
              moment={item}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              reactionCounts={reactionMap[item.id] ?? {}}
              isSaved={savedIds.has(item.id)}
              onRegisterPrompt={exitGuestMode}
              onOpenDetail={() => {
                if (isGuest) { exitGuestMode(); return }
                navigation.navigate('MomentDetail', {
                  moment: item,
                  isOwner: item.user_id === currentUserId,
                })
              }}
              onAuthorPress={() => {
                if (isGuest) { exitGuestMode(); return }
                if (item.user_id === currentUserId) {
                  navigation.navigate('Profile')
                } else {
                  navigation.navigate('OtherProfile', { userId: item.user_id })
                }
              }}
              onBookmark={() => handleBookmark(item.id)}
              onReport={handleReport}
              onAdminDelete={handleAdminDelete}
              onAdminBan={handleAdminBan}
              onAdminBlock={handleAdminBlock}
            />
          </>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.AMBER}
          />
        }
        showsVerticalScrollIndicator={false}
        onEndReached={() => track(Events.FEED_SCROLLED, { reached_end: true, items_count: moments.length })}
        onEndReachedThreshold={0.5}
        ListFooterComponent={<View style={{ height: 32 }} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  centered: {
    flex: 1, backgroundColor: C.BG,
    justifyContent: 'center', alignItems: 'center', gap: 10,
  },

  // AppHeader
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: Platform.OS === 'ios' ? 56 : 32,
    paddingBottom: 10,
    paddingHorizontal: 14,
    backgroundColor: C.BG,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  appLogo: {
    color: C.BROWN,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.BG_WARM,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 6,
  },
  searchIcon: { fontSize: 13 },
  searchPlaceholder: {
    color: C.TEXT_PH,
    fontSize: 14,
    flex: 1,
  },
  myAvatarWrap: { flexShrink: 0 },
  myAvatar: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5, borderColor: C.AMBER,
  },
  myAvatarFallback: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.BG_WARM,
    borderWidth: 1.5, borderColor: C.AMBER,
    justifyContent: 'center', alignItems: 'center',
  },
  myAvatarLetter: { color: C.BROWN, fontWeight: '700', fontSize: 13 },

  // Photo of the day
  photoDayLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  photoDayDot: {
    color: C.AMBER,
    fontSize: 12,
  },
  photoDayText: {
    color: C.BROWN,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: C.TEXT, fontSize: 17, fontWeight: '600' },
  emptyHint: { color: C.TEXT_MUTED, fontSize: 14 },
})
