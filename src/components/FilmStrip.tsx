/**
 * FilmStrip — компонент плёночной ленты.
 *
 * Два режима:
 *   decorative — только визуальная полоска без фото (шапка превью камеры)
 *   content    — скроллируемые кадры с фото (хайлайты в профиле)
 *
 * Визуал основан на референсе Film_component.png:
 *   - Янтарно-коричневые края с перфорацией
 *   - Тёмный центральный трек
 *   - Кадры с закруглёнными углами
 *   - Градиент симулируется через полупрозрачный оверлей
 */

import { View, Image, TouchableOpacity, ScrollView, StyleSheet, Text } from 'react-native'

// ─── Дизайн-токены ────────────────────────────────────────────────────────────
const AMBER_L   = '#D4891A'  // янтарь, светлый (левый край)
const AMBER_MID = '#A05C18'  // янтарь, средний
const AMBER_D   = '#6B2E0C'  // тёмно-коричневый (правый край)
const TRACK_BG  = '#0E0804'  // центральный трек (почти чёрный)
const HOLE_BG   = '#3A1406'  // цвет дырок-перфораций
const FRAME_BDR = '#6B3A12'  // рамка кадра
const FRAME_EMPTY_BG = '#EEE8DE' // пустой кадр — кремовый

const EDGE_H   = 15   // высота янтарной полосы (верх/низ)
const TRACK_H  = 58   // высота центрального трека
const HOLE_W   = 12   // ширина дырки
const HOLE_H   = 12   // высота дырки
const HOLE_R   = 2    // скругление дырки
const FRAME_W  = 72   // ширина кадра
const FRAME_H  = 50   // высота кадра
const FRAME_R  = 9    // скругление углов кадра

export type FilmFrame = {
  key: string
  uri?: string | null
  onPress?: () => void
  showPlus?: boolean
  /** Первый кадр — аватар пользователя, отображается с янтарной рамкой */
  isAvatar?: boolean
  /** Инициал для placeholder аватара */
  avatarLetter?: string
}

interface Props {
  /** Только визуал, без контента */
  decorative?: boolean
  frames?: FilmFrame[]
  style?: object
}

export default function FilmStrip({ decorative = false, frames = [], style }: Props) {
  return (
    <View style={[styles.strip, style]}>
      {/* Верхняя полоска с дырками */}
      <SprocketEdge />

      {/* Тёмный центральный трек с кадрами */}
      <View style={styles.track}>
        {!decorative && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.framesRow}
          >
            {frames.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.frame, f.isAvatar && styles.frameAvatar]}
                onPress={f.onPress}
                disabled={!f.onPress}
                activeOpacity={f.onPress ? 0.75 : 1}
              >
                {f.uri ? (
                  <Image
                    source={{ uri: f.uri }}
                    style={styles.frameImg}
                    resizeMode="cover"
                  />
                ) : f.isAvatar ? (
                  <View style={styles.frameAvatarPh}>
                    <Text style={styles.frameAvatarLetter}>{f.avatarLetter ?? '?'}</Text>
                  </View>
                ) : f.showPlus ? (
                  <View style={[styles.frameEmpty, styles.framePlusWrap]}>
                    <Text style={styles.framePlusText}>+</Text>
                  </View>
                ) : (
                  <View style={styles.frameEmpty} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Полупрозрачный левый оверлей — имитируем начало градиента */}
        <View pointerEvents="none" style={styles.gradLeft} />
        {/* Правый оверлей — конец градиента */}
        <View pointerEvents="none" style={styles.gradRight} />
      </View>

      {/* Нижняя полоска с дырками */}
      <SprocketEdge />
    </View>
  )
}

/** Янтарная полоса с перфорацией */
function SprocketEdge() {
  return (
    <View style={styles.edge}>
      {/* Светлый оверлей слева — начало градиента */}
      <View pointerEvents="none" style={styles.edgeGradLeft} />

      {Array.from({ length: 40 }).map((_, i) => (
        <View key={i} style={styles.hole} />
      ))}

      {/* Тёмный оверлей справа */}
      <View pointerEvents="none" style={styles.edgeGradRight} />
    </View>
  )
}

const styles = StyleSheet.create({
  strip: {
    backgroundColor: TRACK_BG,
    overflow: 'hidden',
  },

  // ─── Края с перфорацией ───────────────────────────────────────────────────
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
    width: HOLE_W,
    height: HOLE_H,
    borderRadius: HOLE_R,
    backgroundColor: HOLE_BG,
  },
  edgeGradLeft: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 60,
    backgroundColor: AMBER_L,
    opacity: 0.55,
    zIndex: 1,
  },
  edgeGradRight: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    width: 80,
    backgroundColor: AMBER_D,
    opacity: 0.55,
    zIndex: 1,
  },

  // ─── Трек ─────────────────────────────────────────────────────────────────
  track: {
    height: TRACK_H,
    backgroundColor: TRACK_BG,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  framesRow: {
    paddingHorizontal: 10,
    gap: 8,
    alignItems: 'center',
  },
  gradLeft: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 20,
    backgroundColor: AMBER_L,
    opacity: 0.12,
  },
  gradRight: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    width: 30,
    backgroundColor: AMBER_D,
    opacity: 0.18,
  },

  // ─── Кадры ────────────────────────────────────────────────────────────────
  frame: {
    width: FRAME_W,
    height: FRAME_H,
    borderRadius: FRAME_R,
    borderWidth: 1,
    borderColor: FRAME_BDR,
    overflow: 'hidden',
  },
  frameAvatar: {
    borderColor: AMBER_L,
    borderWidth: 2,
  },
  frameAvatarPh: {
    flex: 1,
    backgroundColor: AMBER_D,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameAvatarLetter: {
    color: '#F5E6C8',
    fontSize: 22,
    fontWeight: '600',
  },
  frameImg: {
    width: '100%',
    height: '100%',
  },
  frameEmpty: {
    flex: 1,
    backgroundColor: FRAME_EMPTY_BG,
    opacity: 0.35,
  },
  framePlusWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.5,
  },
  framePlusText: {
    color: AMBER_MID,
    fontSize: 20,
    fontWeight: '300',
  },
})
