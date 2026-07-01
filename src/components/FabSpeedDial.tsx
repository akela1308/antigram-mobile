/**
 * FabSpeedDial.tsx
 *
 * FAB с 3 действиями:
 *   🎞 С плёнкой — FilmSelect → CameraCapture
 *   📷 Без плёнки — CameraCapture сразу (preset = null)
 *   📁 Новый альбом — CreateAlbum
 *
 * Открывается по тапу на центральную кнопку таббара.
 * Фон затемняется, 3 пункта вылетают вверх spring-анимацией со сдвигом.
 * Закрытие: тап на фон, тап на пункт или повторный тап на FAB.
 */

import { useState, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, Animated, Dimensions,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { C } from '../theme'

const { width: SW } = Dimensions.get('window')

const FAB_D   = 66   // диаметр FAB
const FAB_LIFT = 18  // top: -18 (подъём над таббаром)

// Первый пункт меню: bottom от низа экрана.
// FAB center ≈ 71px → первый пункт сразу над FAB
const FIRST_ITEM_BOTTOM = 112

// Действия speed dial
const ITEMS = [
  {
    id:    'film',
    label: 'Снять кадр',
    icon:  '🎞',
    color: C.AMBER,
  },
  {
    id:    'album',
    label: 'Новый альбом',
    icon:  '📁',
    color: C.BROWN,
  },
] as const

const ITEM_H  = 52   // высота строки действия
const ITEM_GAP = 14  // зазор между строками

export default function FabSpeedDial() {
  const navigation  = useNavigation<any>()
  const [open, setOpen] = useState(false)

  // Один общий прогресс анимации: 0 = закрыто, 1 = открыто
  const progress = useRef(new Animated.Value(0)).current

  // Вращение иконки FAB (▶ ✕)
  const rotate = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0deg', '45deg'],
  })

  // Прозрачность бэкдропа
  const backdropOpacity = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, 0.55],
  })

  function expand() {
    setOpen(true)
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start()
  }

  function collapse(cb?: () => void) {
    Animated.spring(progress, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start(() => {
      setOpen(false)
      cb?.()
    })
  }

  function toggle() {
    open ? collapse() : expand()
  }

  function handleItem(id: typeof ITEMS[number]['id']) {
    collapse(() => {
      switch (id) {
        case 'film':
          navigation.navigate('Camera', { screen: 'FilmSelect' })
          break
        case 'album':
          navigation.navigate('Profile', { screen: 'CreateAlbum' })
          break
      }
    })
  }

  const baseBottom = FIRST_ITEM_BOTTOM

  return (
    <>
      {/* ── Кнопка в таббаре ─────────────────────────────────────────── */}
      <TouchableOpacity onPress={toggle} style={styles.camWrap} activeOpacity={0.82}>
        <View style={styles.camBtn}>
          <Animated.View style={[styles.camBtnInner, open && styles.camBtnInnerOpen]}>
            <View style={styles.camBtnGlow} pointerEvents="none" />
            <Animated.Text
              style={[styles.camBtnText, { transform: [{ rotate }] }]}
              allowFontScaling={false}
            >
              {open ? '✕' : '[A]'}
            </Animated.Text>
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* ── Speed dial поверх всего ───────────────────────────────────── */}
      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => collapse()}
      >
        {/* Бэкдроп */}
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="auto"
        />
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => collapse()}
        />

        {/* Пункты */}
        {ITEMS.map((item, i) => {
          const distance = baseBottom + i * (ITEM_H + ITEM_GAP)

          const translateY = progress.interpolate({
            inputRange:  [0, 1],
            outputRange: [ITEM_H + 8, 0],
          })

          // Небольшая задержка через отдельный progress делается через opacity/scale стаггер
          const opacity = progress.interpolate({
            inputRange:  [i * 0.28, Math.min(i * 0.28 + 0.45, 1)],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          })

          return (
            <Animated.View
              key={item.id}
              style={[
                styles.itemRow,
                {
                  bottom:   distance,
                  opacity,
                  transform: [{ translateY }],
                },
              ]}
              pointerEvents="box-none"
            >
              <TouchableOpacity
                style={styles.itemTouchable}
                onPress={() => handleItem(item.id)}
                activeOpacity={0.8}
              >
                {/* Лейбл */}
                <View style={styles.itemLabel}>
                  <Text style={styles.itemLabelText}>{item.label}</Text>
                </View>

                {/* Цветная кнопка */}
                <View style={[styles.itemBtn, { backgroundColor: item.color }]}>
                  <Text style={styles.itemIcon}>{item.icon}</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          )
        })}

        {/* FAB-призрак внутри Modal (визуальная непрерывность) */}
        <TouchableOpacity
          style={[styles.camWrap, styles.fabGhost]}
          onPress={() => collapse()}
          activeOpacity={0.82}
        >
          <View style={[styles.camBtn]}>
            <View style={[styles.camBtnInner, styles.camBtnInnerOpen]}>
              <View style={styles.camBtnGlow} pointerEvents="none" />
              <Text style={styles.camBtnText} allowFontScaling={false}>✕</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  // ── FAB в таббаре ─────────────────────────────────────────────────────────
  camWrap: {
    top: -FAB_LIFT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camBtn: {
    width: FAB_D,
    height: FAB_D,
    borderRadius: FAB_D / 2,
    backgroundColor: '#2E1A0A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2E1A0A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 7,
  },
  camBtnInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#C4A882',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camBtnInnerOpen: {
    backgroundColor: '#8B5B29',
  },
  camBtnGlow: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#D4B99A',
    opacity: 0.45,
  },
  camBtnText: {
    color: '#1A0F05',
    fontFamily: 'JetBrainsMono_800ExtraBold',
    fontSize: 28,
    letterSpacing: -0.6,
    textAlign: 'center',
  },

  // ── Modal ─────────────────────────────────────────────────────────────────
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },

  // ── Пункты меню ───────────────────────────────────────────────────────────
  itemRow: {
    position: 'absolute',
    right: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexDirection: 'row',
    paddingRight: SW / 2 - FAB_D / 2,  // выравниваем по правому краю FAB
  },
  itemTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemLabel: {
    backgroundColor: 'rgba(20,12,4,0.85)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(201,146,42,0.25)',
  },
  itemLabelText: {
    color: '#E8D5B8',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  itemBtn: {
    width: FAB_D,
    height: FAB_D,
    borderRadius: FAB_D / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  itemIcon: {
    fontSize: 24,
  },

  // ── FAB-призрак внутри Modal ───────────────────────────────────────────────
  // Таббар: height=85, paddingBottom=20, FAB с top=-18.
  // Центр FAB от низа экрана ≈ 20 (safe pad) + (85-20)/2 + 18 = ~71
  fabGhost: {
    position: 'absolute',
    bottom: 38,   // ≈ 71 - 33 (half FAB_D). Подбирается под реальный таббар.
    left: SW / 2 - FAB_D / 2,
    top: undefined,
    zIndex: 10,
  },
})
