import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, Image, Alert,
  TouchableOpacity, Dimensions, ActivityIndicator,
} from 'react-native'
import { useFocusEffect, useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import { useAppContext } from '../context/AppContext'
import {
  getProfile, getUserMoments, getUserAlbums,
  followUser, unfollowUser, isFollowing, getHighlights,
  adminBanUser, adminUnbanUser, adminBlockUser, adminUnblockUser,
  reportUser, getProfileWithModerationStatus, getFeedReactions,
  getFollowersCount, getFollowingCount,
} from '../../lib/db'
import type { Profile, Moment, MomentWithProfile, AlbumWithMoments, HighlightWithMoment, ReactionType } from '../../lib/database.types'
import { C } from '../theme'
import FilmStripProfileHeader from '../components/FilmStripProfileHeader'
import { getTopReaction } from '../lib/reactions'
import ActionSheet from '../components/ActionSheet'

const W = Dimensions.get('window').width
const GRID_PAD  = 8
const GRID_GAP  = 8
const GRID_TILE_W = (W - GRID_PAD * 2 - GRID_GAP) / 2
const GRID_TILE_H = GRID_TILE_W                      // квадратные плитки
const GRID_FULL_W = W - GRID_PAD * 2  // ширина полного кадра
const GRID_FULL_H = GRID_FULL_W       // квадрат — как 4 маленькие плитки 2×2
const MAX_SLOTS = 5

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

type Params = { OtherProfile: { userId: string } }

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K'
  return String(n)
}

