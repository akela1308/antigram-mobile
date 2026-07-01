import type { MomentWithProfile, ReactionType } from '../../lib/database.types'

export const EMOTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'warm',      emoji: '🔥', label: 'Тепло'      },
  { type: 'nostalgic', emoji: '🌅', label: 'Ностальгия' },
  { type: 'calm',      emoji: '🌿', label: 'Спокойно'   },
  { type: 'wow',       emoji: '✨', label: 'Вау'         },
  { type: 'relatable', emoji: '🤍', label: 'Близко'     },
]

export interface DisplayReaction {
  type: ReactionType
  emoji: string
  label: string
  count: number
}

export function getCustomReaction(moment: MomentWithProfile) {
  if (!moment.custom_mood_emoji || !moment.custom_mood_label) return null
  return {
    emoji: moment.custom_mood_emoji,
    label: moment.custom_mood_label,
  }
}

export function getReactionMeta(type: ReactionType, moment?: MomentWithProfile) {
  if (type === 'custom') {
    const custom = moment ? getCustomReaction(moment) : null
    return {
      emoji: custom?.emoji ?? '✦',
      label: custom?.label ?? 'Своя',
    }
  }

  const preset = EMOTIONS.find(reaction => reaction.type === type)
  return {
    emoji: preset?.emoji ?? '❤️',
    label: preset?.label ?? type,
  }
}

export function getTopReaction(
  reactionCounts: Partial<Record<ReactionType, number>>,
  moment: MomentWithProfile,
): DisplayReaction | null {
  const entries = Object.entries(reactionCounts) as [ReactionType, number][]
  const nonZero = entries.filter(([, count]) => count > 0)

  if (nonZero.length === 0) {
    const fallbackType = getFallbackReactionType(moment)
    if (!fallbackType) return null
    const meta = getReactionMeta(fallbackType, moment)
    return { type: fallbackType, ...meta, count: 1 }
  }

  const [type, count] = nonZero.sort(([, a], [, b]) => b - a)[0]
  const meta = getReactionMeta(type, moment)
  return { type, ...meta, count }
}

export function getFallbackReactionType(moment: MomentWithProfile): ReactionType | null {
  if (moment.custom_mood_emoji && moment.custom_mood_label) return 'custom'
  if (isReactionType(moment.mood)) return moment.mood
  return null
}

export function isReactionType(value: string | null | undefined): value is ReactionType {
  return value === 'warm'
    || value === 'nostalgic'
    || value === 'calm'
    || value === 'wow'
    || value === 'relatable'
    || value === 'custom'
}
