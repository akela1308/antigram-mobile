import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, Image,
  TouchableOpacity, Dimensions, ActivityIndicator, Alert, Modal,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import {
  getProfile, getUserMoments,
  getFollowersCount, getFollowingCount,
  getUserAlbums,
  getHighlights, setHighlightAtPosition, removeHighlight,
  updateProfile,
  getFeedReactions,
} from '../../lib/db'
import type { Profile, Moment, MomentWithProfile, AlbumWithMoments, HighlightWithMoment, ReactionType } from '../../lib/database.types'
import { C } from '../theme'
import FilmStripProfileHeader from '../components/FilmStripProfileHeader'
import { getTopReaction } from '../lib/reactions'

const W = Dimensions.get('window').width
const GRID_PAD  = 8
const GRID_GAP  = 8
const GRID_TILE_W = (W - GRID_PAD * 2 - GRID_GAP) / 2
const GRID_TILE_H = GRID_TILE_W                      // квадратные плитки
const GRID_FULL_W = W - GRID_PAD * 2  // ширина полного кадра
const GRID_FULL_H = GRID_FULL_W       // квадрат — как 4 маленькие плитки 2×2
const MAX_SLOTS = 5

// ─── Редакционная сетка (4 фото 2×2 → 1 полное → повтор) ─────────────────────
type GridRow =
  | { key: string; type: 'pair'; left: Moment; right: Moment | null }
  | { key: string; type: 'full'; item: Moment }

function buildGridRows(moments: Moment[]): GridRow[] {
  const rows: GridRow[] = []
  let i = 0
  while (i < moments.length) {
    if (i % 5 === 4) {
      rows.push({ key: moments[i].id, type: 'full', item: moments[i] })
      i++
    } else {
      const right = moments[i + 1] ?? null
      rows.push({ key: moments[i].id, type: 'pair', left: moments[i], right })
      i += 2
    }
  }
  return rows
}

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K'
  return String(n)
}

