import { Alert } from 'react-native'
import { useAppContext } from '../context/AppContext'
import { useLang } from '../context/LanguageContext'

// Используй эту функцию перед любым действием, которое требует авторизации.
// Возвращает true если можно продолжать, false если гость.
export function useAuthGate(onRegister?: () => void) {
  const { isGuest } = useAppContext()
  const { t } = useLang()

  function checkAuth(): boolean {
    if (!isGuest) return true
    Alert.alert(
      t.guestAction,
      t.guestActionHint,
      [
        { text: t.later, style: 'cancel' },
        { text: t.registerNow, onPress: onRegister },
      ]
    )
    return false
  }

  return { checkAuth, isGuest }
}
