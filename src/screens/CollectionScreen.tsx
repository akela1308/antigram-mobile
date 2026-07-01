/**
 * CollectionScreen — Discovery / Подборка
 *
 * Layout (сверху вниз):
 *   AppHeader:  "Antigram"  [🔍 Search]  [Avatar]
 *   Категории:  горизонтальный скролл FilmStrip-таблеток
 *   Заголовок:  активная категория
 *   Сетка:      2 колонки, каждое фото — аватар автора поверх (top-left)
 *
 * Категории:
 *   "For you"     → случайная выборка публичных фото
 *   "#Animals"    → фильтр по caption/mood
 *   "Love"        → фильтр по caption/mood
 *   "#Music"      → фильтр по caption/mood
 *   "#Travelling" → фильтр по caption/mood
 *
 * Поиск: фильтрует сетку по username/caption в реальном времени.
 * Тап на фото → ShotsScrollFeed автора (прокручен к этому фото).
 * Тап на аватар → OtherProfile / Profile.
 */

import { useState, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity,
  TextInput, ActivityIndicator, Dimensions, Platform,
} from 'react-native'
import CategoryFilmStrip, { CategoryItem } from '../components/CategoryFilmStrip'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import { addReaction, getFeedReactions, getProfile, getRandomMoments, getMomentsByEmotion } from '../../lib/db'
import type { MomentWithProfile, Profile, ReactionType } from '../../lib/database.types'
import { C } from '../theme'
import { getTopReaction } from '../lib/reactions'
import Avatar from '../components/Avatar'

const W = Dimensions.get('window').width
const GRID_PAD  = 10
const GRID_GAP  = 6
const TILE_W    = (W - GRID_PAD * 2 - GRID_GAP) / 2
const TILE_H    = TILE_W * 1.1

// ─── Категории (эмоции) ───────────────────────────────────────────────────────

const EMOTION_IDS = new Set<string>(['warm', 'nostalgic', 'calm', 'wow', 'relatable'])

const BASE_CATEGORIES: CategoryItem[] = [
  { id: 'for_you',   label: 'For you'       },
  { id: 'warm',      label: '🔥 Тепло'      },
  { id: 'nostalgic', label: '🌅 Ностальгия' },
  { id: 'calm',      label: '🌿 Спокойно'   },
  { id: 'wow',       label: '✨ Вау'         },
  { id: 'relatable', label: '🤍 Близко'     },
]

function filterBySearch(moments: MomentWithProfile[], q: string): MomentWithProfile[] {
  if (!q.trim()) return moments
  const lq = q.toLowerCase()
  return moments.filter(m => {
    const username = (m.profiles?.username ?? '').toLowerCase()
    const name     = (m.profiles?.display_name ?? '').toLowerCase()
    const caption  = (m.caption ?? '').toLowerCase()
    return username.includes(lq) || name.includes(lq) || caption.includes(lq)
  })
}

// ─── Экран ────────────────────────────────────────────────────────────────────

