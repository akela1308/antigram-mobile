/**
 * Avatar — общий компонент аватарки с заглушкой.
 *
 * Показывает фото, если есть `uri`. Если `uri` нет ИЛИ фото не загрузилось
 * (битая / просроченная ссылка, нет сети) — показывает букву-заглушку
 * (первая буква имени/username, либо "A" по умолчанию).
 *
 * Так кружок аватарки никогда не остаётся пустым.
 */

import { useState, useEffect } from 'react'
import { Image, View, Text, StyleSheet, StyleProp, ViewStyle, ImageStyle } from 'react-native'
import { C } from '../theme'

interface AvatarProps {
  uri?: string | null
  name?: string | null
  size: number
  borderWidth?: number
  borderColor?: string
  style?: StyleProp<ViewStyle | ImageStyle>
}

export default function Avatar({
  uri, name, size, borderWidth = 1, borderColor = C.BORDER, style,
}: AvatarProps) {
  const [failed, setFailed] = useState(false)

  // Сбрасываем ошибку, если ссылка изменилась (например, обновили аватар)
  useEffect(() => { setFailed(false) }, [uri])

  const letter = (name?.trim()?.[0] || 'A').toUpperCase()
  const dim = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth,
    borderColor,
  }

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[dim, style as StyleProp<ImageStyle>]}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <View style={[dim, styles.fallback, style as StyleProp<ViewStyle>]}>
      <Text style={[styles.letter, { fontSize: size * 0.4 }]} allowFontScaling={false}>
        {letter}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: C.BG_WARM,
    justifyContent: 'center',
    alignItems: 'center',
  },
  letter: {
    color: C.BROWN,
    fontWeight: '700',
  },
})
