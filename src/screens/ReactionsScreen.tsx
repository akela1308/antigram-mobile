import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, Image,
  ActivityIndicator, TouchableOpacity,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import { getMyNotifications, markNotificationsRead } from '../../lib/db'
import type { NotificationItem, Moment } from '../../lib/database.types'
import { C } from '../theme'
import { useAppContext } from '../context/AppContext'

const REACTION_EMOJI: Record<string, string> = {
  warm: '🔥', nostalgic: '🌅', calm: '🌿', wow: '✨', relatable: '🤍',
}

const TYPE_CONFIG = {
  follow:   { icon: '👤', label: (actor: string) => `${actor} подписался на тебя` },
  reaction: { icon: '✨', label: (actor: string, payload?: Record<string, any>) =>
    `${actor} отреагировал ${REACTION_EMOJI[payload?.reaction_type ?? ''] ?? '❤️'}` },
  comment:  { icon: '💬', label: (actor: string, payload?: Record<string, any>) =>
    `${actor}: ${payload?.text_preview ?? ''}` },
}

function getActorName(profile: NotificationItem['profiles']): string {
  return profile?.display_name || profile?.username || 'Кто-то'
}

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2)  return 'только что'
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'вчера'
  return `${days} д назад`
}

function isRecent(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000
}

export default function ReactionsScreen() {
  const navigation = useNavigation<any>()
  const { setUnreadCount } = useAppContext()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading]             = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | undefined>()

  useFocusEffect(
    useCallback(() => { load() }, [])
  )

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setCurrentUserId(user.id)
    const data = await getMyNotifications(user.id)
    setNotifications(data)
    setLoading(false)
    markNotificationsRead(user.id)
    setUnreadCount(0)
  }

  function handleNotificationPress(item: NotificationItem) {
    if ((item.type === 'reaction' || item.type === 'comment') && item.moments) {
      const m = item.moments
      const moment: Moment = {
        id: m.id,
        user_id: m.user_id,
        photo_url: m.photo_url,
        caption: m.caption,
        mood: m.mood,
        custom_mood_emoji: null,
        custom_mood_label: null,
        is_public: m.is_public,
        created_at: m.created_at,
      }
      navigation.navigate('MomentDetail', {
        moment,
        isOwner: m.user_id === currentUserId,
      })
    } else if (item.actor_id) {
      navigation.navigate('OtherProfile', { userId: item.actor_id })
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.AMBER} />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Уведомления</Text>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const actorName = getActorName(item.profiles)
          const cfg       = TYPE_CONFIG[item.type]
          const label     = cfg.label(actorName, item.payload)
          const unread    = !item.read
          const recent    = isRecent(item.created_at)
          const letter    = actorName[0].toUpperCase()

          return (
            <TouchableOpacity
              style={[styles.row, unread && styles.rowUnread]}
              onPress={() => handleNotificationPress(item)}
              activeOpacity={0.75}
            >
              {/* Аватар актора */}
              <View style={styles.avatarWrap}>
                {item.profiles?.avatar_url ? (
                  <Image source={{ uri: item.profiles.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarLetter}>{letter}</Text>
                  </View>
                )}
                {/* Иконка типа уведомления */}
                <View style={styles.typeIcon}>
                  <Text style={styles.typeIconText}>{cfg.icon}</Text>
                </View>
              </View>

              {/* Текст */}
              <View style={styles.textWrap}>
                <Text style={styles.label} numberOfLines={2}>{label}</Text>
                <Text style={styles.time}>{formatTime(item.created_at)}</Text>
              </View>

              {/* Превью момента (для reaction/comment) */}
              {item.moments?.photo_url ? (
                <Image source={{ uri: item.moments.photo_url }} style={styles.thumb} />
              ) : null}

              {/* Оранжевая точка для новых */}
              {(unread || recent) && <View style={styles.dot} />}
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🔔</Text>
            <Text style={styles.emptyTitle}>Пока нет уведомлений</Text>
            <Text style={styles.emptyHint}>
              Когда кто-то подпишется или отреагирует — появится здесь
            </Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.BG },
  centered: { flex: 1, backgroundColor: C.BG, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  title: { color: C.BROWN, fontSize: 22, fontWeight: '700', letterSpacing: 0.3 },

  listContent: { paddingBottom: 24 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
    borderBottomWidth: 1, borderBottomColor: C.DIVIDER,
  },
  rowUnread: {
    backgroundColor: 'rgba(201,132,62,0.06)',
  },

  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatarImg: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 1, borderColor: C.BORDER,
  },
  avatarFallback: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: C.BG_WARM, borderWidth: 1, borderColor: C.BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarLetter: { color: C.BROWN, fontWeight: '700', fontSize: 17 },
  typeIcon: {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: C.BG,
    justifyContent: 'center', alignItems: 'center',
  },
  typeIconText: { fontSize: 11 },

  textWrap: { flex: 1 },
  label: { color: C.TEXT, fontSize: 14, lineHeight: 20 },
  time:  { color: C.TEXT_MUTED, fontSize: 12, marginTop: 3 },

  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: C.BG_WARM, flexShrink: 0 },

  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.AMBER, flexShrink: 0,
  },

  emptyWrap: { paddingTop: 72, alignItems: 'center', gap: 10, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { color: C.TEXT, fontSize: 16, fontWeight: '600' },
  emptyHint: { color: C.TEXT_MUTED, fontSize: 14, textAlign: 'center', lineHeight: 20 },
})