export default function CollectionScreen() {
  const navigation = useNavigation<any>()

  const [allMoments, setAllMoments]       = useState<MomentWithProfile[]>([])
  const [reactionMap, setReactionMap]     = useState<Record<string, Partial<Record<ReactionType, number>>>>({})
  const [userReactionMap, setUserReactionMap] = useState<Record<string, ReactionType | null>>({})
  const [myProfile,  setMyProfile]        = useState<Profile | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('for_you')
  const [searchQuery, setSearchQuery]     = useState('')
  const [loading, setLoading]             = useState(true)
  const [searchFocused, setSearchFocused] = useState(false)
  const [categories, setCategories]       = useState<CategoryItem[]>(BASE_CATEGORIES)

  const searchRef        = useRef<TextInput>(null)
  const thumbnailsLoaded = useRef(false)
  const firstLoad        = useRef(false)

  useFocusEffect(
    useCallback(() => {
      if (!firstLoad.current) {
        firstLoad.current = true
        load('for_you')
      }
      loadEmotionThumbnails()
    }, [])
  )

  // Подгружаем превью для каждой эмоции один раз
  async function loadEmotionThumbnails() {
    if (thumbnailsLoaded.current) return
    thumbnailsLoaded.current = true
    const emotions = ['warm', 'nostalgic', 'calm', 'wow', 'relatable'] as ReactionType[]
    const results = await Promise.all(emotions.map(e => getMomentsByEmotion(e, 1)))
    setCategories(prev => prev.map(cat => {
      const idx = emotions.indexOf(cat.id as ReactionType)
      if (idx === -1) return cat
      const top = results[idx][0]
      return top ? { ...cat, photoUrl: top.photo_url } : cat
    }))
  }

  async function load(catId: string) {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUserId(user?.id ?? null)

    let moments: MomentWithProfile[]
    if (EMOTION_IDS.has(catId)) {
      // Эмоция → все публичные посты всех пользователей, топ по этой реакции
      moments = await getMomentsByEmotion(catId as ReactionType, 60)
    } else {
      // For you → случайная выборка публичных фото всех пользователей
      moments = await getRandomMoments(60)
    }

    if (!firstLoad.current || catId === 'for_you') {
      const prof = user ? await getProfile(user.id) : null
      setMyProfile(prof)
    }

    setAllMoments(moments)
    await loadReactions(moments, user?.id)
    setLoading(false)
  }

  async function loadReactions(moments: MomentWithProfile[], userId?: string) {
    if (moments.length === 0) {
      setReactionMap({})
      setUserReactionMap({})
      return
    }

    const raw = await getFeedReactions(moments.map(m => m.id))
    const map: Record<string, Partial<Record<ReactionType, number>>> = {}
    const userMap: Record<string, ReactionType | null> = {}
    for (const r of raw) {
      if (!map[r.moment_id]) map[r.moment_id] = {}
      map[r.moment_id][r.type] = (map[r.moment_id][r.type] ?? 0) + 1
      if (userId && r.user_id === userId) userMap[r.moment_id] = r.type
    }
    setReactionMap(map)
    setUserReactionMap(userMap)
  }

  function handleCategorySelect(id: string) {
    if (id === activeCategory) return
    setActiveCategory(id)
    setSearchQuery('')
    load(id)
  }

  const visible = filterBySearch(allMoments, searchQuery)
  const activeLabel = categories.find(c => c.id === activeCategory)?.label ?? 'For you'

  function handlePhotoTap(moment: MomentWithProfile) {
    navigation.navigate('ShotsScrollFeed', {
      userId: moment.user_id,
      title: moment.profiles?.display_name || moment.profiles?.username || 'Кадры',
      startMomentId: moment.id,
      isOwner: moment.user_id === currentUserId,
    })
  }

  function handleAvatarTap(moment: MomentWithProfile) {
    if (moment.user_id === currentUserId) {
      navigation.navigate('Profile')
    } else {
      navigation.navigate('OtherProfile', { userId: moment.user_id })
    }
  }

  async function handleTileReaction(moment: MomentWithProfile, type: ReactionType, displayedCount: number) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const previous = userReactionMap[moment.id] ?? null
    if (previous === type) return

    setUserReactionMap(prev => ({ ...prev, [moment.id]: type }))
    setReactionMap(prev => {
      const current = { ...(prev[moment.id] ?? {}) }
      if (previous) current[previous] = Math.max(0, (current[previous] ?? 0) - 1)
      current[type] = Math.max(current[type] ?? 0, displayedCount) + 1
      return { ...prev, [moment.id]: current }
    })

    const { error } = await addReaction(moment.id, user.id, type)
    if (error) {
      setUserReactionMap(prev => ({ ...prev, [moment.id]: previous }))
      setReactionMap(prev => {
        const current = { ...(prev[moment.id] ?? {}) }
        current[type] = Math.max(0, (current[type] ?? 0) - 1)
        if (previous) current[previous] = (current[previous] ?? 0) + 1
        return { ...prev, [moment.id]: current }
      })
    }
  }

  function handleMyAvatarTap() {
    navigation.navigate('Profile')
  }

  const listHeader = (
    <>
      {/* ── AppHeader ── */}
      <View style={styles.appHeader}>
        <Text style={styles.appLogo}>Antigram</Text>

        <View style={[styles.searchWrap, searchFocused && styles.searchWrapFocused]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Поиск"
            placeholderTextColor={C.TEXT_PH}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={handleMyAvatarTap} style={styles.myAvatarWrap}>
          <Avatar
            uri={myProfile?.avatar_url}
            name={myProfile?.display_name || myProfile?.username}
            size={34}
            borderWidth={1.5}
            borderColor={C.AMBER}
          />
        </TouchableOpacity>
      </View>

      {/* ── Категории — FilmStrip ── */}
      <CategoryFilmStrip
        categories={categories}
        activeId={activeCategory}
        onSelect={handleCategorySelect}
      />

      {/* ── Заголовок секции ── */}
      {!searchQuery && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{activeLabel}</Text>
        </View>
      )}
      {searchQuery.length > 0 && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {visible.length} {visible.length === 1 ? 'результат' : visible.length < 5 ? 'результата' : 'результатов'}
          </Text>
        </View>
      )}
    </>
  )

  return (
    <View style={styles.root}>
      {loading ? (
        <>
          {listHeader}
          <View style={styles.centered}>
            <ActivityIndicator color={C.AMBER} />
          </View>
        </>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={m => m.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyText}>Ничего не найдено</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <PhotoTile
              moment={item}
              index={index}
              reactionCounts={reactionMap[item.id] ?? {}}
              userReaction={userReactionMap[item.id] ?? null}
              onPhotoTap={handlePhotoTap}
              onAvatarTap={handleAvatarTap}
              onReact={handleTileReaction}
            />
          )}
          ListFooterComponent={<View style={{ height: 32 }} />}
        />
      )}
    </View>
  )
}

