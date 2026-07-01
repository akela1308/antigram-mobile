import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, FlatList, Image, ScrollView,
  TouchableOpacity, TextInput, ActivityIndicator, Dimensions,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  searchUsers, getRandomMoments, getPhotoOfDay, getRandomUser, getUserMoments,
} from '../../lib/db'
import type { Profile, MomentWithProfile, Moment } from '../../lib/database.types'
import { C } from '../theme'

const W = Dimensions.get('window').width
const THUMB = 70

function getDisplayName(profile: Profile): string {
  return profile.display_name || profile.username || 'antigram'
}

export default function SearchScreen() {
  const navigation = useNavigation<any>()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)

  const [randomUser, setRandomUser] = useState<Profile | null>(null)
  const [randomUserMoments, setRandomUserMoments] = useState<Moment[]>([])
  const [forYou, setForYou] = useState<MomentWithProfile[]>([])
  const [photoOfDay, setPhotoOfDay] = useState<MomentWithProfile | null>(null)
  const [defaultLoading, setDefaultLoading] = useState(true)

  useEffect(() => { loadDefault() }, [])

  async function loadDefault() {
    setDefaultLoading(true)
    const [user, forYouMoments, pod] = await Promise.all([
      getRandomUser(), getRandomMoments(3), getPhotoOfDay(),
    ])
    setRandomUser(user)
    setForYou(forYouMoments)
    setPhotoOfDay(pod)
    if (user) {
      const moms = await getUserMoments(user.id)
      setRandomUserMoments(moms.slice(0, 6))
    }
    setDefaultLoading(false)
  }

  async function handleSearch(text: string) {
    setQuery(text)
    if (text.trim().length < 2) { setResults([]); return }
    setLoading(true)
    const data = await searchUsers(text.trim())
    setResults(data)
    setLoading(false)
  }

  function openProfile(userId: string) {
    navigation.navigate('Profile', { screen: 'OtherProfile', params: { userId } })
  }

  const isSearching = query.trim().length >= 2

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topSide} />
        <Text style={styles.logo}>Antigram</Text>
        <View style={styles.topSide}>
          <TouchableOpacity>
            <Text style={styles.bookmarkIcon}>🔖</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search field */}
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="username"
            placeholderTextColor={C.TEXT_PH}
            value={query}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]) }}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isSearching ? (
        <>
          {loading && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={C.AMBER} />
            </View>
          )}
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <SearchUserRow profile={item} onPress={() => openProfile(item.id)} />
            )}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>Ничего не найдено</Text>
                </View>
              ) : null
            }
          />
        </>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {defaultLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={C.AMBER} />
            </View>
          ) : (
            <>
              {randomUser && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>username</Text>
                  <TouchableOpacity
                    style={styles.userPreviewRow}
                    onPress={() => openProfile(randomUser.id)}
                  >
                    {randomUser.avatar_url ? (
                      <Image source={{ uri: randomUser.avatar_url }} style={styles.miniAvatar} />
                    ) : (
                      <View style={[styles.miniAvatar, styles.miniAvatarPh]}>
                        <Text style={styles.miniAvatarLetter}>
                          {getDisplayName(randomUser)[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.userPreviewName}>{getDisplayName(randomUser)}</Text>
                    {randomUser.username
                      ? <Text style={styles.userPreviewHandle}>@{randomUser.username}</Text>
                      : null}
                  </TouchableOpacity>
                  {randomUserMoments.length > 0 && (
                    <ScrollView
                      horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.filmContent}
                    >
                      {randomUserMoments.map(m => (
                        <Image key={m.id} source={{ uri: m.photo_url }} style={styles.filmThumb} />
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}

              {forYou.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>подборка для вас</Text>
                  <ScrollView
                    horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filmContent}
                  >
                    {forYou.map(m => (
                      <View key={m.id} style={styles.forYouCard}>
                        <Image source={{ uri: m.photo_url }} style={styles.forYouImg} />
                        {m.profiles?.username ? (
                          <Text style={styles.forYouUser} numberOfLines={1}>
                            @{m.profiles.username}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              {photoOfDay && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>фото дня</Text>
                  <TouchableOpacity
                    style={styles.podCard}
                    onPress={() => openProfile(photoOfDay.user_id)}
                  >
                    <Image source={{ uri: photoOfDay.photo_url }} style={styles.podImg} />
                    {photoOfDay.profiles?.username ? (
                      <View style={styles.podOverlay}>
                        <Text style={styles.podUser}>@{photoOfDay.profiles.username}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </View>
              )}

              <View style={{ height: 32 }} />
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function SearchUserRow({ profile, onPress }: { profile: Profile; onPress: () => void }) {
  const [moments, setMoments] = useState<Moment[]>([])
  useEffect(() => {
    getUserMoments(profile.id).then(m => setMoments(m.slice(0, 4)))
  }, [profile.id])
  const name = getDisplayName(profile)

  return (
    <TouchableOpacity style={styles.userRow} onPress={onPress}>
      <View style={styles.userRowTop}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
        ) : (
          <View style={[styles.avatarImg, styles.avatarPh]}>
            <Text style={styles.avatarLetter}>{name[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{name}</Text>
          {profile.username ? <Text style={styles.userHandle}>@{profile.username}</Text> : null}
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
      {moments.length > 0 && (
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={styles.userThumbStrip}
          contentContainerStyle={{ gap: 4 }}
        >
          {moments.map(m => (
            <Image key={m.id} source={{ uri: m.photo_url }} style={styles.userThumb} />
          ))}
        </ScrollView>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10,
  },
  topSide: { width: 44, alignItems: 'flex-end' },
  logo: { color: C.BROWN, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  bookmarkIcon: { fontSize: 18 },

  searchWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.BG_WARM, borderRadius: 12,
    borderWidth: 1, borderColor: C.BORDER,
    paddingHorizontal: 12, gap: 8,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, color: C.TEXT, fontSize: 15, paddingVertical: 12 },
  clearBtn: { color: C.TEXT_MUTED, fontSize: 16, paddingLeft: 4 },

  loadingWrap: { paddingVertical: 32, alignItems: 'center' },

  section: { marginBottom: 24 },
  sectionLabel: {
    color: C.TEXT_MUTED, fontSize: 11, letterSpacing: 1.4,
    textTransform: 'uppercase', paddingHorizontal: 16, marginBottom: 10,
  },

  userPreviewRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 10, gap: 10,
  },
  miniAvatar: { width: 36, height: 36, borderRadius: 18 },
  miniAvatarPh: {
    backgroundColor: C.BG_WARM, borderWidth: 1, borderColor: C.BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  miniAvatarLetter: { color: C.BROWN, fontWeight: '700', fontSize: 14 },
  userPreviewName: { color: C.TEXT, fontWeight: '600', fontSize: 14 },
  userPreviewHandle: { color: C.TEXT_MUTED, fontSize: 12, marginLeft: 2 },

  filmContent: { paddingHorizontal: 16, gap: 6 },
  filmThumb: { width: THUMB, height: THUMB, borderRadius: 6, backgroundColor: C.BG_WARM },

  forYouCard: { width: (W - 48) / 2.4 },
  forYouImg: {
    width: (W - 48) / 2.4, height: (W - 48) / 2.4,
    borderRadius: 8, backgroundColor: C.BG_WARM,
  },
  forYouUser: { color: C.TEXT_MUTED, fontSize: 11, marginTop: 4, paddingLeft: 2 },

  podCard: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden' },
  podImg: { width: W - 32, height: (W - 32) * 0.65 },
  podOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', padding: 10,
  },
  podUser: { color: C.WHITE, fontSize: 13, fontWeight: '600' },

  userRow: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: C.DIVIDER,
  },
  userRowTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatarImg: { width: 42, height: 42, borderRadius: 21 },
  avatarPh: {
    backgroundColor: C.BG_WARM, borderWidth: 1, borderColor: C.BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarLetter: { color: C.BROWN, fontWeight: '700', fontSize: 15 },
  userInfo: { flex: 1 },
  userName: { color: C.TEXT, fontWeight: '600', fontSize: 14 },
  userHandle: { color: C.TEXT_MUTED, fontSize: 12, marginTop: 1 },
  chevron: { color: C.TEXT_MUTED, fontSize: 22 },

  userThumbStrip: { marginTop: 2 },
  userThumb: { width: THUMB, height: THUMB, borderRadius: 6, backgroundColor: C.BG_WARM },

  emptyWrap: { paddingTop: 48, alignItems: 'center' },
  emptyText: { color: C.TEXT_MUTED, fontSize: 14 },
})
