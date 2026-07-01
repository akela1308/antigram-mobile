import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { C } from '../theme'

const LAST_UPDATED = '1 июля 2025 г.'

const SECTIONS = [
  {
    title: 'Какие данные мы собираем',
    text: `• Аккаунт: адрес электронной почты (при регистрации через email) или идентификатор Telegram (при входе через бот).
• Профиль: имя, username, биография, ссылка на сайт, аватар — только то, что ты указываешь сам.
• Фотографии: изображения, которые ты публикуешь в ленте или добавляешь в альбомы.
• Действия в приложении: реакции на публикации, подписки, закладки, комментарии.
• Технические данные: уведомления (только по согласию), журнал ошибок для диагностики сбоев.`,
  },
  {
    title: 'Что мы не собираем',
    text: `• Геолокация: координаты устройства не собираются. EXIF-метаданные фотографий не читаются.
• Контакты, история звонков, SMS — не используются.
• Биометрические данные — не собираются.`,
  },
  {
    title: 'Для чего используются данные',
    text: `• Отображение публикаций в ленте и профиле.
• Персонализация: показ контента авторов, на которых ты подписан.
• Push-уведомления о реакциях и новых подписчиках (только при наличии согласия).
• Диагностика технических проблем и улучшение приложения.`,
  },
  {
    title: 'Хранение и безопасность',
    text: `Данные хранятся в облачной инфраструктуре Supabase (Европейский союз). Передача данных защищена протоколом TLS. Пароли хранятся в хэшированном виде; у сотрудников нет доступа к паролям в открытом виде.`,
  },
  {
    title: 'Твои права',
    text: `• Изменить или удалить данные профиля — в любой момент через Настройки.
• Удалить свои публикации — через меню фотографии.
• Запросить полное удаление аккаунта и всех связанных данных — напиши нам (контакт ниже).`,
  },
  {
    title: 'Передача данных третьим лицам',
    text: `Мы не продаём и не передаём твои персональные данные третьим лицам в коммерческих целях. Фотографии, опубликованные публично, доступны другим пользователям приложения.`,
  },
  {
    title: 'Дети',
    text: `ANTIGRAM не предназначен для детей младше 13 лет. Если вы узнали, что ребёнок зарегистрировал аккаунт без вашего согласия, пожалуйста, свяжитесь с нами для удаления данных.`,
  },
  {
    title: 'Изменения политики',
    text: `О существенных изменениях мы уведомим через уведомление в приложении. Дата последнего обновления указана вверху этой страницы.`,
  },
  {
    title: 'Контакт',
    text: `По вопросам конфиденциальности или для запроса удаления данных напиши нам:\nsupport@antigram.app`,
  },
]

export default function PrivacyPolicyScreen() {
  const navigation = useNavigation<any>()

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Политика конфиденциальности</Text>
        <View style={styles.topRight} />
      </View>

      <View style={styles.content}>
        <Text style={styles.updated}>Последнее обновление: {LAST_UPDATED}</Text>
        <Text style={styles.intro}>
          ANTIGRAM уважает твою конфиденциальность. Эта политика объясняет, какие данные мы собираем, как используем и как ты можешь ими управлять.
        </Text>

        {SECTIONS.map((s, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionText}>{s.text}</Text>
          </View>
        ))}

        <View style={{ height: 48 }} />
      </View>
    </ScrollView>
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
  topTitle: { color: C.TEXT, fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' },
  topRight: { width: 36 },

  content: { paddingHorizontal: 20, paddingTop: 16 },

  updated: {
    color: C.TEXT_MUTED, fontSize: 12, marginBottom: 12,
  },
  intro: {
    color: C.TEXT_SEC, fontSize: 14, lineHeight: 21, marginBottom: 20,
  },

  section: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.DIVIDER,
  },
  sectionTitle: {
    color: C.BROWN, fontSize: 13, fontWeight: '700',
    letterSpacing: 0.2, marginBottom: 8,
  },
  sectionText: {
    color: C.TEXT, fontSize: 14, lineHeight: 21,
  },
})