// ─── PhotoTile ────────────────────────────────────────────────────────────────

interface TileProps {
  moment: MomentWithProfile
  index: number
  reactionCounts: Partial<Record<ReactionType, number>>
  userReaction: ReactionType | null
  onPhotoTap: (m: MomentWithProfile) => void
  onAvatarTap: (m: MomentWithProfile) => void
  onReact: (m: MomentWithProfile, type: ReactionType, displayedCount: number) => void
}

function PhotoTile({ moment, index, reactionCounts, userReaction, onPhotoTap, onAvatarTap, onReact }: TileProps) {
  const profile = moment.profiles
  const name = profile?.display_name || profile?.username || 'A'
  const topReaction = getTopReaction(reactionCounts, moment)
  const isReacted = topReaction ? userReaction === topReaction.type : false

  const isLeft = index % 2 === 0

  return (
    <TouchableOpacity
      style={[styles.tile, isLeft ? { marginLeft: GRID_PAD } : { marginLeft: GRID_GAP }]}
      onPress={() => onPhotoTap(moment)}
      activeOpacity={0.9}
    >
      <Image
        source={{ uri: moment.photo_url }}
        style={styles.tileImg}
        resizeMode="cover"
      />

      {topReaction && (
        <TouchableOpacity
          style={[styles.tileReaction, isReacted && styles.tileReactionActive]}
          onPress={(e) => {
            e.stopPropagation()
            onReact(moment, topReaction.type, topReaction.count)
          }}
          activeOpacity={0.82}
        >
          <Text style={styles.tileReactionEmoji}>{topReaction.emoji}</Text>
          <Text style={[styles.tileReactionLabel, isReacted && styles.tileReactionTextActive]} numberOfLines={1}>
            {topReaction.label}
          </Text>
          <Text style={[styles.tileReactionCount, isReacted && styles.tileReactionTextActive]}>
            {topReaction.count}
          </Text>
        </TouchableOpacity>
      )}

      {/* Аватар автора — верхний левый угол */}
      <TouchableOpacity
        style={styles.tileAvatarWrap}
        onPress={(e) => { e.stopPropagation(); onAvatarTap(moment) }}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Avatar uri={profile?.avatar_url} name={name} size={30} borderWidth={1.5} borderColor={C.WHITE} />
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyEmoji: { fontSize: 36 },
  emptyText: { color: C.TEXT_MUTED, fontSize: 15 },

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
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 6,
  },
  searchWrapFocused: {
    borderColor: C.AMBER,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    color: C.TEXT,
    fontSize: 14,
    padding: 0,
    margin: 0,
  },
  searchClear: {
    color: C.TEXT_MUTED,
    fontSize: 14,
    paddingLeft: 4,
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


  // Заголовок секции
  sectionHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionTitle: {
    color: C.BROWN,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // Сетка
  gridContent: {
    paddingBottom: 12,
    paddingRight: GRID_PAD,
  },
  gridRow: {
    marginBottom: GRID_GAP,
  },

  // PhotoTile
  tile: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: C.BG_WARM,
  },
  tileImg: {
    width: '100%',
    height: '100%',
  },
  tileReaction: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    maxWidth: TILE_W - 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 15,
    backgroundColor: 'rgba(20,14,10,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  tileReactionActive: {
    backgroundColor: 'rgba(201,132,62,0.30)',
    borderColor: C.AMBER,
  },
  tileReactionEmoji: { fontSize: 12 },
  tileReactionLabel: {
    color: C.WHITE,
    fontSize: 10,
    fontWeight: '700',
    maxWidth: 82,
  },
  tileReactionCount: {
    color: C.WHITE,
    fontSize: 10,
    fontWeight: '800',
  },
  tileReactionTextActive: {
    color: C.AMBER_LIGHT,
  },

  // Аватар автора поверх фото
  tileAvatarWrap: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  tileAvatar: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1.5, borderColor: C.WHITE,
  },
  tileAvatarFallback: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.BG_WARM,
    borderWidth: 1.5, borderColor: C.WHITE,
    justifyContent: 'center', alignItems: 'center',
  },
  tileAvatarLetter: {
    color: C.BROWN,
    fontWeight: '700',
    fontSize: 11,
  },
})
