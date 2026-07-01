// ─────────────────────────────────────────────────────────────
// ANTIGRAM MiniPlayer — компактный, правый угол, как в Figma
//
// Состояния:
//   hidden  → ничего не показываем (после закрытия)
//   idle    → маленькая нота ♪ в правом углу, тап = старт
//   active  → компактный пилл справа: ◄◄ ⏸/▶ ►► + трек снизу + × закрыть
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import {
  View, Image, StyleSheet, TouchableOpacity,
  Animated, Text, Easing, LayoutChangeEvent,
} from 'react-native'
import { usePlayer } from '../context/PlayerContext'
import { C } from '../theme'

const IMG = {
  play:    require('../../assets/player/play.png'),
  pause:   require('../../assets/player/pause.png'),
  prev:    require('../../assets/player/prev.png'),
  next:    require('../../assets/player/next.png'),
  musicOn: require('../../assets/player/music_on.png'),
}

// ── Marquee ───────────────────────────────────────────────────
function Marquee({ text }: { text: string }) {
  const anim      = useRef(new Animated.Value(0)).current
  const [textW, setTextW]       = useState(0)
  const [containerW, setContainerW] = useState(0)
  const animRef = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => {
    anim.setValue(0)
    animRef.current?.stop()
    if (textW <= containerW || containerW === 0) return
    const distance = textW + 32
    animRef.current = Animated.loop(
      Animated.sequence([
        Animated.delay(1000),
        Animated.timing(anim, {
          toValue: -distance,
          duration: (distance / 50) * 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(400),
      ])
    )
    animRef.current.start()
    return () => animRef.current?.stop()
  }, [text, textW, containerW])

  return (
    <View
      style={styles.marqueeWrap}
      onLayout={(e: LayoutChangeEvent) => setContainerW(e.nativeEvent.layout.width)}
      pointerEvents="none"
    >
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: anim }] }}>
        <Text
          style={styles.trackName}
          numberOfLines={1}
          onLayout={(e: LayoutChangeEvent) => setTextW(e.nativeEvent.layout.width)}
        >
          {text}
        </Text>
        {textW > containerW && (
          <Text style={[styles.trackName, { paddingLeft: 32 }]} numberOfLines={1}>
            {text}
          </Text>
        )}
      </Animated.View>
    </View>
  )
}

// ── MiniPlayer ────────────────────────────────────────────────
export default function MiniPlayer() {
  const { tracks, currentIndex, isPlaying, isLoading, toggle, next, prev, play, pause } = usePlayer()
  const [mode, setMode] = useState<'hidden' | 'idle' | 'active'>('idle')

  const currentTrack = tracks[currentIndex]

  async function handleStart() {
    setMode('active')
    await play()
  }

  async function handleClose() {
    await pause()
    setMode('idle')   // возвращаемся к иконке (не hidden, чтобы можно было снова открыть)
  }

  // ── Скрыт ────────────────────────────────────────────────
  if (mode === 'hidden') return null

  // ── Idle: маленькая нота ──────────────────────────────────
  if (mode === 'idle') {
    return (
      <TouchableOpacity
        style={styles.idleBtn}
        onPress={handleStart}
        activeOpacity={0.75}
      >
        <Image source={IMG.musicOn} style={styles.musicIcon} />
      </TouchableOpacity>
    )
  }

  // ── Active: компактный пилл ───────────────────────────────
  return (
    <View style={styles.pill}>
      {/* Кнопка закрыть */}
      <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.closeIcon}>✕</Text>
      </TouchableOpacity>

      {/* Контролы: ◄◄ ⏸/▶ ►► */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={prev} style={styles.ctrlBtn} activeOpacity={0.7}>
          <Image source={IMG.prev} style={styles.ctrlIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={toggle}
          style={styles.ctrlBtn}
          activeOpacity={0.7}
          disabled={isLoading}
        >
          <Image
            source={isPlaying ? IMG.pause : IMG.play}
            style={[styles.ctrlIcon, styles.centerIcon]}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={next} style={styles.ctrlBtn} activeOpacity={0.7}>
          <Image source={IMG.next} style={styles.ctrlIcon} />
        </TouchableOpacity>
      </View>

      {/* Название трека с марквизом */}
      <Marquee text={currentTrack?.name ?? ''} />
    </View>
  )
}

// ── Стили ─────────────────────────────────────────────────────
const TABBAR_H = 85

const styles = StyleSheet.create({
  // Маленькая нота — правый нижний угол
  idleBtn: {
    position: 'absolute',
    bottom: TABBAR_H + 10,
    right: 14,
    width: 46, height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(26,20,14,0.92)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(201,132,62,0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4, shadowRadius: 8,
    elevation: 6,
  },
  musicIcon: {
    width: 20, height: 20,
    tintColor: C.AMBER,
    resizeMode: 'contain',
  },

  // Компактный пилл — правая сторона
  pill: {
    position: 'absolute',
    bottom: TABBAR_H + 10,
    right: 14,
    width: 160,
    borderRadius: 16,
    backgroundColor: 'rgba(20,16,12,0.96)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(201,132,62,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12,
    elevation: 8,
  },

  // Кнопка ✕ в правом верхнем углу пилла
  closeBtn: {
    position: 'absolute',
    top: 6, right: 8,
    zIndex: 1,
  },
  closeIcon: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
  },

  // Контролы в одну строку
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 2,
    marginBottom: 6,
  },
  ctrlBtn: {
    width: 32, height: 32,
    justifyContent: 'center', alignItems: 'center',
  },
  ctrlIcon: {
    width: 16, height: 16,
    tintColor: 'rgba(255,255,255,0.65)',
    resizeMode: 'contain',
  },
  centerIcon: {
    width: 20, height: 20,
    tintColor: '#fff',
  },

  // Марквиз под кнопками
  marqueeWrap: {
    overflow: 'hidden',
    height: 16,
    justifyContent: 'center',
  },
  trackName: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    letterSpacing: 0.5,
  },
})
