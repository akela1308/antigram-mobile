import { Image } from 'react-native'
import * as ImageManipulator from 'expo-image-manipulator'
import type { ImageVariantName, ImageVariants } from '../../lib/database.types'

/**
 * Лестница вариантов кадра — зеркало telegram-webapp/src/lib/imageVariants.ts.
 * Оба клиента пишут в один бакет и в одну колонку moments.image_variants,
 * поэтому размеры и quality должны совпадать: иначе один и тот же экран будет
 * весить по-разному на вебе и в приложении.
 *
 * original — архив (то, что сохраняется в галерею)
 * feed     — лента и полноэкранная прокрутка
 * thumb    — сетки, обложки альбомов, миниатюры в уведомлениях
 */
export const MOMENT_SOURCE = { maxSide: 1080, compress: 0.85 }

export const MOMENT_IMAGE_VARIANTS: Record<'thumb' | 'feed', { maxSide: number; compress: number }> = {
  thumb: { maxSide: 400, compress: 0.70 },
  feed: { maxSide: 800, compress: 0.72 },
}

/**
 * Пути к файлам уникальны (userId/timestamp/variant.jpg) и никогда не
 * перезаписываются, поэтому кэшируем максимально долго. По умолчанию Supabase
 * Storage отдаёт max-age=3600 — то есть один и тот же кадр перекачивается
 * заново каждый час просмотра.
 */
export const MOMENT_IMAGE_CACHE_CONTROL = '31536000, immutable'

type MomentLike = {
  photo_url: string
  image_variants?: ImageVariants | null
}

/**
 * Выбирает подходящий вариант с мягкой деградацией: у старых моментов
 * image_variants нет — для них вернётся photo_url, и экран отработает как раньше.
 */
export function getMomentImageUrl(moment: MomentLike, variant: ImageVariantName): string {
  const variants = moment.image_variants ?? {}

  if (variant === 'thumb') {
    return variants.thumb ?? variants.feed ?? variants.full ?? variants.original ?? moment.photo_url
  }

  if (variant === 'feed') {
    return variants.feed ?? variants.full ?? variants.original ?? variants.thumb ?? moment.photo_url
  }

  if (variant === 'full') {
    return variants.full ?? variants.original ?? variants.feed ?? variants.thumb ?? moment.photo_url
  }

  return variants.original ?? variants.full ?? variants.feed ?? variants.thumb ?? moment.photo_url
}

/** То же самое, когда на руках только URL и варианты по отдельности. */
export function getImageUrl(
  photoUrl: string | null | undefined,
  variants: ImageVariants | null | undefined,
  variant: ImageVariantName,
): string | null {
  if (!photoUrl) return null
  return getMomentImageUrl({ photo_url: photoUrl, image_variants: variants ?? null }, variant)
}

/** Размеры локального файла. null, если прочитать не удалось. */
export function getImageSize(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    )
  })
}

/**
 * Уменьшает кадр до maxSide по длинной стороне и пережимает в JPEG.
 * Если кадр уже меньше — только пережимает: апскейл маленьких снимков
 * не даёт качества, но стоит килобайтов.
 */
export async function createResizedJpeg(
  uri: string,
  maxSide: number,
  compress: number,
  sourceSize?: { width: number; height: number } | null,
): Promise<string> {
  const size = sourceSize ?? (await getImageSize(uri))
  const actions: ImageManipulator.Action[] = []

  if (size) {
    const sourceMaxSide = Math.max(size.width, size.height)
    if (sourceMaxSide > maxSide) {
      actions.push(
        size.width >= size.height
          ? { resize: { width: maxSide } }
          : { resize: { height: maxSide } },
      )
    }
  }

  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
  })
  return result.uri
}
