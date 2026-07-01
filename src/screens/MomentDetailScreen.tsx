import { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, Image, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Dimensions,
} from 'react-native'
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import {
  getComments, addComment, deleteComment,
  getReactions, addReaction, removeReaction,
  deleteMoment, adminDeleteMoment, getProfile,
} from '../../lib/db'
import { useAppContext } from '../context/AppContext'
import type { Moment, MomentWithProfile, Profile, CommentWithProfile, ReactionType } from '../../lib/database.types'
import { C } from '../theme'
import Avatar from '../components/Avatar'

const W = Dimensions.get('window').width

const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'warm',      emoji: '🔥', label: 'тепло'      },
  { type: 'nostalgic', emoji: '🌅', label: 'ностальгия' },
  { type: 'calm',      emoji: '🌿', label: 'спокойно'   },
  { type: 'wow',       emoji: '✨', label: 'вау'         },
  { type: 'relatable', emoji: '🤍', label: 'близко'     },
]

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'только что'
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  return `${Math.floor(hours / 24)} д назад`
}

export default function MomentDetailScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { moment: initialMoment, isOwner } = route.params as {
    moment: Moment | MomentWithProfile
    isOwner: boolean
  }
  const { isAdmin } = useAppContext()

  const [moment, setMoment] = useState<Moment>(initialMoment)
  const [authorProfile, setAuthorProfile] = useState<Profile | null>(
    (initialMoment as MomentWithProfile).profiles ?? null
  )
  const [comments, setComments] = useState<CommentWithProfile[]>([])
  const [reactions, setReactions] = useState<Record<ReactionType, number>>({
    warm: 0, nostalgic: 0, calm: 0, wow: 0, relatable: 0, custom: 0,
  })
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editingCaption, setEditingCaption] = useState(false)
  const [captionDraft, setCaptionDraft] = useState(moment.caption ?? '')
  const scrollRef = useRef<ScrollView>(null)

  useFocusEffect(
    useCallback(() => { load() }, [moment.id])
  )

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUserId(user?.id ?? null)

    const [cmts, rxns, prof] = await Promise.all([
      getComments(moment.id),
      getReactions(moment.id),
      authorProfile ? Promise.resolve(authorProfile) : getProfile(moment.user_id),
    ])

    setComments(cmts)
    if (prof && !authorProfile) setAuthorProfile(prof)

    const counts: Record<ReactionType, number> = {
      warm: 0, nostalgic: 0, calm: 0, wow: 0, relatable: 0, custom: 0,
    }
    let mine: ReactionType | null = null
    for (const r of rxns as any[]) {
      if (counts[r.type as ReactionType] !== undefined) {
        counts[r.type as ReactionType] += 1
      }
      if (r.user_id === user?.id) mine = r.type
    }
    setReactions(counts)
    setMyReaction(mine)
    setLoading(false)
  }

  async function handleReaction(type: ReactionType) {
    if (!currentUserId) return
    if (myReaction === type) {
      await removeReaction(moment.id, currentUserId)
      setMyReaction(null)
      setReactions(prev => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }))
    } else {
      if (myReaction) {
        setReactions(prev => ({ ...prev, [myReaction]: Math.max(0, prev[myReaction] - 1) }))
      }
      await addReaction(moment.id, currentUserId, type)
      setMyReaction(type)
      setReactions(prev => ({ ...prev, [type]: prev[type] + 1 }))
    }
  }

  async function handleSendComment() {
    const trimmed = commentText.trim()
    if (!trimmed || !currentUserId) return
    setSending(true)
    const { data, error } = await addComment(moment.id, currentUserId, trimmed)
    setSending(false)
    if (error) {
      Alert.alert('Ошибка', error.message || 'Не удалось отправить комментарий')
      return
    }
    if (data) {
      setComments(prev => [...prev, data as CommentWithProfile])
      setCommentText('')
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }

  function handleDeleteComment(commentId: string, commentUserId: string) {
    if (commentUserId !== currentUserId) return
    Alert.alert('Удалить комментарий?', '', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive',
        onPress: async () => {
          await deleteComment(commentId)
          setComments(prev => prev.filter(c => c.id !== commentId))
        },
      },
    ])
  }

  function openMenu() {
    if (isOwner) {
      Alert.alert('', '', [
        {
          text: 'Редактировать описание',
          onPress: () => { setCaptionDraft(moment.caption ?? ''); setEditingCaption(true) },
        },
        {
          text: 'Удалить фото', style: 'destructive',
          onPress: () =>
            Alert.alert('Удалить фото?', 'Это действие нельзя отменить', [
              { text: 'Отмена', style: 'cancel' },
              {
                text: 'Удалить', style: 'destructive',
                onPress: async () => { await deleteMoment(moment.id); navigation.goBack() },
              },
            ]),
        },
        { text: 'Отмена', style: 'cancel' },
      ])
    } else {
      // Admin-only: delete any photo
      Alert.alert('Удалить фото?', 'Удаление нельзя отменить', [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить', style: 'destructive',
          onPress: async () => { await adminDeleteMoment(moment.id); navigation.goBack() },
        },
      ])
    }
  }

  async function handleSaveCaption() {
    const { error } = await supabase
      .from('moments')
      .update({ caption: captionDraft.trim() || null })
      .eq('id', moment.id)
    if (!error) setMoment(prev => ({ ...prev, caption: captionDraft.trim() || null }))
    setEditingCaption(false)
  }

  const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0)
  const authorName = authorProfile?.display_name || authorProfile?.username || 'antigram'

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backBtn}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {(isOwner || isAdmin) && (
          <TouchableOpacity
            onPress={openMenu}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.menuIcon}>• • •</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Автор */}
        <TouchableOpacity
          style={styles.authorRow}
          onPress={() => {
            if (isOwner) {
              navigation.navigate('Profile')
            } else {
              navigation.navigate('OtherProfile', { userId: moment.user_id })
            }
          }}
          activeOpacity={0.75}
        >
          <Avatar uri={authorProfile?.avatar_url} name={authorName} size={36} borderColor={C.BORDER} />
          <View style={styles.authorInfo}>
            <Text style={styles.authorName}>{authorName}</Text>
            <Text style={styles.authorTime}>{timeAgo(moment.created_at)}</Text>
          </View>
        </TouchableOpacity>

        {/* Фото 3:4 */}
        <Image source={{ uri: moment.photo_url }} style={styles.photo} resizeMode="cover" />

        {/* Подпись */}
        {editingCaption ? (
          <View style={styles.captionEdit}>
            <TextInput
              style={styles.captionInput}
              value={captionDraft}
              onChangeText={setCaptionDraft}
              multiline
              autoFocus
              placeholder="Описание..."
              placeholderTextColor={C.TEXT_PH}
            />
            <View style={styles.captionEditBtns}>
              <TouchableOpacity onPress={() => setEditingCaption(false)}>
                <Text style={styles.captionCancel}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveCaption}>
                <Text style={styles.captionSave}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : moment.caption ? (
          <View style={styles.captionWrap}>
            <Text style={styles.captionText}>{moment.caption}</Text>
          </View>
        ) : null}

        {/* Реакции */}
        <View style={styles.reactionsBlock}>
          {totalReactions > 0 && (
            <Text style={styles.reactionsCount}>{totalReactions} реакций</Text>
          )}
          <View style={styles.reactionsRow}>
            {REACTIONS.map(({ type, emoji, label }) => {
              const count = reactions[type]
              const active = myReaction === type
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.reactionBtn, active && styles.reactionBtnActive]}
                  onPress={() => handleReaction(type)}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  <Text style={[styles.reactionCustomLabel, active && styles.reactionCountActive]}>
                    {label}
                  </Text>
                  {count > 0 && (
                    <Text style={[styles.reactionCount, active && styles.reactionCountActive]}>
                      {count}
                    </Text>
                  )}
                </TouchableOpacity>
              )
            })}

            {/* Кастомная эмоция автора */}
            {moment.custom_mood_emoji && moment.custom_mood_label ? (
              <TouchableOpacity
                style={[
                  styles.reactionBtn,
                  styles.reactionBtnCustom,
                  myReaction === 'custom' && styles.reactionBtnActive,
                ]}
                onPress={() => handleReaction('custom')}
              >
                <Text style={styles.reactionEmoji}>{moment.custom_mood_emoji}</Text>
                <Text style={[
                  styles.reactionCustomLabel,
                  myReaction === 'custom' && styles.reactionCountActive,
                ]}>
                  {moment.custom_mood_label}
                </Text>
                {reactions['custom'] > 0 && (
                  <Text style={[styles.reactionCount, myReaction === 'custom' && styles.reactionCountActive]}>
                    {reactions['custom']}
                  </Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Комментарии */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={C.AMBER} size="small" />
          </View>
        ) : (
          <View style={styles.commentsBlock}>
            {comments.length === 0 && (
              <Text style={styles.noComments}>Пока нет комментариев</Text>
            )}
            {comments.map(c => {
              const name = c.profiles?.display_name || c.profiles?.username || 'antigram'
              const isMyComment = c.user_id === currentUserId
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.commentRow}
                  onLongPress={() => isMyComment && handleDeleteComment(c.id, c.user_id)}
                  activeOpacity={isMyComment ? 0.7 : 1}
                >
                  <Avatar uri={c.profiles?.avatar_url} name={name} size={32} borderColor={C.BORDER} />
                  <View style={styles.commentBody}>
                    <Text style={styles.commentName}>{name}</Text>
                    <Text style={styles.commentText}>{c.text}</Text>
                    <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Поле ввода комментария */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.commentInput}
          placeholder="Написать комментарий..."
          placeholderTextColor={C.TEXT_PH}
          value={commentText}
          onChangeText={setCommentText}
          multiline
          maxLength={300}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!commentText.trim() || sending) && { opacity: 0.4 }]}
          onPress={handleSendComment}
          disabled={!commentText.trim() || sending}
        >
          {sending
            ? <ActivityIndicator color={C.WHITE} size="small" />
            : <Text style={styles.sendBtnText}>↑</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  backIcon: { color: C.BROWN, fontSize: 22 },
  menuIcon: { color: C.TEXT_SEC, fontSize: 14, letterSpacing: 2 },

  // Автор
  authorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingBottom: 10,
  },
  authorAvatar: { width: 36, height: 36, borderRadius: 18 },
  authorAvatarPh: {
    backgroundColor: C.BG_WARM,
    borderWidth: 1, borderColor: C.BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  authorAvatarLetter: { color: C.BROWN, fontWeight: '700', fontSize: 14 },
  authorInfo: { flex: 1 },
  authorName: { color: C.BROWN_MID, fontWeight: '600', fontSize: 14 },
  authorTime: { color: C.TEXT_MUTED, fontSize: 11, marginTop: 1 },

  // Фото — 3:4
  photo: { width: W, aspectRatio: 3 / 4, backgroundColor: C.BG_WARM },

  captionWrap: { paddingHorizontal: 16, paddingTop: 14 },
  captionText: { color: C.TEXT, fontSize: 15, lineHeight: 22 },

  captionEdit: { padding: 16 },
  captionInput: {
    backgroundColor: C.BG_WARM, borderRadius: 10,
    borderWidth: 1, borderColor: C.BORDER,
    color: C.TEXT, fontSize: 15, padding: 12, minHeight: 70,
    textAlignVertical: 'top', marginBottom: 10,
  },
  captionEditBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  captionCancel: { color: C.TEXT_MUTED, fontSize: 14, fontWeight: '600' },
  captionSave: { color: C.BROWN, fontSize: 14, fontWeight: '700' },

  reactionsBlock: { paddingHorizontal: 16, paddingVertical: 12 },
  reactionsCount: { color: C.TEXT_MUTED, fontSize: 12, marginBottom: 10 },
  reactionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  reactionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.BG_WARM, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: C.BORDER,
  },
  reactionBtnActive: { backgroundColor: '#FFF3E0', borderColor: C.AMBER },
  reactionBtnCustom: { borderColor: '#C4A882' },
  reactionEmoji: { fontSize: 18 },
  reactionCount: { color: C.TEXT_MUTED, fontSize: 13, fontWeight: '600' },
  reactionCountActive: { color: C.AMBER },
  reactionCustomLabel: { color: C.TEXT_MUTED, fontSize: 12, fontWeight: '500' },

  divider: { height: 1, backgroundColor: C.DIVIDER, marginHorizontal: 16 },
  loadingWrap: { paddingVertical: 24, alignItems: 'center' },

  commentsBlock: { paddingHorizontal: 16, paddingTop: 12 },
  noComments: { color: C.TEXT_MUTED, fontSize: 14, textAlign: 'center', paddingVertical: 20 },

  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 16, alignItems: 'flex-start' },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentAvatarPh: {
    backgroundColor: C.BG_WARM, borderWidth: 1, borderColor: C.BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  commentAvatarLetter: { color: C.BROWN, fontSize: 12, fontWeight: '700' },
  commentBody: { flex: 1 },
  commentName: { color: C.TEXT, fontSize: 13, fontWeight: '600', marginBottom: 2 },
  commentText: { color: C.TEXT_SEC, fontSize: 14, lineHeight: 20 },
  commentTime: { color: C.TEXT_MUTED, fontSize: 11, marginTop: 4 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: C.BORDER,
    backgroundColor: C.BG, gap: 8,
  },
  commentInput: {
    flex: 1, backgroundColor: C.BG_WARM, borderRadius: 20,
    borderWidth: 1, borderColor: C.BORDER,
    color: C.TEXT, fontSize: 14,
    paddingHorizontal: 14, paddingVertical: 10, maxHeight: 100,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.BROWN, justifyContent: 'center', alignItems: 'center',
  },
  sendBtnText: { color: C.WHITE, fontSize: 18, fontWeight: '700' },
})
