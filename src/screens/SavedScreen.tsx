/**
 * SavedScreen — закладки пользователя.
 * Открывается из ProfileScreen.
 * Сетка фото как в профиле (редакционный грид: 2×2 → full → повтор).
 * Тап на фото → ShotsScrollFeed, но из сохранённых нет "все кадры одного юзера",
 * поэтому открываем MomentDetail напрямую.
 */

import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, Image,
  TouchableOpacity, Dimensions, ActivityIndicator,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import { getSavedMoments, getFeedReactions } from '../../lib/db'
import type { MomentWithProfile, ReactionType } from '../../lib/database.types'
import { C } from '../theme'
import { getTopReaction } from '../lib/reactions'

const W = Dimensions.get('window').width
const GRID_PAD    = 8
const GRID_GAP    = 8
const GRID_TILE_W = (W - GRID_PAD * 2 - GRID_GAP) / 2
const GRID_TILE_H = GRID_TILE_W
const GRID_FULL_W = W - GRID_PAD * 2
const GRID_FULL_H = GRID_FULL_W

type GridRow =
  | { key: string; type: 'pair'; left: MomentWithProfile; right: MomentWithProfile | null }
  | { key: string; type: 'full'; item: MomentWithProfile }

function buildGridRows(moments: MomentWithProfile[]): GridRow[] {
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

export default function SavedScreen() {
  const navigation = useNavigation<any>()
  const [moments, setMoments]         = useState<MomentWithProfile[]>([])
  const [reactionMap, setReactionMap] = useState<Record<string, Partial<Record<ReactionType, number>>>>({})
  const [loading, setLoading]         = useState(true)
  const [userId, setUserId]           = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => { load() }, [])
  )

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const saved = await getSavedMoments(user.id)
    setMoments(saved)

    if (saved.length > 0) {
      const ids = saved.map(m => m.id)
      const raw = await getFeedReactions(ids)
      const map: Record<string, Partial<Record<ReactionType, number>>> = {}
      for (const r of raw) {
        if (!map[r.moment_id]) map[r.moment_id] = {}
        map[r.moment_id][r.type] = (map[r.moment_id][r.type] ?? 0) + 1
      }
      setReactionMap(map)
    }

    setLoading(false)
  }

  function handleTapMoment(moment: MomentWithProfile) {
    navigation.navigate('MomentDetail', {
      moment,
      isOwner: moment.user_id === userId,
    })
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.AMBER} />
      </View>
    )
  }

  const rows = buildGridRows(moments)

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
        <Text style={styles.title}>Сохранённые</Text>
        <View style={{ width: 36 }} />
      </View>

      {moments.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>⌂</Text>
          <Text style={styles.emptyTitle}>Пока ничего нет</Text>
          <Text style={styles.emptyHint}>
            Нажми ⌂ под любым фото — оно появится здесь
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={row => row.key}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: row }) => {
            if (row.type === 'full') {
              return (
                <TouchableOpacity
                  style={styles.fullTile}
                  onPress={() => handleTapMoment(row.item)}
                >
                  <Image
                    source={{ uri: row.item.photo_url }}
                    style={styles.fullImg}
                    resizeMode="cover"
                  />
                  <AvatarOverlay moment={row.item} />
                  <ReactionOverlay moment={row.item} reactionCounts={reactionMap[row.item.id] ?? {}} />
                </TouchableOpacity>
              )
            }
            return (
              <View style={styles.pairRow}>
                <TouchableOpacity
                  style={styles.gridTile}
                  onPress={() => handleTapMoment(row.left)}
                >
                  <Image
                    source={{ uri: row.left.photo_url }}
                    style={styles.gridImg}
                    resizeMode="cover"
                  />
                  <AvatarOverlay moment={row.left} />
                  <ReactionOverlay moment={row.left} reactionCounts={reactionMap[row.left.id] ?? {}} />
                </TouchableOpacity>
                {row.right ? (
                  <TouchableOpacity
                    style={styles.gridTile}
                    onPress={() => handleTapMoment(row.right!)}
                  >
                    <Image
                      source={{ uri: row.right.photo_url }}
                      style={styles.gridImg}
                      resizeMode="cover"
                    />
                    <AvatarOverlay moment={row.right} />
                    <ReactionOverlay moment={row.right} reactionCounts={reactionMap[row.right.id] ?? {}} />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.gridTile, { opacity: 0 }]} />
                )}
              </View>
            )
          }}
          ListFooterComponent={<View style={{ height: 32 }} />}
        />
      )}
    </View>
  )
}

function ReactionOverlay({
  moment,
  reactionCounts,
}: {
  moment: MomentWithProfile
  reactionCounts: Partial<Record<ReactionType, number>>
}) {
  const topReaction = getTopReaction(reactionCounts, moment)
  if (!topReaction) return null

  return (
    <View style={reactionOverlay.wrap}>
      <Text style={reactionOverlay.emoji}>{topReaction.emoji}</Text>
      <Text style={reactionOverlay.label} numberOfLines={1}>{topReaction.label}</Text>
      <Text style={reactionOverlay.count}>{topReaction.count}</Text>
    </View>
  )
}

// Маленький аватар автора поверх плитки (левый верхний угол)
function AvatarOverlay({ moment }: { moment: MomentWithProfile }) {
  const profile = moment.profiles
  const letter = (profile?.display_name || profile?.username || '?')[0].toUpperCase()
  return (
    <View style={overlay.wrap}>
      {profile?.avatar_url ? (
        <Image source={{ uri: profile.avatar_url }} style={overlay.img} />
      ) : (
        <View style={overlay.fallback}>
          <Text style={overlay.letter}>{letter}</Text>
        </View>
      )}
    </View>
  )
}

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
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  backIcon: { color: C.TEXT, fontSize: 22 },
  title: {
    flex: 1, textAlign: 'center',
    color: C.TEXT, fontSize: 17, fontWeight: '700',
  },

  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 48, color: C.AMBER },
  emptyTitle: { color: C.TEXT, fontSize: 17, fontWeight: '600' },
  emptyHint: { color: C.TEXT_MUTED, fontSize: 14, textAlign: 'center', lineHeight: 20 },

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
})

const overlay = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 6, left: 6,
  },
  img: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1.5, borderColor: C.WHITE,
  },
  fallback: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.BG_WARM,
    borderWidth: 1.5, borderColor: C.WHITE,
    justifyContent: 'center', alignItems: 'center',
  },
  letter: { color: C.BROWN, fontSize: 11, fontWeight: '700' },
})

const reactionOverlay = StyleSheet.create({
  wrap: {
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
  emoji: { fontSize: 12 },
  label: {
    color: C.WHITE,
    fontSize: 10,
    fontWeight: '700',
    maxWidth: 100,
  },
  count: {
    color: C.WHITE,
    fontSize: 10,
    fontWeight: '800',
  },
})
