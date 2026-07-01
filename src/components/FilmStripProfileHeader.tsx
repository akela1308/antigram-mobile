/**
 * FilmStripProfileHeader v4 — кольцевая карусель из 5 фото.
 *
 * Принцип «кольца»:
 *   5 фото повторяются 201 раз в виртуальном списке (1005 элементов).
 *   Старт — элемент 500 (середина). Пользователь свайпает влево/вправо
 *   бесконечно — физически те же 5 фото циклично повторяются.
 *
 * Центральный кадр — самый большой, он же аватар профиля.
 *   При смене центра → onCenterChange(index 0–4).
 *
 * Пустые слоты (null): показывают кремовую заглушку.
 *   Тап на пустой слот (isOwner) → onReplaceRequest(slotIndex).
 *
 * Анимация: scrollX.interpolate scale + opacity (нативный драйвер, 60fps).
 */

import { useRef, useEffect, useCallback } from 'react'
import {
  View, Image, StyleSheet, Dimensions,
  TouchableOpacity, Animated, Alert,
} from 'react-native'
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native'

const W = Dimensions.get('window').width

// ─── Дизайн-токены ────────────────────────────────────────────────────────────
const AMBER_L   = '#D4891A'
const AMBER_MID = '#A05C18'
const AMBER_D   = '#6B2E0C'
const TRACK_BG  = '#0E0804'
const HOLE_BG   = '#3A1406'
const FRAME_BDR = '#6B3A12'

// ─── Размеры ─────────────────────────────────────────────────────────────────
const EDGE_H   = 15
const TRACK_H  = 96
const FRAME_W  = 72    // базовый размер в layout
const FRAME_H  = 72
const FRAME_R  = 8
const GAP      = 10                       // отступ между кадрами
const SNAP     = FRAME_W + GAP            // 82px — шаг снаппинга
const SIDE_PAD = (W - FRAME_W) / 2       // центрирование первого элемента

// Масштаб — диапазон сужен чтобы интервалы выглядели равномернее
const S_FAR  = 0.90    // 2+ позиции от центра (было 0.80 — слишком маленькие)
const S_ADJ  = 0.96    // 1 позиция от центра
const S_CTR  = 1.12    // центр

// Кольцо: повторяем 5 фото 201 раз, стартуем с середины
const RING_SIZE    = 5
const REPEAT       = 201
const TOTAL        = RING_SIZE * REPEAT   // 1005 элементов
const START_IDX    = Math.floor(REPEAT / 2) * RING_SIZE  // 500

interface Props {
  /** Ровно 5 слотов. null = пустой (ещё не выбран). */
  photos: (string | null)[]
  isOwner?: boolean
  /** Центральное фото изменилось (индекс 0–4) */
  onCenterChange?: (index: number) => void
  /** Открыть фото в MomentDetail */
  onOpenPhoto?: (index: number) => void
  /** Запрос на замену слота (index 0–4) */
  onReplaceRequest?: (index: number) => void
}

