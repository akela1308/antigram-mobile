import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { createAlbum } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { C } from '../theme'

export default function CreateAlbumScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()

  // userId может прийти из route.params (если открыли из ProfileScreen)
  // или мы получаем его из сессии (если открыли из FAB)
  const [userId, setUserId] = useState<string | null>(
    (route.params as any)?.userId ?? null
  )

  useEffect(() => {
    if (!userId) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) setUserId(user.id)
      })
    }
  }, [])

  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!userId) { Alert.alert('Ошибка', 'Не удалось определить пользователя'); return }
    if (!title.trim()) { Alert.alert('Введи название альбома'); return }
    setSaving(true)
    const { data, error } = await createAlbum(userId, title)
    setSaving(false)
    if (error || !data) {
      Alert.alert('Ошибка', error?.message ?? 'Не удалось создать альбом')
      return
    }
    navigation.goBack()
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Новый альбом</Text>
        <View style={styles.topRight} />
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>Название</Text>
        <TextInput
          style={styles.input}
          placeholder="Введи название..."
          placeholderTextColor={C.TEXT_PH}
          value={title}
          onChangeText={setTitle}
          maxLength={60}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />
        <Text style={styles.hint}>
          Альбом можно наполнить фотографиями после создания
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.createBtn, (!title.trim() || saving) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!title.trim() || saving}
        >
          {saving
            ? <ActivityIndicator color={C.WHITE} size="small" />
            : <Text style={styles.createBtnText}>Создать альбом</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  backBtn: { width: 36 },
  backIcon: { color: C.BROWN, fontSize: 20 },
  topTitle: { color: C.TEXT, fontSize: 16, fontWeight: '700' },
  topRight: { width: 36 },

  body: { flex: 1, padding: 20 },
  label: {
    color: C.TEXT_MUTED, fontSize: 11, letterSpacing: 1.2,
    textTransform: 'uppercase', marginBottom: 8,
  },
  input: {
    backgroundColor: C.BG_WARM, borderRadius: 12,
    borderWidth: 1, borderColor: C.BORDER,
    padding: 14, color: C.TEXT, fontSize: 16, marginBottom: 12,
  },
  hint: { color: C.TEXT_MUTED, fontSize: 13, lineHeight: 18 },

  footer: { padding: 20, paddingBottom: 40 },
  createBtn: {
    backgroundColor: C.BROWN, borderRadius: 32,
    paddingVertical: 16, alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: C.WHITE, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
})
