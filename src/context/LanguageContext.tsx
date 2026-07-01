import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

type Lang = 'ru' | 'en'

const strings = {
  ru: {
    appName: 'Antigram',
    loginSubtitle: '',
    registerSubtitle: 'Введите почту и придумайте пароль.\nПосле этого подтвердите адрес по ссылке.',
    emailPlaceholder: 'логин или email',
    passwordPlaceholder: 'Введите пароль',
    confirmPasswordPlaceholder: 'Введите пароль повторно',
    forgotPassword: 'Забыли пароль?',
    next: 'далее →',
    done: 'готово →',
    noAccount: 'У вас нет аккаунта?',
    register: 'Зарегистрируйтесь.',
    haveAccount: 'Уже есть аккаунт?',
    login: 'Войти.',
    browseFirst: 'Посмотреть приложение →',
    browseHint: 'Для публикаций потребуется регистрация',
    passwordMismatch: 'Пароли не совпадают. Попробуйте ещё раз.',
    fillAll: 'Заполните все поля',
    error: 'Ошибка',
    almostDone: 'Почти готово!',
    checkEmail: 'Проверьте почту — мы отправили письмо для подтверждения.',
    ok: 'OK',
    settingsHint: 'В настройках аккаунта вы можете изменить данные',
    terms: 'Нажимая «Готово», вы принимаете ',
    termsLink: 'пользовательское соглашение',
    and: ' и ',
    privacyLink: 'политику конфиденциальности',
    // Auth gate
    guestAction: 'Для этого действия нужна регистрация',
    guestActionHint: 'Зарегистрируйтесь — это займёт минуту',
    registerNow: 'Зарегистрироваться',
    later: 'Позже',
    // Tabs
    feed: 'Лента',
    search: 'Поиск',
    camera: 'Камера',
    reactions: 'Реакции',
    profile: 'Профиль',
    // Camera screen
    cameraPermissionTitle: 'Нужен доступ к камере',
    cameraPermissionText: 'ANTIGRAM использует камеру только для съёмки моментов',
    cameraPermissionBtn: 'Разрешить',
    retake: 'Переснять',
    publish: 'Опубликовать',
    publishing: 'Публикуем...',
    addCaption: 'Добавить подпись...',
    chooseMood: 'Атмосфера',
    publishError: 'Не удалось опубликовать',
    moodCalm: 'Спокойно',
    moodNostalgic: 'Ностальгия',
    moodWow: 'Вау',
    moodRelatable: 'Близко',
    moodWarm: 'Тепло',
  },
  en: {
    appName: 'Antigram',
    loginSubtitle: '',
    registerSubtitle: 'Enter your email and pick a password.\nThen confirm your address via the link.',
    emailPlaceholder: 'username or email',
    passwordPlaceholder: 'Enter password',
    confirmPasswordPlaceholder: 'Confirm password',
    forgotPassword: 'Forgot password?',
    next: 'next →',
    done: 'done →',
    noAccount: 'Don\'t have an account?',
    register: 'Sign up.',
    haveAccount: 'Already have an account?',
    login: 'Sign in.',
    browseFirst: 'Browse the app →',
    browseHint: 'Registration required to publish',
    passwordMismatch: 'Passwords don\'t match. Try again.',
    fillAll: 'Please fill in all fields',
    error: 'Error',
    almostDone: 'Almost there!',
    checkEmail: 'Check your email — we sent a confirmation link.',
    ok: 'OK',
    settingsHint: 'You can update your details in account settings',
    terms: 'By tapping "Done" you agree to the ',
    termsLink: 'terms of service',
    and: ' and ',
    privacyLink: 'privacy policy',
    // Auth gate
    guestAction: 'Registration required',
    guestActionHint: 'Sign up — it only takes a minute',
    registerNow: 'Sign up',
    later: 'Later',
    // Tabs
    feed: 'Feed',
    search: 'Search',
    camera: 'Camera',
    reactions: 'Reactions',
    profile: 'Profile',
    // Camera screen
    cameraPermissionTitle: 'Camera access needed',
    cameraPermissionText: 'ANTIGRAM uses the camera only to capture moments',
    cameraPermissionBtn: 'Allow',
    retake: 'Retake',
    publish: 'Publish',
    publishing: 'Publishing...',
    addCaption: 'Add a caption...',
    chooseMood: 'Atmosphere',
    publishError: 'Failed to publish',
    moodCalm: 'Calm',
    moodNostalgic: 'Nostalgic',
    moodWow: 'Wow',
    moodRelatable: 'Close',
    moodWarm: 'Warm',
  },
}

type Strings = typeof strings.ru
interface LanguageContextType {
  lang: Lang
  t: Strings
  toggleLang: () => void
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'ru',
  t: strings.ru,
  toggleLang: () => {},
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('ru')

  useEffect(() => {
    AsyncStorage.getItem('lang').then((saved) => {
      if (saved === 'ru' || saved === 'en') setLang(saved)
    })
  }, [])

  function toggleLang() {
    const next: Lang = lang === 'ru' ? 'en' : 'ru'
    setLang(next)
    AsyncStorage.setItem('lang', next)
  }

  return (
    <LanguageContext.Provider value={{ lang, t: strings[lang], toggleLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLang = () => useContext(LanguageContext)
