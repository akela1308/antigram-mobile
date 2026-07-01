import * as Sentry from '@sentry/react-native'
import { useEffect, useState } from 'react'
import { Alert } from 'react-native'

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
})
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { Session } from '@supabase/supabase-js'
import { useFonts, JetBrainsMono_800ExtraBold } from '@expo-google-fonts/jetbrains-mono'
import { supabase } from './lib/supabase'
import { isUserAdmin, isUserBlocked } from './lib/db'
import { identify, reset, track, Events } from './lib/analytics'
import { registerPushToken, unregisterPushToken } from './lib/pushNotifications'
import TabNavigator from './src/navigation/TabNavigator'
import AuthNavigator from './src/navigation/AuthNavigator'
import { LanguageProvider } from './src/context/LanguageContext'
import { AppContext } from './src/context/AppContext'
import { PlayerProvider } from './src/context/PlayerContext'
import MiniPlayer from './src/components/MiniPlayer'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [isGuest, setIsGuest] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fontsLoaded] = useFonts({ JetBrainsMono_800ExtraBold })

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await handleSessionUser(session)
      }
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await handleSessionUser(session)
      } else {
        // Удаляем push-токен при логауте (если была сессия)
        const prevSession = await supabase.auth.getSession()
        if (prevSession.data.session?.user.id) {
          unregisterPushToken(prevSession.data.session.user.id)
        }
        setIsAdmin(false)
        reset()
      }
      setSession(session)
      if (session) setIsGuest(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSessionUser(session: Session) {
    const userId = session.user.id

    try {
      const blocked = await isUserBlocked(userId)
      if (blocked) {
        await supabase.auth.signOut()
        Alert.alert(
          'Аккаунт заблокирован',
          'Твой аккаунт заблокирован. Если ты считаешь, что это ошибка — напиши нам.',
        )
        return
      }

      const admin = await isUserAdmin(userId)
      setIsAdmin(admin)

      identify(userId, { is_admin: admin })
      track(Events.APP_OPENED)

      registerPushToken(userId)
    } catch (error) {
      Sentry.captureException(error)
    }
  }

  if (loading || !fontsLoaded) return null

  const showApp = !!session || isGuest

  return (
    <LanguageProvider>
      <AppContext.Provider value={{ isGuest, isLoggedIn: !!session, isAdmin, exitGuestMode: () => setIsGuest(false) }}>
        <PlayerProvider>
          <NavigationContainer>
            <StatusBar style="light" />
            {showApp
              ? <TabNavigator />
              : <AuthNavigator onGuest={() => setIsGuest(true)} />
            }
          </NavigationContainer>
          {/* MiniPlayer плавает над таббаром, только для авторизованных */}
          {showApp && <MiniPlayer />}
        </PlayerProvider>
      </AppContext.Provider>
    </LanguageProvider>
  )
}
