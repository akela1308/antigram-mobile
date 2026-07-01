import { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { updateProfile } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../lib/database.types'
import { C } from '../theme'
import { useLang } from '../context/LanguageContext'

export default function EditProfileScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { userId, profile: initial, email } = route.params as {
    userId: string; profile: Profile | null; email: string | null
  }

  const { lang, toggleLang } = useLang()

  const [displayName, setDisplayName] = useState(initial?.display_name ?? '')
  const [username, setUsername]       = useState(initial?.username ?? '')
  const [website, setWebsite]         = useState(initial?.website ?? '')
  const [bio, setBio]                 = useState(initial?.bio ?? '')
  const [saving, setSaving]           = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await updateProfile(userId, {
        display_name: displayName.trim() || null,
        username:     username.trim() || null,
        bio:          bio.trim() || null,
        website:      website.trim() || null,
      })
      if (error) { Alert.alert('Ошибка', 'Не удалось сохранить изменения'); return }
      navigation.goBack()
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    if (!email) { Alert.alert('Ошибка', 'Email не найден'); return }
    Alert.alert(
      'Сменить пароль',
      `Отправить письмо со ссылкой для смены пароля на ${email}?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отправить',
          onPress: async () => {
            const { error } = await supabase.auth.resetPasswordForEmail(email)
            if (error) Alert.alert('Ошибка', 'Не удалось отправить письмо')
            else Alert.alert('Готово', 'Письмо отправлено — проверь почту')
          },
        },
      ]
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>Настройки</Text>
          <View style={styles.topRight} />
        </View>

        {/* Профиль */}
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Профиль</Text>

          <Text style={styles.label}>Имя</Text>
          <TextInput
            style={styles.input}
            placeholder="Как тебя зовут"
            placeholderTextColor={C.TEXT_PH}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={40}
          />

          <Text style={styles.label}>Имя пользователя</Text>
          <TextInput
            style={styles.input}
            placeholder="username"
            placeholderTextColor={C.TEXT_PH}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
          />

          <Text style={styles.label}>Вебсайт</Text>
          <TextInput
            style={styles.input}
            placeholder="https://"
            placeholderTextColor={C.TEXT_PH}
            value={website}
            onChangeText={setWebsite}
            autoCapitalize="none"
            keyboardType="url"
            maxLength={100}
          />

          <Text style={styles.label}>Инфо</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="О себе..."
            placeholderTextColor={C.TEXT_PH}
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={150}
            textAlignVertical="top"
          />
        </View>

        {/* Приватная информация */}
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Приватная информация</Text>

          <Text style={styles.label}>Имейл</Text>
          <View style={[styles.input, styles.readOnly]}>
            <Text style={styles.readOnlyText}>{email ?? '—'}</Text>
          </View>

          <TouchableOpacity onPress={handleChangePassword}>
            <Text style={styles.brownLink}>Сменить пароль</Text>
          </TouchableOpacity>
        </View>

        {/* Язык */}
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Язык / Language</Text>
          <View style={styles.langRow}>
            <TouchableOpacity
              style={[styles.langBtn, lang === 'ru' && styles.langBtnActive]}
              onPress={() => lang !== 'ru' && toggleLang()}
            >
              <Text style={[styles.langBtnText, lang === 'ru' && styles.langBtnTextActive]}>
                🇷🇺  Русский
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langBtn, lang === 'en' && styles.langBtnActive]}
              onPress={() => lang !== 'en' && toggleLang()}
            >
              <Text style={[styles.langBtnText, lang === 'en' && styles.langBtnTextActive]}>
                🇬🇧  English
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Кнопки */}
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => navigation.goBack()}
            disabled={saving}
          >
            <Text style={styles.cancelText}>Отменить</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={C.WHITE} size="small" />
              : <Text style={styles.saveText}>Сохранить</Text>}
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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

  form: { paddingHorizontal: 20, paddingTop: 4 },

  sectionTitle: {
    color: C.TEXT, fontSize: 14, fontWeight: '700',
    marginTop: 20, marginBottom: 12,
    paddingTop: 16, borderTopWidth: 1, borderTopColor: C.DIVIDER,
  },

  label: {
    color: C.TEXT_MUTED, fontSize: 11, letterSpacing: 1.2,
    textTransform: 'uppercase', marginBottom: 6, marginTop: 4,
  },
  input: {
    backgroundColor: C.BG_WARM, borderRadius: 10,
    borderWidth: 1, borderColor: C.BORDER,
    padding: 12, color: C.TEXT, fontSize: 15, marginBottom: 14,
  },
  inputMulti: { minHeight: 80 },
  readOnly: { justifyContent: 'center' },
  readOnlyText: { color: C.TEXT_MUTED, fontSize: 15 },

  brownLink: {
    color: C.BROWN_MID, fontSize: 14, fontWeight: '600',
    marginTop: 4, marginBottom: 8,
  },

  // Переключатель языка
  langRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  langBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: C.BG_WARM,
    borderWidth: 1.5,
    borderColor: C.BORDER,
  },
  langBtnActive: {
    backgroundColor: C.BROWN,
    borderColor: C.BROWN,
  },
  langBtnText: {
    color: C.BROWN,
    fontSize: 14,
    fontWeight: '600',
  },
  langBtnTextActive: {
    color: C.WHITE,
  },

  btnRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: C.BORDER,
    borderRadius: 20, paddingVertical: 13, alignItems: 'center',
  },
  cancelText: { color: C.TEXT_SEC, fontWeight: '600', fontSize: 14 },
  saveBtn: {
    flex: 1, backgroundColor: C.BROWN,
    borderRadius: 20, paddingVertical: 13, alignItems: 'center',
  },
  saveText: { color: C.WHITE, fontWeight: '700', fontSize: 14 },
})
