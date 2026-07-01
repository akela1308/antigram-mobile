// Типы для всех таблиц Supabase

export interface Profile {
  id: string
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  website: string | null
  created_at: string
}

export interface Moment {
  id: string
  user_id: string
  photo_url: string
  caption: string | null
  mood: string | null
  custom_mood_emoji: string | null
  custom_mood_label: string | null
  is_public: boolean
  created_at: string
}

// Момент с профилем автора (для ленты)
export interface MomentWithProfile extends Moment {
  profiles: Profile
}

export interface Reaction {
  id: string
  moment_id: string
  user_id: string
  type: ReactionType
  created_at: string
}

export type ReactionType = 'warm' | 'nostalgic' | 'calm' | 'wow' | 'relatable' | 'custom'

export interface Follow {
  follower_id: string
  following_id: string
  created_at: string
}

export interface ReactionWithDetails extends Reaction {
  profiles: Profile
  moments: Moment
}

export interface Highlight {
  id: string
  user_id: string
  moment_id: string
  position: number
  created_at: string
}

export interface HighlightWithMoment extends Highlight {
  moments: Moment
}

export interface Album {
  id: string
  user_id: string
  title: string
  cover_url: string | null
  is_public: boolean
  created_at: string
}

export interface AlbumMoment {
  album_id: string
  moment_id: string
  added_at: string
}

export interface AlbumWithMoments extends Album {
  moments_count: number
  first_moment_url: string | null
}

export interface Comment {
  id: string
  moment_id: string
  user_id: string
  text: string
  created_at: string
}

export interface CommentWithProfile extends Comment {
  profiles: Profile | null
}

export interface SavedMoment {
  id: string
  user_id: string
  moment_id: string
  saved_at: string
}

export interface FollowProfile {
  profile: Profile
  followed_at: string
}

export interface NotificationItem {
  id: string
  user_id: string
  type: 'follow' | 'reaction' | 'comment'
  actor_id: string | null
  moment_id: string | null
  payload: Record<string, any>
  read: boolean
  created_at: string
  // Joined relations
  profiles: Profile | null
  moments: {
    id: string
    user_id: string
    photo_url: string
    caption: string | null
    mood: string | null
    is_public: boolean
    created_at: string
  } | null
}
