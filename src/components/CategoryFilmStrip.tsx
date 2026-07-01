/**
 * CategoryFilmStrip — бесконечная зацикленная горизонтальная плёнка категорий.
 * Тот же принцип что у FilmStripProfileHeader:
 *   категории повторяются 101 раз в виртуальном списке, старт с середины.
 */

import { useRef, useEffect } from 'react'
import {
  View, Text, Image, TouchableOpacity,
  StyleSheet, Dimensions, Animated,
} from 'react-native'

const W = Dimensions.get('window').width

// Film-токены
const TRACK_BG  = '#0E0804'
const AMBER_MID = '#A05C18'
const AMBER_D   = '#6B2E0C'
const HOLE_BG   = '#3A1406'
const FRAME_BDR = '#6B3A12'
const EDGE_H    = 12
const FRAME_W   = 80
const FRAME_H   = 64
const FRAME_R   = 6
const GAP       = 8
const SIDE_PAD  = 14
const SNAP      = FRAME_W + GAP   // 88px — шаг снаппинга

const REPEAT    = 101

export interface CategoryItem {
  id:        string
  label:     string
  photoUrl?: string | null
}

interface Props {
  categories: CategoryItem[]
  activeId:   string
  onSelect:   (id: string) => void
}

export default function CategoryFilmStrip({ categories, activeId, onSelect }: Props) {
  const count = categories.length
  if (count === 0) return null

  const TOTAL     = count * REPEAT
  const START_IDX = Math.floor(REPEAT / 2) * count   // середина списка

  const virtualData = Array.from({ length: TOTAL }, (_, i) => ({
    ...categories[i % count],
    _virtualIndex: i,
  }))

  const listRef = useRef<any>(null)
  const mounted = useRef(false)

  // Первый рендер — прокручиваем к активной категории в середине
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    const activeIdx = categories.findIndex(c => c.id === activeId)
    const target = START_IDX + (activeIdx >= 0 ? activeIdx : 0)
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: target, animated: false, viewPosition: 0.5 })
    }, 50)
  }, [])

  // Смена activeId снаружи (тап на категорию из другого места)
  useEffect(() => {
    if (!mounted.current) return
    const activeIdx = categories.findIndex(c => c.id === activeId)
    if (activeIdx < 0) return
    const target = START_IDX + activeIdx
    listRef.current?.scrollToIndex({ index: target, animated: true, viewPosition: 0.5 })
  }, [activeId])

  return (
    <View style={styles.strip}>
      <SprocketEdge />

      <View style={styles.track}>
        <Animated.FlatList
          ref={listRef}
          data={virtualData}
          keyExtractor={item => String(item._virtualIndex)}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={SNAP}
          decelerationRate="fast"
          contentContainerStyle={styles.listContent}
          onScrollToIndexFailed={() => {}}
          scrollEventThrottle={16}
          renderItem={({ item }) => {
            const active = item.id === activeId
            return (
              <TouchableOpacity
                style={styles.frameWrap}
                onPress={() => onSelect(item.id)}
                activeOpacity={0.8}
              >
                <View style={[styles.frame, active && styles.frameActive]}>
                  {item.photoUrl ? (
                    <Image
                      source={{ uri: item.photoUrl }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.frameEmpty]} />
                  )}
                  {!active && <View style={[StyleSheet.absoluteFill, styles.frameDim]} />}
                </View>

                <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )
          }}
        />
      </View>
    </View>
  )
}

function SprocketEdge() {
  const holeCount = Math.ceil(W / 16)
  return (
    <View style={styles.edge}>
      {Array.from({ length: holeCount }).map((_, i) => (
        <View key={i} style={styles.hole} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  strip: {
    backgroundColor: TRACK_BG,
    borderBottomWidth: 1,
    borderBottomColor: AMBER_D,
  },

  edge: {
    height: EDGE_H,
    backgroundColor: AMBER_MID,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 4,
    overflow: 'hidden',
  },
  hole: {
    width: 10, height: 10,
    borderRadius: 2,
    backgroundColor: HOLE_BG,
    flexShrink: 0,
  },

  track: { paddingVertical: 8 },
  listContent: { paddingHorizontal: SIDE_PAD },

  frameWrap: {
    alignItems: 'center',
    marginRight: GAP,
  },

  frame: {
    width: FRAME_W,
    height: FRAME_H,
    borderRadius: FRAME_R,
    borderWidth: 1,
    borderColor: FRAME_BDR,
    overflow: 'hidden',
    backgroundColor: TRACK_BG,
  },
  frameActive: {
    borderColor: '#D4891A',
    borderWidth: 2,
  },
  frameEmpty: {
    backgroundColor: 'rgba(107,46,12,0.35)',
  },
  frameDim: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  label: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    maxWidth: FRAME_W,
    textAlign: 'center',
    marginTop: 4,
  },
  labelActive: {
    color: '#D4891A',
    fontWeight: '700',
  },
})