export default function ProfileScreen() {
  const navigation = useNavigation<any>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [moments, setMoments] = useState<Moment[]>([])
  const [reactionMap, setReactionMap] = useState<Record<string, Partial<Record<ReactionType, number>>>>({})
  const [highlights, setHighlights] = useState<HighlightWithMoment[]>([])
  const [albums, setAlbums] = useState<AlbumWithMoments[]>([])
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'film' | 'albums'>('film')
  const [replaceTarget, setReplaceTarget] = useState<number | null>(null)
  const [pickerVisible, setPickerVisible] = useState(false)

  // Дебаунс обновления аватара
  const avatarDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Флаг: не трогаем аватар пока профиль не загружен (защита от mount-вызовов)
  const profileLoaded = useRef(false)

  useFocusEffect(
    useCallback(() => { load() }, [])
  )

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    setUserEmail(user.email ?? null)
    const [prof, moms, frs, fing, hl, albs] = await Promise.all([
      getProfile(user.id), getUserMoments(user.id),
      getFollowersCount(user.id), getFollowingCount(user.id),
      getHighlights(user.id), getUserAlbums(user.id),
    ])
    setProfile(prof)
    setMoments(moms)
    await loadReactions(moms)
    setHighlights(hl)
    setFollowers(frs)
    setFollowing(fing)
    setAlbums(albs)
    setLoading(false)
    profileLoaded.current = true
  }

  async function loadReactions(items: Moment[]) {
    if (items.length === 0) {
      setReactionMap({})
      return
    }
    const raw = await getFeedReactions(items.map(moment => moment.id))
    const map: Record<string, Partial<Record<ReactionType, number>>> = {}
    for (const reaction of raw) {
      if (!map[reaction.moment_id]) map[reaction.moment_id] = {}
      map[reaction.moment_id][reaction.type] = (map[reaction.moment_id][reaction.type] ?? 0) + 1
    }
    setReactionMap(map)
  }

  // 5 слотов для кольцевой карусели (null = пустой)
  const ringPhotos: (string | null)[] = Array.from({ length: MAX_SLOTS }, (_, i) => {
    const hl = highlights.find(h => h.position === i)
    return hl?.moments?.photo_url ?? null
  })

  function openMenu() {
    Alert.alert('', '', [
      {
        text: 'Настройки',
        onPress: () => navigation.navigate('EditProfile', { userId, profile, email: userEmail }),
      },
      {
        text: 'Выйти', style: 'destructive',
        onPress: () =>
          Alert.alert('Выйти из аккаунта?', '', [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Выйти', style: 'destructive', onPress: () => supabase.auth.signOut() },
          ]),
      },
      { text: 'Отмена', style: 'cancel' },
    ])
  }

  function handleTapMoment(moment: Moment) {
    if (!userId) return
    navigation.navigate('ShotsScrollFeed', {
      userId,
      title: 'Мои кадры',
      startMomentId: moment.id,
      isOwner: true,
    })
  }

  // Центральный кадр изменился → обновляем аватар с дебаунсом 1.5с
  // Игнорируем вызовы до завершения первой загрузки профиля
  function handleCenterChange(slotIndex: number) {
    if (!profileLoaded.current || !userId) return
    const url = ringPhotos[slotIndex]
    if (!url) return
    if (avatarDebounce.current) clearTimeout(avatarDebounce.current)
    avatarDebounce.current = setTimeout(() => {
      updateProfile(userId, { avatar_url: url })
      setProfile(prev => prev ? { ...prev, avatar_url: url } : prev)
    }, 1500)
  }

  // Открыть фото из ленты (слот → момент)
  function handleOpenPhoto(slotIndex: number) {
    const hl = highlights.find(h => h.position === slotIndex)
    if (hl?.moments) navigation.navigate('MomentDetail', { moment: hl.moments, isOwner: true })
  }

  // Запрос замены слота → открыть пикер
  function handleReplaceRequest(slotIndex: number) {
    setReplaceTarget(slotIndex)
    setPickerVisible(true)
  }

  // Пользователь выбрал фото для слота
  async function handlePickerSelect(moment: Moment) {
    if (replaceTarget === null || !userId) return
    setPickerVisible(false)

    // Оптимистичное обновление UI
    const newHl: HighlightWithMoment = {
      id: '', user_id: userId, moment_id: moment.id,
      position: replaceTarget, created_at: '',
      moments: moment,
    }
    setHighlights(prev => {
      const filtered = prev.filter(h => h.position !== replaceTarget)
      return [...filtered, newHl].sort((a, b) => a.position - b.position)
    })

    // Сохраняем в DB
    await setHighlightAtPosition(userId, moment.id, replaceTarget)
    setReplaceTarget(null)
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.AMBER} />
      </View>
    )
  }

  const displayName = profile?.display_name || profile?.username || 'antigram'

  return (
    <>
      <FlatList
        style={styles.root}
        data={activeTab === 'film' ? buildGridRows(moments) : []}
        keyExtractor={(row) => row.key}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Top bar */}
            <View style={styles.topBar}>
              <View style={styles.topLeft} />
              <TouchableOpacity
                style={styles.menuBtn}
                onPress={openMenu}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.menuIcon}>≡</Text>
              </TouchableOpacity>
            </View>

            {/* Кольцевая карусель 5 кадров */}
            <FilmStripProfileHeader
              photos={ringPhotos}
              isOwner
              onCenterChange={handleCenterChange}
              onOpenPhoto={handleOpenPhoto}
              onReplaceRequest={handleReplaceRequest}
            />

            {/* Подсказка если ни одного фото не выбрано */}
            {highlights.length === 0 && (
              <View style={styles.hintBanner}>
                <Text style={styles.hintText}>
                  Выберите 5 фото для вашей плёнки — нажмите «+» на любой кадр
                </Text>
              </View>
            )}

            {/* @username под лентой */}
            <View style={styles.usernameBlock}>
              <Text style={styles.usernameText}>
                {profile?.username ? `@${profile.username}` : `@${displayName}`}
              </Text>
              {profile?.bio ? (
                <Text style={styles.bio} numberOfLines={2}>{profile.bio}</Text>
              ) : null}
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{fmt(moments.length)}</Text>
                <Text style={styles.statLabel}>кадры</Text>
              </View>
              <View style={styles.statDivider} />
              <TouchableOpacity
                style={styles.stat}
                onPress={() => userId && navigation.navigate('FollowList', { userId, kind: 'followers' })}
              >
                <Text style={styles.statNum}>{fmt(followers)}</Text>
                <Text style={styles.statLabel}>подписчики</Text>
              </TouchableOpacity>
              <View style={styles.statDivider} />
              <TouchableOpacity
                style={styles.stat}
                onPress={() => userId && navigation.navigate('FollowList', { userId, kind: 'following' })}
              >
                <Text style={styles.statNum}>{fmt(following)}</Text>
                <Text style={styles.statLabel}>подписки</Text>
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'film' && styles.tabActive]}
                onPress={() => setActiveTab('film')}
              >
                <Text style={[styles.tabText, activeTab === 'film' && styles.tabTextActive]}>
                  Мои кадры
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'albums' && styles.tabActive]}
                onPress={() => setActiveTab('albums')}
              >
                <Text style={[styles.tabText, activeTab === 'albums' && styles.tabTextActive]}>
                  Мои альбомы
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'albums' && (
              <AlbumsGrid
                albums={albums}
                onCreatePress={() => navigation.navigate('CreateAlbum', { userId })}
                onAlbumPress={(album) => navigation.navigate('AlbumDetail', {
                  albumId: album.id, albumTitle: album.title, userId,
                })}
                onSavedPress={() => navigation.navigate('SavedScreen')}
              />
            )}

            {activeTab === 'film' && moments.length === 0 && (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>Начните создавать публикации...</Text>
              </View>
            )}
          </View>
        }
        renderItem={activeTab === 'film' ? ({ item: row }) => {
          if (row.type === 'full') {
            return (
              <TouchableOpacity style={styles.fullTile} onPress={() => handleTapMoment(row.item)}>
                <Image source={{ uri: row.item.photo_url }} style={styles.fullImg} resizeMode="cover" />
                <GridReactionBadge moment={row.item} profile={profile} reactionCounts={reactionMap[row.item.id] ?? {}} />
              </TouchableOpacity>
            )
          }
          return (
            <View style={styles.pairRow}>
              <TouchableOpacity style={styles.gridTile} onPress={() => handleTapMoment(row.left)}>
                <Image source={{ uri: row.left.photo_url }} style={styles.gridImg} resizeMode="cover" />
                <GridReactionBadge moment={row.left} profile={profile} reactionCounts={reactionMap[row.left.id] ?? {}} />
              </TouchableOpacity>
              {row.right ? (
                <TouchableOpacity style={styles.gridTile} onPress={() => handleTapMoment(row.right!)}>
                  <Image source={{ uri: row.right.photo_url }} style={styles.gridImg} resizeMode="cover" />
                  <GridReactionBadge moment={row.right} profile={profile} reactionCounts={reactionMap[row.right.id] ?? {}} />
                </TouchableOpacity>
              ) : (
                <View style={[styles.gridTile, { opacity: 0 }]} />
              )}
            </View>
          )
        } : undefined}
        ListFooterComponent={<View style={{ height: 32 }} />}
      />

      {/* Пикер выбора фото для слота */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setPickerVisible(false); setReplaceTarget(null) }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {replaceTarget !== null && ringPhotos[replaceTarget]
                  ? 'Заменить фото'
                  : 'Выбрать фото'}
              </Text>
              <TouchableOpacity onPress={() => { setPickerVisible(false); setReplaceTarget(null) }}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {moments.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>Нет фотографий</Text>
              </View>
            ) : (
              <FlatList
                data={moments}
                keyExtractor={(item) => item.id}
                numColumns={3}
                columnWrapperStyle={{ gap: 2 }}
                contentContainerStyle={{ gap: 2, paddingBottom: 40 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.pickerTile}
                    onPress={() => handlePickerSelect(item)}
                  >
                    <Image source={{ uri: item.photo_url }} style={styles.pickerImg} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  )
}

