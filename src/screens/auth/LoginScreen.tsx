import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, Image,
} from 'react-native'
import { supabase } from '../../../lib/supabase'
import { useLang } from '../../context/LanguageContext'
import { C } from '../../theme'

// Film strip component
function FilmStrip() {
  return (
    <View style={fs.wrap}>
      <View style={fs.topPerf}>
        {Array.from({ length: 18 }).map((_, i) => (
          <View key={i} style={fs.hole} />
        ))}
      </View>
      <View style={fs.frames}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={fs.frame} />
        ))}
      </View>
      <View style={fs.botPerf}>
        {Array.from({ length: 18 }).map((_, i) => (
          <View key={i} style={fs.hole} />
        ))}
      </View>
    </View>
  )
}

const fs = StyleSheet.create({
  wrap: { width: '100%', backgroundColor: C.AMBER, paddingVertical: 4 },
  topPerf: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 3 },
  botPerf: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 3 },
  hole: {
    width: 10, height: 8, borderRadius: 2,
    backgroundColor: C.WHITE, opacity: 0.7,
  },
  frames: {
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 6,
    height: 60,
  },
  frame: {
    flex: 1,
    backgroundColor: C.WHITE,
    borderRadius: 3,
    opacity: 0.3,
  },
})

interface Props {
  navigation: any
  onGuest: () => void
}

export default function LoginScreen({ navigation, onGuest }: Props) {
  const { t, lang, toggleLang } = useLang()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) { Alert.alert(t.fillAll); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) Alert.alert(t.error, error.message)
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Lang switcher */}
      <TouchableOpacity style={styles.langBtn} onPress={toggleLang}>
        <Text style={styles.langText}>{lang === 'ru' ? 'EN' : 'RU'}</Text>
      </TouchableOpacity>

      {/* Film strip */}
      <FilmStrip />

      <View style={styles.inner}>
        <Text style={styles.logo}>{t.appName}</Text>
        {t.loginSubtitle ? <Text style={styles.subtitle}>{t.loginSubtitle}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="username"
          placeholderTextColor={C.TEXT_PH}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="password"
            placeholderTextColor={C.TEXT_PH}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Text style={styles.eyeText}>{showPassword ? '👁' : '🙈'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          After entering your username and password, you will receive a confirmation number by email
        </Text>

        <TouchableOpacity
          style={[styles.btn, loading && { opacity: 0.5 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={C.WHITE} />
            : <Text style={styles.btnArrow}>›</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.switchText}>
            {t.noAccount}{' '}
            <Text style={styles.switchLink}>{t.register}</Text>
          </Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity onPress={onGuest}>
          <Text style={styles.guestBtn}>{t.browseFirst}</Text>
        </TouchableOpacity>
        <Text style={styles.guestHint}>{t.browseHint}</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },

  langBtn: {
    position: 'absolute',
    top: 56, right: 20,
    zIndex: 10,
    backgroundColor: C.BG_WARM,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  langText: { color: C.BROWN, fontSize: 12, fontWeight: '600', letterSpacing: 1 },

  inner: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
    gap: 14,
    paddingTop: 8,
  },
  logo: {
    fontSize: 38,
    fontWeight: '800',
    color: C.BROWN,
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: C.TEXT_SEC,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  input: {
    backgroundColor: C.WHITE,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.TEXT,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeText: { fontSize: 18 },
  hint: {
    color: C.TEXT_SEC,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  btn: {
    width: 56, height: 56,
    borderRadius: 28,
    backgroundColor: C.BROWN,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 4,
  },
  btnArrow: { color: C.WHITE, fontSize: 28, fontWeight: '300', marginTop: -2 },

  switchText: { color: C.TEXT_MUTED, textAlign: 'center', fontSize: 13 },
  switchLink: { color: C.BROWN_MID, fontWeight: '600' },

  divider: { height: 1, backgroundColor: C.DIVIDER, marginVertical: 4 },
  guestBtn: {
    color: C.TEXT_MUTED,
    textAlign: 'center',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  guestHint: { color: C.TEXT_MUTED, textAlign: 'center', fontSize: 11, marginTop: -6 },
})