export default function FilmStripProfileHeader({
  photos,
  isOwner = false,
  onCenterChange,
  onOpenPhoto,
  onReplaceRequest,
}: Props) {
  const scrollX   = useRef(new Animated.Value(START_IDX * SNAP)).current
  const listRef   = useRef<any>(null)
  const lastCenter = useRef(0)  // последний реальный индекс 0–4

  // Нормализуем photos до ровно 5 слотов
  const ring: (string | null)[] = Array.from({ length: RING_SIZE }, (_, i) => photos[i] ?? null)

  // Виртуальный список: повторяем ring 201 раз
  const virtualData = Array.from({ length: TOTAL }, (_, i) => ring[i % RING_SIZE])

  // Прокрутить к START_IDX при монтировании (без анимации)
  useEffect(() => {
    const timer = setTimeout(() => {
      listRef.current?.scrollToOffset({
        offset: START_IDX * SNAP,
        animated: false,
      })
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  // Сброс при смене фото убран намеренно:
  // useFocusEffect в родителе перезагружает highlights при возврате с экрана,
  // что вызывало нежелательный сдвиг карусели. Позиция сохраняется.

  // Вычислить реальный индекс (0–4) из виртуального
  function realIndex(virtualIdx: number) {
    return virtualIdx % RING_SIZE
  }

  // Вызывается когда скролл остановился (моментум или drag)
  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x    = e.nativeEvent.contentOffset.x
    const vIdx = Math.round(x / SNAP)
    const rIdx = realIndex(vIdx)
    if (rIdx !== lastCenter.current) {
      lastCenter.current = rIdx
      onCenterChange?.(rIdx)
    }
  }, [onCenterChange])

  // Тап на кадр
  function handleTap(virtualIdx: number) {
    const rIdx = realIndex(virtualIdx)
    const url  = ring[rIdx]

    if (!url) {
      // Пустой слот — сразу предлагаем выбрать фото
      if (isOwner) onReplaceRequest?.(rIdx)
      return
    }

    if (isOwner) {
      Alert.alert('', '', [
        { text: 'Открыть фото',  onPress: () => onOpenPhoto?.(rIdx)    },
        { text: 'Заменить',      onPress: () => onReplaceRequest?.(rIdx) },
        { text: 'Отмена', style: 'cancel' },
      ])
    } else {
      onOpenPhoto?.(rIdx)
    }
  }

  return (
    <View style={styles.strip}>
      <SprocketEdge />

      <View style={styles.track}>
        <Animated.FlatList
          ref={listRef}
          data={virtualData}
          keyExtractor={(_, i) => String(i)}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={SNAP}
          snapToAlignment="start"
          decelerationRate="fast"
          contentContainerStyle={styles.listContent}
          getItemLayout={(_, index) => ({
            length: SNAP,
            offset: SIDE_PAD + index * SNAP,
            index,
          })}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          windowSize={5}
          maxToRenderPerBatch={12}
          initialNumToRender={9}
          removeClippedSubviews
          renderItem={({ item, index }) => {
            const inputRange = [
              (index - 2) * SNAP,
              (index - 1) * SNAP,
              index * SNAP,
              (index + 1) * SNAP,
              (index + 2) * SNAP,
            ]
            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [S_FAR, S_ADJ, S_CTR, S_ADJ, S_FAR],
              extrapolate: 'clamp',
            })
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.40, 0.65, 1, 0.65, 0.40],
              extrapolate: 'clamp',
            })

            return (
              <TouchableOpacity
                onPress={() => handleTap(index)}
                activeOpacity={0.85}
                style={{ marginRight: GAP }}
              >
                <Animated.View style={[styles.frame, { transform: [{ scale }], opacity }]}>
                  {item ? (
                    <Image
                      source={{ uri: item }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.frameEmpty]}>
                      {isOwner && <Animated.Text style={[styles.framePlus, { opacity }]}>+</Animated.Text>}
                    </View>
                  )}
                </Animated.View>
              </TouchableOpacity>
            )
          }}
        />

        {/* Затемнение краёв — усиливает ощущение глубины */}
        <View pointerEvents="none" style={styles.gradLeft} />
        <View pointerEvents="none" style={styles.gradRight} />
      </View>

      <SprocketEdge />
    </View>
  )
}

function SprocketEdge() {
  return (
    <View style={styles.edge}>
      <View pointerEvents="none" style={styles.edgeGradLeft} />
      {Array.from({ length: 38 }).map((_, i) => (
        <View key={i} style={styles.hole} />
      ))}
      <View pointerEvents="none" style={styles.edgeGradRight} />
    </View>
  )
}

const styles = StyleSheet.create({
  strip: {
    width: W,
    backgroundColor: TRACK_BG,
    overflow: 'hidden',
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
    width: 12, height: 12,
    borderRadius: 2,
    backgroundColor: HOLE_BG,
    flexShrink: 0,
  },
  edgeGradLeft: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 60, backgroundColor: AMBER_L, opacity: 0.55, zIndex: 1,
  },
  edgeGradRight: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: 80, backgroundColor: AMBER_D, opacity: 0.55, zIndex: 1,
  },

  track: {
    height: TRACK_H,
    backgroundColor: TRACK_BG,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  listContent: {
    paddingHorizontal: SIDE_PAD,
    alignItems: 'center',
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
  frameEmpty: {
    backgroundColor: 'rgba(107,46,12,0.28)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  framePlus: {
    color: AMBER_MID,
    fontSize: 22,
    fontWeight: '300',
  },

  gradLeft: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 30, backgroundColor: TRACK_BG, opacity: 0.6,
  },
  gradRight: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: 30, backgroundColor: TRACK_BG, opacity: 0.6,
  },
})
