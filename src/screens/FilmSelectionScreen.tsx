import { useState, useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  Dimensions, FlatList, Animated, ViewToken, ImageSourcePropType,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { FILM_PRESETS } from '../constants/filmPresets'
import { C } from '../theme'

const LAST_FILM_KEY = '@antigram_last_film'
const { width: SW, height: SH } = Dimensions.get('window')
const ITEM_WIDTH  = SW * 0.62
const ITEM_HEIGHT = ITEM_WIDTH * 1.45
const SIDE_GAP    = (SW - ITEM_WIDTH) / 2

export default function FilmSelectionScreen() {
  const navigation = useNavigation<any>()
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollX = useRef(new Animated.Value(0)).current
  const filmListRef = useRef<FlatList<any>>(null)

  useEffect(() => {
    AsyncStorage.getItem(LAST_FILM_KEY).then((val) => {
      if (val === null) return
      const idx = parseInt(val, 10)
      if (isNaN(idx) || idx < 0 || idx >= FILM_PRESETS.length) return
      setActiveIndex(idx)
      setTimeout(() => {
        filmListRef.current?.scrollToOffset({
          offset: idx * (ITEM_WIDTH + 24),
          animated: false,
        })
      }, 150)
    })
  }, [])

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index)
      }
    }
  ).current

  function handleLoad() {
    const preset = FILM_PRESETS[activeIndex]
    AsyncStorage.setItem(LAST_FILM_KEY, String(activeIndex))
    navigation.navigate('CameraCapture', { preset })
  }

  return (
    <View style={styles.root}>
      {/* Заголовок */}
      <View style={styles.header}>
        <Text style={styles.title}>Зарядить плёнку</Text>
        <Text style={styles.subtitle}>Выберите плёнку для съёмки</Text>
      </View>

      {/* Карусель катушек */}
      <View style={styles.carouselArea}>
        <Animated.FlatList
          ref={filmListRef as any}
          data={FILM_PRESETS}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM_WIDTH + 24}
          snapToAlignment="start"
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: SIDE_GAP, gap: 24 }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true }
          )}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          renderItem={({ item, index }) => {
            const inputRange = [
              (index - 1) * (ITEM_WIDTH + 24),
              index * (ITEM_WIDTH + 24),
              (index + 1) * (ITEM_WIDTH + 24),
            ]
            const scale = scrollX.interpolate({
              inputRange, outputRange: [0.86, 1, 0.86], extrapolate: 'clamp',
            })
            const opacity = scrollX.interpolate({
              inputRange, outputRange: [0.5, 1, 0.5], extrapolate: 'clamp',
            })
            return (
              <Animated.View style={[styles.filmCard, { transform: [{ scale }], opacity }]}>
                {item.thumb ? (
                  <Image source={item.thumb} style={styles.filmImage} resizeMode="center" />
                ) : (
                  // Алго-пресет — текстовая карточка
                  <View style={styles.algoCard}>
                    <Text style={styles.algoIcon}>⬜</Text>
                    <Text style={styles.algoName}>{item.name}</Text>
                    <Text style={styles.algoHint}>Алгоритмическая плёнка</Text>
                  </View>
                )}
              </Animated.View>
            )
          }}
        />
      </View>

      {/* Название плёнки + точки */}
      <View style={styles.nameRow}>
        <Text style={styles.filmName}>{FILM_PRESETS[activeIndex].name}</Text>
        <View style={styles.dots}>
          {FILM_PRESETS.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>
      </View>

      {/* Кнопки */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.loadBtn} onPress={handleLoad} activeOpacity={0.85}>
          <Text style={styles.loadBtnText}>Зарядить</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => navigation.navigate('CameraCapture', { preset: null })}
        >
          <Text style={styles.skipText}>Без фильтра</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG_DARK },

  header: { paddingTop: 64, paddingHorizontal: 24, marginBottom: 32 },
  title: {
    color: C.WHITE, fontSize: 26, fontWeight: '700',
    letterSpacing: 0.2, marginBottom: 6,
  },
  subtitle: { color: '#777', fontSize: 15 },

  carouselArea: { height: ITEM_HEIGHT + 20, justifyContent: 'center' },

  filmCard: {
    width: ITEM_WIDTH, height: ITEM_HEIGHT,
    borderRadius: 20, backgroundColor: '#1A1208',
    borderWidth: 1, borderColor: '#2E2218',
    justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  filmImage: { width: '100%', height: '100%' },

  // Алго-пресет карточка
  algoCard: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12,
    paddingHorizontal: 16,
  },
  algoIcon: { fontSize: 48, opacity: 0.3 },
  algoName: {
    color: C.WHITE, fontSize: 22, fontWeight: '700',
    letterSpacing: 0.5, textAlign: 'center',
  },
  algoHint: {
    color: '#555', fontSize: 12, letterSpacing: 0.8,
    textTransform: 'uppercase', textAlign: 'center',
  },

  nameRow: { alignItems: 'center', marginTop: 28, gap: 16 },
  filmName: { color: C.WHITE, fontSize: 20, fontWeight: '600', letterSpacing: 0.3 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#333' },
  dotActive: { backgroundColor: C.AMBER, width: 18 },

  footer: {
    position: 'absolute', bottom: 48, left: 24, right: 24, gap: 12,
  },
  loadBtn: {
    backgroundColor: C.AMBER, paddingVertical: 16,
    borderRadius: 32, alignItems: 'center',
    shadowColor: C.AMBER, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12,
  },
  loadBtnText: { color: C.WHITE, fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  skipBtn: { paddingVertical: 12, alignItems: 'center' },
  skipText: { color: '#555', fontSize: 14 },
})
