import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { getFollowers, getFollowing } from '../../lib/db'
import type { FollowProfile } from '../../lib/database.types'
import { C } from '../theme'
import Avatar from '../components/Avatar'

interface RouteParams {
  userId: string
  kind: 'followers' | 'following'
}

export default function FollowListScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { userId, kind } = route.params as RouteParams

  const [list, setList] = useState<FollowProfile[]>([])
  const [loading, setLoading] = useState(true)

  useFocusEffect(
    useCallback(() => { load() }, [userId, kind])
  )

  async function load() {
    setLoading(true)
    const data = kind === 'followers'
      ? await getFollowers(userId)
      : await getFollowing(userId)
    setList(data)
    setLoading(false)
  }

  const title = kind === 'followers' ? 'Подписчики' : 'Подписки'

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={C.AMBER} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={item => item.profile.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderItem={({ item }) => {
            const { profile } = item
            const name = profile.display_name || profile.username || 'antigram'
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate('OtherProfile', { userId: profile.id })}
                activeOpacity={0.75}
              >
                <Avatar uri={profile.avatar_url} name={name} size={44} borderColor={C.BORDER} />
                <View style={styles.info}>
                  <Text style={styles.name}>{name}</Text>
                  {profile.username ? (
                    <Text style={styles.username}>@{profile.username}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {kind === 'followers' ? 'Пока нет подписчиков' : 'Нет подписок'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'flex-start' },
  backIcon: { color: C.TEXT, fontSize: 22 },
  title: { flex: 1, color: C.BROWN, fontSize: 18, fontWeight: '700', textAlign: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.DIVIDER,
  },
  info: { flex: 1 },
  name: { color: C.TEXT, fontSize: 15, fontWeight: '600' },
  username: { color: C.TEXT_MUTED, fontSize: 13, marginTop: 2 },

  empty: { paddingTop: 64, alignItems: 'center' },
  emptyText: { color: C.TEXT_MUTED, fontSize: 14 },
})
