import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity,
  Dimensions, ActivityIndicator, Alert, Modal, TextInput,
} from 'react-native'
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import {
  getAlbumMoments, getUserMoments,
  addMomentToAlbum, removeMomentFromAlbum,
  deleteAlbum, updateAlbumTitle,
} from '../../lib/db'
import type { Moment } from '../../lib/database.types'
import { C } from '../theme'

const W = Dimensions.get('window').width
const COLS = 3
const GAP = 2
const TILE = (W - GAP * (COLS - 1)) / COLS

export default function AlbumDetailScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { albumId, albumTitle: initialTitle, userId } = route.params as {
    albumId: string; albumTitle: string; userId: string
  }

  const [moments, setMoments] = useState<Moment[]>([])
  const [allMoments, setAllMoments] = useState<Moment[]>([])
  const [loading, setLoading] = useState(true)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [editVisible, setEditVisible] = useState(false)
  const [title, setTitle] = useState(initialTitle)
  const [editTitle, setEditTitle] = useState(initialTitle)

  useFocusEffect(
    useCallback(() => { load() }, [albumId])
  )

  async function load() {
    setLoading(true)
    const [albumMoms, userMoms] = await Promise.all([
      getAlbumMoments(albumId), getUserMoments(userId),
    ])
    setMoments(albumMoms)
    setAllMoments(userMoms)
    setLoading(false)
  }

  async function handleAddMoment(moment: Moment) {
    if (moments.some(m => m.id === moment.id)) return
    await addMomentToAlbum(albumId, moment.id)
    setMoments(prev => [moment, ...prev])
    setPickerVisible(false)
  }

  function handleTapMoment(moment: Moment) {
    Alert.alert('', '', [
      {
        text: 'Убрать из альбома', style: 'destructive',
        onPress: async () => {
          await removeMomentFromAlbum(albumId, moment.id)
          setMoments(prev => prev.filter(m => m.id !== moment.id))
        },
      },
      { text: 'Отмена', style: 'cancel' },
    ])
  }

  function openMenu() {
    Alert.alert('', '', [
      {
        text: 'Переименовать',
        onPress: () => { setEditTitle(title); setEditVisible(true) },
      },
      {
        text: 'Удалить альбом', style: 'destructive',
        onPress: () =>
          Alert.alert('Удалить альбом?', 'Фотографии останутся в плёнке', [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Удалить', style: 'destructive',
              onPress: async () => { await deleteAlbum(albumId); navigation.goBack() },
            },
          ]),
      },
      { text: 'Отмена', style: 'cancel' },
    ])
  }

  async function handleSaveTitle() {
    if (!editTitle.trim()) return
    await updateAlbumTitle(albumId, editTitle)
    setTitle(editTitle)
    setEditVisible(false)
  }

  const momentIdsInAlbum = new Set(moments.map(m => m.id))
  const availableToAdd = allMoments.filter(m => !momentIdsInAlbum.has(m.id))

  return (
    <>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
          <TouchableOpacity
            onPress={openMenu}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.menuIcon}>⋮</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={C.AMBER} />
          </View>
        ) : (
          <FlatList
            data={moments}
            keyExtractor={item => item.id}
            numColumns={COLS}
            columnWrapperStyle={{ gap: GAP, marginBottom: GAP }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>🎞</Text>
                <Text style={styles.emptyText}>Альбом пуст</Text>
                <Text style={styles.emptyHint}>Нажми + чтобы добавить фото</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => handleTapMoment(item)}>
                <Image source={{ uri: item.photo_url }} style={styles.tile} />
              </TouchableOpacity>
            )}
          />
        )}

        <TouchableOpacity style={styles.fab} onPress={() => setPickerVisible(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Picker Modal */}
      <Modal
        visible={pickerVisible} animationType="slide"
        transparent onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Добавить в альбом</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {availableToAdd.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>Все фото уже в альбоме</Text>
              </View>
            ) : (
              <FlatList
                data={availableToAdd}
                keyExtractor={item => item.id}
                numColumns={3}
                columnWrapperStyle={{ gap: 2 }}
                contentContainerStyle={{ gap: 2, paddingBottom: 32 }}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => handleAddMoment(item)}>
                    <Image source={{ uri: item.photo_url }} style={styles.pickerTile} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Edit title Modal */}
      <Modal
        visible={editVisible} animationType="fade"
        transparent onRequestClose={() => setEditVisible(false)}
      >
        <View style={styles.editOverlay}>
          <View style={styles.editSheet}>
            <Text style={styles.editTitleText}>Переименовать альбом</Text>
            <TextInput
              style={[styles.editInput, { color: C.TEXT }]}
              value={editTitle}
              onChangeText={setEditTitle}
              autoFocus maxLength={60}
              placeholderTextColor={C.TEXT_PH}
            />
            <View style={styles.editBtns}>
              <TouchableOpacity style={styles.editCancel} onPress={() => setEditVisible(false)}>
                <Text style={styles.editCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editSave} onPress={handleSaveTitle}>
                <Text style={styles.editSaveText}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

const PICKER_TILE_SIZE = (W - 4) / 3

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  backIcon: { color: C.BROWN, fontSize: 22 },
  topTitle: {
    color: C.TEXT, fontSize: 16, fontWeight: '700',
    flex: 1, textAlign: 'center', marginHorizontal: 12,
  },
  menuIcon: { color: C.TEXT_SEC, fontSize: 24 },

  tile: { width: TILE, height: TILE, backgroundColor: C.BG_WARM },

  emptyWrap: { paddingTop: 80, alignItems: 'center', gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: C.TEXT_MUTED, fontSize: 15 },
  emptyHint: { color: C.TEXT_MUTED, fontSize: 13, opacity: 0.6 },

  fab: {
    position: 'absolute', bottom: 32, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.BROWN,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: C.BROWN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  fabText: { color: C.WHITE, fontSize: 28, fontWeight: '700', lineHeight: 32 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.BG,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '85%', paddingTop: 8,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  modalTitle: { color: C.TEXT, fontSize: 16, fontWeight: '700' },
  modalClose: { color: C.TEXT_MUTED, fontSize: 20 },
  pickerTile: { width: PICKER_TILE_SIZE, height: PICKER_TILE_SIZE },

  editOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', paddingHorizontal: 24,
  },
  editSheet: { backgroundColor: C.BG_WARM, borderRadius: 16, padding: 20 },
  editTitleText: { color: C.TEXT, fontSize: 16, fontWeight: '700', marginBottom: 16 },
  editInput: {
    backgroundColor: C.BG, borderRadius: 10,
    borderWidth: 1, borderColor: C.BORDER,
    padding: 12, fontSize: 15, marginBottom: 16,
  },
  editBtns: { flexDirection: 'row', gap: 10 },
  editCancel: {
    flex: 1, borderWidth: 1, borderColor: C.BORDER,
    borderRadius: 20, paddingVertical: 12, alignItems: 'center',
  },
  editCancelText: { color: C.TEXT_SEC, fontWeight: '600' },
  editSave: {
    flex: 1, backgroundColor: C.BROWN,
    borderRadius: 20, paddingVertical: 12, alignItems: 'center',
  },
  editSaveText: { color: C.WHITE, fontWeight: '700' },
})