function GridReactionBadge({
  moment,
  profile,
  reactionCounts,
}: {
  moment: Moment
  profile: Profile | null
  reactionCounts: Partial<Record<ReactionType, number>>
}) {
  const withProfile = {
    ...moment,
    profiles: profile ?? {
      id: moment.user_id,
      username: null,
      display_name: null,
      bio: null,
      avatar_url: null,
      website: null,
      created_at: '',
    },
  } as MomentWithProfile
  const topReaction = getTopReaction(reactionCounts, withProfile)
  if (!topReaction) return null

  return (
    <View style={styles.gridReaction}>
      <Text style={styles.gridReactionEmoji}>{topReaction.emoji}</Text>
      <Text style={styles.gridReactionLabel} numberOfLines={1}>{topReaction.label}</Text>
      <Text style={styles.gridReactionCount}>{topReaction.count}</Text>
    </View>
  )
}

function AlbumsGrid({
  albums, onCreatePress, onAlbumPress, onSavedPress,
}: {
  albums: AlbumWithMoments[]
  onCreatePress: () => void
  onAlbumPress: (album: AlbumWithMoments) => void
  onSavedPress: () => void
}) {
  return (
    <View style={styles.albumsGrid}>
      {/* Специальный альбом Сохранённые — всегда первый, приватный */}
      <TouchableOpacity style={styles.albumCard} onPress={onSavedPress}>
        <View style={[styles.albumCover, styles.albumCoverSaved]}>
          <Text style={styles.albumSavedIcon}>⌂</Text>
        </View>
        <View style={styles.albumLockBadge}>
          <Text style={styles.albumLockIcon}>🔒</Text>
        </View>
        <View style={styles.albumMeta}>
          <Text style={styles.albumTitle} numberOfLines={1}>#Сохранённые</Text>
        </View>
      </TouchableOpacity>

      {albums.map(album => (
        <TouchableOpacity key={album.id} style={styles.albumCard} onPress={() => onAlbumPress(album)}>
          {album.first_moment_url ? (
            <Image source={{ uri: album.first_moment_url }} style={styles.albumCover} resizeMode="cover" />
          ) : (
            <View style={[styles.albumCover, styles.albumCoverEmpty]} />
          )}
          {!album.is_public && (
            <View style={styles.albumLockBadge}>
              <Text style={styles.albumLockIcon}>🔒</Text>
            </View>
          )}
          <View style={styles.albumMeta}>
            <Text style={styles.albumTitle} numberOfLines={1}>
              {album.title.startsWith('#') ? album.title : `#${album.title}`}
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={[styles.albumCard, styles.albumNew]} onPress={onCreatePress}>
        <View style={[styles.albumCover, styles.albumCoverEmpty]}>
          <Text style={styles.albumPlus}>+</Text>
        </View>
        <View style={styles.albumMeta}>
          <Text style={styles.albumNewText}>Новая плёнка</Text>
        </View>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },
  centered: { flex: 1, backgroundColor: C.BG, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10,
  },
  topLeft: { flex: 1 },
  menuBtn: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  menuIcon: { color: C.TEXT_SEC, fontSize: 26, fontWeight: '400' },

  hintBanner: {
    backgroundColor: 'rgba(201,146,42,0.10)',
    marginHorizontal: 16, marginTop: 10,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  hintText: { color: C.AMBER, fontSize: 12, textAlign: 'center', lineHeight: 18 },

  usernameBlock: {
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4,
    alignItems: 'center',
  },
  usernameText: { color: C.TEXT, fontSize: 17, fontWeight: '700', letterSpacing: 0.3, marginBottom: 4 },
  bio: { color: C.TEXT_SEC, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 2 },

  statsRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 24,
  },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { color: C.TEXT, fontSize: 20, fontWeight: '700' },
  statLabel: { color: C.TEXT_MUTED, fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: C.DIVIDER },

  tabs: {
    flexDirection: 'row', borderBottomWidth: 1,
    borderBottomColor: C.BORDER, marginBottom: 10,
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: C.AMBER },
  tabText: { color: C.TEXT_MUTED, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: C.BROWN },

  // Редакционная сетка
  pairRow: {
    flexDirection: 'row',
    paddingHorizontal: GRID_PAD,
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  gridTile: {
    flex: 1, height: GRID_TILE_H,
    borderRadius: 10, overflow: 'hidden',
    backgroundColor: C.BG_WARM,
  },
  gridImg: { width: '100%', height: '100%' },
  fullTile: {
    marginHorizontal: GRID_PAD,
    marginBottom: GRID_GAP,
    height: GRID_FULL_H,
    borderRadius: 10, overflow: 'hidden',
    backgroundColor: C.BG_WARM,
  },
  fullImg: { width: '100%', height: '100%' },
  gridReaction: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    maxWidth: '82%',
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
  gridReactionEmoji: { fontSize: 12 },
  gridReactionLabel: {
    color: C.WHITE,
    fontSize: 10,
    fontWeight: '700',
    maxWidth: 100,
  },
  gridReactionCount: {
    color: C.WHITE,
    fontSize: 10,
    fontWeight: '800',
  },

  emptyWrap: { paddingTop: 48, alignItems: 'center', paddingHorizontal: 32 },
  emptyText: { color: C.TEXT_MUTED, fontSize: 14, textAlign: 'center' },

  albumsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingTop: 8, gap: 12 },
  albumCard: {
    width: (W - 28) / 2, borderRadius: 12, overflow: 'hidden',
    backgroundColor: C.BG_WARM, borderWidth: 1, borderColor: C.BORDER,
  },
  albumCover: { width: '100%', aspectRatio: 4 / 3 },
  albumCoverEmpty: { backgroundColor: C.BG_WARM, justifyContent: 'center', alignItems: 'center' },
  albumCoverSaved: {
    backgroundColor: 'rgba(201,146,42,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  albumSavedIcon: { fontSize: 32, color: C.AMBER },
  albumLockBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12, width: 24, height: 24,
    justifyContent: 'center', alignItems: 'center',
  },
  albumLockIcon: { fontSize: 12 },
  albumMeta: { paddingHorizontal: 10, paddingVertical: 8 },
  albumTitle: { color: C.AMBER, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  albumNew: {},
  albumPlus: { color: C.TEXT_MUTED, fontSize: 28 },
  albumNewText: { color: C.TEXT_MUTED, fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.BG, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '80%', paddingTop: 8,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  modalTitle: { color: C.TEXT, fontSize: 16, fontWeight: '700' },
  modalClose: { color: C.TEXT_MUTED, fontSize: 20, paddingLeft: 16 },
  pickerTile: { width: (W - 4) / 3, height: (W - 4) / 3 },
  pickerImg: { width: '100%', height: '100%' },
})