export default function OtherProfileScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<RouteProp<Params, 'OtherProfile'>>()
  const { userId } = route.params

  const [profile, setProfile] = useState<Profile | null>(null)
  const [moments, setMoments] = useState<Moment[]>([])
  const [reactionMap, setReactionMap] = useState<Record<string, Partial<Record<ReactionType, number>>>>({})
  const [albums, setAlbums] = useState<AlbumWithMoments[]>([])
  const [highlights, setHighlights] = useState<HighlightWithMoment[]>([])
  const [loading, setLoading] = useState(true)
  const [followed, setFollowed] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'shots' | 'albums'>('shots')
  const [isBanned, setIsBanned] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reportSheetVisible, setReportSheetVisible] = useState(false)
  const { isAdmin } = useAppContext()

  // Флаг чтобы FilmStrip не сбрасывался при refocus
  const stripMounted = useRef(false)

  useFocusEffect(
    useCallback(() => { load() }, [userId])
  )

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr) console.warn('[OtherProfile] getUser error:', authErr.message)

      const [prof, moms, albs, hl, frsCount, fingCount] = await Promise.all([
        getProfileWithModerationStatus(userId),
        getUserMoments(userId),
        getUserAlbums(userId),
        getHighlights(userId),
        getFollowersCount(userId),
        getFollowingCount(userId),
      ])

      if (!prof) {
        console.warn('[OtherProfile] profile not found for userId:', userId)
        setLoadError('Профиль не найден. Возможно, пользователь удалил аккаунт или у тебя нет доступа.')
        setLoading(false)
        return
      }

      setProfile(prof)
      setIsBanned((prof as any).is_banned ?? false)
      setIsBlocked((prof as any).is_blocked ?? false)
      setFollowersCount(frsCount)
      setFollowingCount(fingCount)

      const publicMoments = moms.filter(m => m.is_public)
      console.log(`[OtherProfile] userId=${userId}: ${publicMoments.length} public moments, ${albs.length} albums, ${hl.length} highlights`)
      setMoments(publicMoments)
      await loadReactions(publicMoments)
      setAlbums(albs.filter(a => a.is_public))
      setHighlights(hl)

      if (user) {
        const f = await isFollowing(user.id, userId)
        setFollowed(f)
      }
    } catch (e) {
      console.error('[OtherProfile] load error:', e)
      setLoadError('Не удалось загрузить профиль. Проверь подключение.')
    } finally {
      setLoading(false)
      stripMounted.current = true
    }
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

  async function handleFollowToggle() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setFollowLoading(true)
    if (followed) {
      await unfollowUser(user.id, userId)
      setFollowed(false)
    } else {
      await followUser(user.id, userId)
      setFollowed(true)
    }
    setFollowLoading(false)
  }

  async function handleReportUser() {
    // Alert.alert с 4 кнопками на Android молча обрезает "Отмена" → используем ActionSheet
    setReportSheetVisible(true)
  }

  async function handleAdminToggleBan() {
    if (isBanned) {
      await adminUnbanUser(userId)
      setIsBanned(false)
      Alert.alert('Бан снят', `@${profile?.username} разбанен.`)
    } else {
      Alert.alert('Теневой бан?', `Контент @${profile?.username} будет скрыт от всех.`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Забанить', style: 'destructive', onPress: async () => {
          await adminBanUser(userId)
          setIsBanned(true)
        }},
      ])
    }
  }

  async function handleAdminToggleBlock() {
    if (isBlocked) {
      await adminUnblockUser(userId)
      setIsBlocked(false)
      Alert.alert('Блок снят', `@${profile?.username} разблокирован.`)
    } else {
      Alert.alert('Заблокировать?', `@${profile?.username} не сможет войти в приложение.`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Заблокировать', style: 'destructive', onPress: async () => {
          await adminBlockUser(userId)
          setIsBlocked(true)
        }},
      ])
    }
  }

  function handleTapMoment(moment: Moment) {
    navigation.navigate('ShotsScrollFeed', {
      userId,
      title: profile?.display_name || profile?.username || 'Кадры',
      startMomentId: moment.id,
      isOwner: false,
    })
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.AMBER} />
      </View>
    )
  }

  if (loadError) {
    return (
      <View style={styles.centered}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnAbs}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.errorEmoji}>🙁</Text>
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity onPress={load} style={styles.retryBtn}>
          <Text style={styles.retryText}>Попробовать снова</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const displayName = profile?.display_name || profile?.username || 'antigram'
  const avatarLetter = displayName[0].toUpperCase()

  // 5 слотов для кольцевой карусели (только для просмотра, isOwner=false)
  const ringPhotos: (string | null)[] = Array.from({ length: MAX_SLOTS }, (_, i) => {
    const hl = highlights.find(h => h.position === i)
    return hl?.moments?.photo_url ?? null
  })

  return (
    <>
    <FlatList
      style={styles.root}
      data={activeTab === 'shots' ? buildGridRows(moments) : []}
      keyExtractor={(row) => row.key}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          {/* Top bar: ← | @username | пусто */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.topUsername} numberOfLines={1}>
              {profile?.username ? `@${profile.username}` : displayName}
            </Text>
            <View style={styles.topRight} />
          </View>

          {/* Кольцевая карусель 5 кадров (только просмотр) */}
          <FilmStripProfileHeader
            photos={ringPhotos}
            isOwner={false}
            onOpenPhoto={(slotIndex) => {
              const hl = highlights.find(h => h.position === slotIndex)
              if (hl?.moments) {
                navigation.navigate('ShotsScrollFeed', {
                  userId,
                  title: displayName,
                  startMomentId: hl.moments.id,
                  isOwner: false,
                })
              }
            }}
          />

          {/* Имя и bio */}
          <View style={styles.usernameBlock}>
            <Text style={styles.usernameText}>{displayName}</Text>
            {profile?.bio ? (
              <Text style={styles.bio} numberOfLines={3}>{profile.bio}</Text>
            ) : null}
          </View>

          {/* Stats: кадры | подписчики | подписки */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{fmt(moments.length)}</Text>
              <Text style={styles.statLabel}>кадры</Text>
            </View>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.stat}
              onPress={() => navigation.navigate('FollowList', { userId, kind: 'followers' })}
            >
              <Text style={styles.statNum}>{fmt(followersCount)}</Text>
              <Text style={styles.statLabel}>подписчики</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.stat}
              onPress={() => navigation.navigate('FollowList', { userId, kind: 'following' })}
            >
              <Text style={styles.statNum}>{fmt(followingCount)}</Text>
              <Text style={styles.statLabel}>подписки</Text>
            </TouchableOpacity>
          </View>

          {/* Follow / Unfollow + Report */}
          <View style={styles.followRow}>
            <TouchableOpacity
              style={[styles.followBtn, followed && styles.unfollowBtn]}
              onPress={handleFollowToggle}
              disabled={followLoading}
            >
              {followLoading
                ? <ActivityIndicator color={followed ? C.TEXT_MUTED : C.WHITE} size="small" />
                : <Text style={[styles.followBtnText, followed && styles.unfollowBtnText]}>
                    {followed ? 'Отписаться' : 'Подписаться'}
                  </Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportBtn} onPress={handleReportUser}>
              <Text style={styles.reportBtnText}>⚑</Text>
            </TouchableOpacity>
          </View>

          {/* Admin controls */}
          {isAdmin && (
            <View style={styles.adminRow}>
              <TouchableOpacity
                style={[styles.adminBtn, isBanned && styles.adminBtnActive]}
                onPress={handleAdminToggleBan}
              >
                <Text style={styles.adminBtnText}>
                  {isBanned ? '✓ Забанен' : '🚫 Бан'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.adminBtn, isBlocked && styles.adminBtnActive]}
                onPress={handleAdminToggleBlock}
              >
                <Text style={styles.adminBtnText}>
                  {isBlocked ? '✓ Заблокирован' : '⛔ Блок'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Вкладки: Кадры | Альбомы */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'shots' && styles.tabActive]}
              onPress={() => setActiveTab('shots')}
            >
              <Text style={[styles.tabText, activeTab === 'shots' && styles.tabTextActive]}>
                Кадры
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'albums' && styles.tabActive]}
              onPress={() => setActiveTab('albums')}
            >
              <Text style={[styles.tabText, activeTab === 'albums' && styles.tabTextActive]}>
                Альбомы
              </Text>
            </TouchableOpacity>
          </View>

          {/* Альбомы — только публичные, #hashtag формат */}
          {activeTab === 'albums' && (
            <View style={styles.albumsGrid}>
              {albums.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>Нет альбомов</Text>
                </View>
              ) : (
                albums.map(album => (
                  <TouchableOpacity
                    key={album.id}
                    style={styles.albumCard}
                    onPress={() => navigation.navigate('AlbumDetail', {
                      albumId: album.id,
                      albumTitle: album.title,
                      userId,
                    })}
                  >
                    {album.first_moment_url ? (
                      <Image
                        source={{ uri: album.first_moment_url }}
                        style={styles.albumCover}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.albumCover, styles.albumCoverEmpty]} />
                    )}
                    <View style={styles.albumMeta}>
                      <Text style={styles.albumTitle} numberOfLines={1}>
                        {album.title.startsWith('#') ? album.title : `#${album.title}`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {activeTab === 'shots' && moments.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>📷</Text>
              <Text style={styles.emptyText}>Ещё нет кадров</Text>
            </View>
          )}
        </View>
      }
      renderItem={activeTab === 'shots' ? ({ item: row }) => {
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

    <ActionSheet
      visible={reportSheetVisible}
      title="Пожаловаться на пользователя"
      onClose={() => setReportSheetVisible(false)}
      actions={[
        {
          label: 'Спам',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) reportUser(user.id, userId, 'spam')
          },
        },
        {
          label: 'Оскорбительное поведение',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) reportUser(user.id, userId, 'abusive')
          },
        },
        {
          label: 'Другое',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) reportUser(user.id, userId, 'other')
          },
        },
      ]}
    />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },
  centered: { flex: 1, backgroundColor: C.BG, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10,
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center' },
  backText: { color: C.TEXT, fontSize: 24 },
  topUsername: {
    flex: 1, textAlign: 'center',
    color: C.TEXT, fontSize: 15, fontWeight: '600', letterSpacing: 0.2,
  },
  topRight: { width: 44 },

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

  followRow: { paddingHorizontal: 16, paddingBottom: 16, alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'center' },
  followBtn: {
    backgroundColor: C.BROWN, borderRadius: 20,
    paddingHorizontal: 40, paddingVertical: 10,
    minWidth: 140, alignItems: 'center',
  },
  followBtnText: { color: C.WHITE, fontWeight: '700', fontSize: 14, letterSpacing: 0.5 },
  unfollowBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.BORDER },
  unfollowBtnText: { color: C.TEXT_MUTED },
  reportBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, borderColor: C.BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  reportBtnText: { color: C.TEXT_MUTED, fontSize: 16 },
  adminRow: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16,
    paddingBottom: 12, justifyContent: 'center',
  },
  adminBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 16, borderWidth: 1, borderColor: '#c0392b',
  },
  adminBtnActive: { backgroundColor: '#c0392b' },
  adminBtnText: { color: '#c0392b', fontWeight: '600', fontSize: 13 },

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

  albumsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 8, paddingTop: 8, gap: 12,
  },
  albumCard: {
    width: (W - 28) / 2, borderRadius: 12, overflow: 'hidden',
    backgroundColor: C.BG_WARM, borderWidth: 1, borderColor: C.BORDER,
  },
  albumCover: { width: '100%', aspectRatio: 4 / 3 },
  albumCoverEmpty: { backgroundColor: C.BG_WARM },
  albumMeta: { paddingHorizontal: 10, paddingVertical: 8 },
  albumTitle: { color: C.AMBER, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },

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

  emptyWrap: { flex: 1, alignItems: 'center', marginTop: 40, gap: 8, paddingHorizontal: 16 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: C.TEXT_MUTED, fontSize: 15 },

  backBtnAbs: { position: 'absolute', top: 56, left: 16, padding: 8 },
  errorEmoji: { fontSize: 40, marginBottom: 8 },
  errorText: { color: C.TEXT_MUTED, fontSize: 14, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1, borderColor: C.BORDER,
  },
  retryText: { color: C.BROWN_MID, fontWeight: '600', fontSize: 14 },
})
