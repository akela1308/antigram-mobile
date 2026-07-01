import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { supabase } from '../../../lib/supabase'
import { useLang } from '../../context/LanguageContext'
import { C } from '../../theme'

export default function RegisterScreen({ navigation }: any) {
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [passwordError, setPasswordError] = useState(false)

  async function handleRegister() {
    if (!email || !password || !confirmPassword) { Alert.alert(t.fillAll); return }
    if (password !== confirmPassword) { setPasswordError(true); return }
    setPasswordError(false)
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) {
      Alert.alert(t.error, error.message)
    } else {
      Alert.alert(t.almostDone, t.checkEmail, [{ text: t.ok, onPress: () => navigation.navigate('Login') }])
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>{t.appName}</Text>
        <Text style={styles.subtitle}>{t.registerSubtitle}</Text>

        <TextInput
          style={styles.input}
          placeholder={t.emailPlaceholder}
          placeholderTextColor={C.TEXT_PH}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder={t.passwordPlaceholder}
            placeholderTextColor={C.TEXT_PH}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Text style={styles.eyeText}>{showPassword ? '👁' : '🙈'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, { flex: 1 }, passwordError && styles.inputError]}
            placeholder={t.confirmPasswordPlaceholder}
            placeholderTextColor={C.TEXT_PH}
            value={confirmPassword}
            onChangeText={(v) => { setConfirmPassword(v); setPasswordError(false) }}
            secureTextEntry={!showConfirm}
          />
          <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
            <Text style={styles.eyeText}>{showConfirm ? '👁' : '🙈'}</Text>
          </TouchableOpacity>
        </View>

        {passwordError && <Text style={styles.errorText}>{t.passwordMismatch}</Text>}

        <TouchableOpacity
          style={[styles.btn, loading && { opacity: 0.5 }]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={C.WHITE} />
            : <Text style={styles.btnText}>{t.done}</Text>
          }
        </TouchableOpacity>

        <Text style={styles.hint}>{t.settingsHint}</Text>
        <Text style={styles.terms}>
          {t.terms}
          <Text style={styles.termsLink}>{t.termsLink}</Text>
          {t.and}
          <Text style={styles.termsLink}>{t.privacyLink}</Text>
        </Text>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.switchText}>
            {t.haveAccount}{' '}
            <Text style={styles.switchLink}>{t.login}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },
  inner: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingVertical: 60,
    justifyContent: 'center',
    gap: 14,
  },
  logo: {
    fontSize: 38, fontWeight: '800', color: C.BROWN,
    textAlign: 'center', marginBottom: 4, letterSpacing: -0.5,
  },
  subtitle: { color: C.TEXT_SEC, textAlign: 'center', fontSize: 13, lineHeight: 19, marginBottom: 4 },
  input: {
    backgroundColor: C.WHITE, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    color: C.TEXT, fontSize: 15,
    borderWidth: 1, borderColor: C.BORDER,
  },
  inputError: { borderColor: C.ERROR },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeText: { fontSize: 18 },
  errorText: { color: C.ERROR, fontSize: 12, marginTop: -6 },
  btn: {
    backgroundColor: C.BROWN, borderRadius: 30,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  btnText: { color: C.WHITE, fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  hint: { color: C.TEXT_MUTED, textAlign: 'center', fontSize: 12 },
  terms: { color: C.TEXT_MUTED, textAlign: 'center', fontSize: 11, lineHeight: 18 },
  termsLink: { color: C.BROWN_MID, textDecorationLine: 'underline' },
  switchText: { color: C.TEXT_MUTED, textAlign: 'center', fontSize: 13 },
  switchLink: { color: C.BROWN_MID, fontWeight: '600' },
})
