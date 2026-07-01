import { useState, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image,
  Dimensions, FlatList, Modal,
} from 'react-native'
import { CameraView, CameraType, FlashMode, useCameraPermissions } from 'expo-camera'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { useLang } from '../context/LanguageContext'
import { useAppContext } from '../context/AppContext'
import { addReaction, uploadMomentPhoto, createMoment } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import type { ReactionType } from '../../lib/database.types'
import { FILM_PRESETS, FilmPreset } from '../constants/filmPresets'
import FilmStrip from '../components/FilmStrip'
import { C } from '../theme'
import { processPhoto, FlareType } from '../lib/photoProcessor'

// Minimal no-op preset used when no film is selected but a flare is active
const NO_PRESET_BASE: FilmPreset = {
  id: 'none', name: '∅',
  grain: { intensity: 0, size: 1, shape: 'round', r: 1, g: 1, b: 1 },
}

const FLARE_LABELS: Record<FlareType, string> = {
  none: '∅', leak_warm: '🔥', leak_cool: '❄️', edge_burn: '◎', streak: '—',
}
const FLARE_OPTIONS: FlareType[] = ['none', 'leak_warm', 'leak_cool', 'edge_burn', 'streak']

const MOODS: { key: ReactionType; emoji: string; labelKey: 'moodCalm' | 'moodNostalgic' | 'moodWarm' | 'moodWow' | 'moodRelatable' }[] = [
  { key: 'calm',      emoji: '🌿', labelKey: 'moodCalm' },
  { key: 'nostalgic', emoji: '🌅', labelKey: 'moodNostalgic' },
  { key: 'wow',       emoji: '✨', labelKey: 'moodWow' },
  { key: 'relatable', emoji: '🤍', labelKey: 'moodRelatable' },
  { key: 'warm',      emoji: '🔥', labelKey: 'moodWarm' },
]

const { width: SW } = Dimensions.get('window')
const VIEWFINDER = SW - 32
const STRIP_SIZE = 52

type CameraRouteParams = {
  CameraCapture: { preset: FilmPreset | null }
}

export default function CameraScreen() {
  const { t } = useLang()
  const { isGuest, exitGuestMode } = useAppContext()
  const navigation = useNavigation<any>()
  const route = useRoute<RouteProp<CameraRouteParams, 'CameraCapture'>>()

  const initialPreset = route.params?.preset ?? null
  const [selectedPreset, setSelectedPreset] = useState<FilmPreset | null>(initialPreset)
  const [selectedFlare, setSelectedFlare]   = useState<FlareType>('none')

  const [permission, requestPermission] = useCameraPermissions()
  const [facing, setFacing]   = useState<CameraType>('back')
  const [flash, setFlash]     = useState<FlashMode>('off')
  const [zoom, setZoom]       = useState(0)
  const [zoomDragY, setZoomDragY] = useState<number | null>(null)

  const [processing, setProcessing] = useState(false)
  const [photoUri, setPhotoUri]     = useState<string | null>(null)
  const [caption, setCaption]           = useState('')
  const [mood, setMood]                 = useState<ReactionType | null>(null)
  const [publishing, setPublishing]     = useState(false)
  const [published, setPublished]       = useState(false)

  // Кастомная эмоция
  const [customMoodEmoji, setCustomMoodEmoji] = useState('')
  const [customMoodLabel, setCustomMoodLabel] = useState('')
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [draftEmoji, setDraftEmoji]           = useState('')
  const [draftLabel, setDraftLabel]           = useState('')

  const cameraRef   = useRef<CameraView>(null)
  const filmStripRef = useRef<FlatList>(null)

  // ── ГОСТЬ ─────────────────────────────────────────────────────────────────
  if (isGuest) {
    return (
      <View style={styles.centered}>
        <Text style={styles.lockEmoji}>📷</Text>
        <Text style={styles.lockTitle}>{t.guestAction}</Text>
        <Text style={styles.lockHint}>{t.guestActionHint}</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={exitGuestMode}>
          <Text style={styles.permissionBtnText}>{t.registerNow}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── РАЗРЕШЕНИЕ КАМЕРЫ ──────────────────────────────────────────────────────
  if (!permission) return <View style={styles.root} />

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.lockEmoji}>📷</Text>
        <Text style={styles.lockTitle}>{t.cameraPermissionTitle}</Text>
        <Text style={styles.lockHint}>{t.cameraPermissionText}</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>{t.cameraPermissionBtn}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── СЪЁМКА ────────────────────────────────────────────────────────────────
  async function takePicture() {
    if (!cameraRef.current) return
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 })
    if (!photo) return

    const needsProcessing = selectedPreset !== null || selectedFlare !== 'none'
    if (!needsProcessing) {
      setPhotoUri(photo.uri)
      return
    }

    setProcessing(true)
    try {
      const preset = selectedPreset ?? NO_PRESET_BASE
      const uri = await processPhoto(photo.uri, preset, selectedFlare)
      setPhotoUri(uri)
    } catch {
      setPhotoUri(photo.uri)  // fallback to raw on error
    } finally {
      setProcessing(false)
    }
  }

  // ── ПУБЛИКАЦИЯ ────────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!photoUri) return
    const selectedReaction: ReactionType | null = customMoodEmoji && customMoodLabel ? 'custom' : mood
    if (!selectedReaction) {
      Alert.alert(t.chooseMood, 'Выбери атмосферу кадра перед публикацией')
      return
    }
    setPublishing(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setPublishing(false); return }
    const photoUrl = await uploadMomentPhoto(user.id, photoUri)
    if (!photoUrl) {
      Alert.alert(t.error, t.publishError)
      setPublishing(false)
      return
    }
    const { data: createdMoment, error } = await createMoment({
      userId: user.id,
      photoUrl,
      caption: caption.trim() || undefined,
      mood: mood ?? undefined,
      customMoodEmoji: customMoodEmoji || undefined,
      customMoodLabel: customMoodLabel || undefined,
    })
    setPublishing(false)
    if (error) {
      Alert.alert(t.error, t.publishError)
    } else {
      if (createdMoment?.id) {
        await addReaction(createdMoment.id, user.id, selectedReaction)
      }
      setPublished(true)
      setTimeout(() => {
        setPublished(false)
        setPhotoUri(null)
        setCaption('')
        setMood(null)
        navigation.navigate('FilmSelect' as never)
      }, 1800)
    }
  }

  // ── Слайдер зума ──────────────────────────────────────────────────────────
  function onZoomStart(y: number) { setZoomDragY(y) }
  function onZoomMove(y: number) {
    if (zoomDragY === null) return
    const delta = (zoomDragY - y) / 200
    setZoom(prev => Math.max(0, Math.min(1, prev + delta)))
    setZoomDragY(y)
  }
  function onZoomEnd() { setZoomDragY(null) }

  // ── ОБРАБОТКА ────────────────────────────────────────────────────────────
  if (processing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.AMBER} size="large" />
        <Text style={styles.processingText}>Применяем плёнку…</Text>
      </View>
    )
  }

  // ── УСПЕШНАЯ ПУБЛИКАЦИЯ ────────────────────────────────────────────────────
  if (published) {
    return (
      <View style={styles.successScreen}>
        <Text style={styles.successEmoji}>🎞</Text>
        <Text style={styles.successTitle}>Опубликовано!</Text>
        <Text style={styles.successHint}>Момент появится в ленте</Text>
      </View>
    )
  }

  // ── ПРЕВЬЮ ПОСЛЕ СЪЁМКИ ──────────────────────────────────────────────────
  if (photoUri) {
    return (
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.previewScroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Плёночная шапка */}
          <FilmStrip decorative style={styles.previewFilmStrip} />

          <Image source={{ uri: photoUri }} style={styles.preview} />

          {selectedPreset && (
            <View style={styles.presetBadge}>
              {selectedPreset.thumb ? (
                <Image source={selectedPreset.thumb} style={styles.presetThumb} />
              ) : (
                <View style={[styles.presetThumb, styles.presetThumbAlgo]} />
              )}
              <Text style={styles.presetName}>{selectedPreset.name}</Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>{t.chooseMood}</Text>
          <View style={styles.moodRow}>
            {MOODS.map(({ key, emoji, labelKey }) => {
              const active = mood === key
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.moodChip, active && styles.moodChipActive]}
                  onPress={() => {
                    setCustomMoodEmoji('')
                    setCustomMoodLabel('')
                    setMood(active ? null : key)
                  }}
                >
                  <Text style={styles.moodEmoji}>{emoji}</Text>
                  <Text style={[styles.moodText, active && styles.moodTextActive]}>
                    {t[labelKey] as string}
                  </Text>
                </TouchableOpacity>
              )
            })}

            {/* Кастомная эмоция — показываем если создана */}
            {customMoodEmoji && customMoodLabel ? (
              <TouchableOpacity
                style={[styles.moodChip, styles.moodChipActive, styles.moodChipCustom]}
                onPress={() => { setCustomMoodEmoji(''); setCustomMoodLabel('') }}
              >
                <Text style={styles.moodEmoji}>{customMoodEmoji}</Text>
                <Text style={[styles.moodText, styles.moodTextActive]}>{customMoodLabel}</Text>
                <Text style={styles.moodChipRemove}>✕</Text>
              </TouchableOpacity>
            ) : null}

            {/* Кнопка "+" */}
            <TouchableOpacity
              style={styles.moodChipPlus}
              onPress={() => {
                setDraftEmoji(customMoodEmoji)
                setDraftLabel(customMoodLabel)
                setShowCustomModal(true)
              }}
            >
              <Text style={styles.moodChipPlusText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Модальное окно создания кастомной эмоции */}
          <Modal
            visible={showCustomModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowCustomModal(false)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowCustomModal(false)}
            >
              <TouchableOpacity
                style={styles.modalSheet}
                activeOpacity={1}
                onPress={() => {}}
              >
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Своя эмоция</Text>
                <Text style={styles.modalHint}>Выбери эмоджи и назови её</Text>

                <View style={styles.modalInputRow}>
                  <TextInput
                    style={styles.emojiInput}
                    value={draftEmoji}
                    onChangeText={v => setDraftEmoji(v.slice(-2))}
                    placeholder="😤"
                    placeholderTextColor="#444"
                    maxLength={2}
                    autoFocus={false}
                  />
                  <TextInput
                    style={styles.labelInput}
                    value={draftLabel}
                    onChangeText={setDraftLabel}
                    placeholder="Нежно, Дерзко..."
                    placeholderTextColor="#444"
                    maxLength={24}
                    returnKeyType="done"
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.modalConfirmBtn,
                    (!draftEmoji || !draftLabel.trim()) && styles.modalConfirmBtnDisabled,
                  ]}
                  disabled={!draftEmoji || !draftLabel.trim()}
                  onPress={() => {
                    setMood(null)
                    setCustomMoodEmoji(draftEmoji)
                    setCustomMoodLabel(draftLabel.trim())
                    setShowCustomModal(false)
                  }}
                >
                  <Text style={styles.modalConfirmText}>Добавить</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

          <TextInput
            style={styles.captionInput}
            placeholder={t.addCaption}
            placeholderTextColor="#555"
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={300}
          />

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.retakeBtn}
              onPress={() => setPhotoUri(null)}
              disabled={publishing}
            >
              <Text style={styles.retakeText}>{t.retake}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.publishBtn, publishing && styles.publishBtnDisabled]}
              onPress={handlePublish}
              disabled={publishing}
            >
              {publishing
                ? <ActivityIndicator color={C.WHITE} size="small" />
                : <Text style={styles.publishText}>{t.publish}</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  // ── ЖИВОЙ ВИДОИСКАТЕЛЬ ────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* Верхняя панель */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.topBtn}>
          <Text style={styles.topBtnText}>✕</Text>
        </TouchableOpacity>

        <View style={styles.topRight}>
          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')}
          >
            <Text style={[styles.topBtnText, flash === 'on' && styles.topBtnFlashActive]}>
              {flash === 'on' ? '⚡' : '🌑'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
          >
            <Text style={styles.topBtnText}>⇄</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Видоискатель + слайдер зума */}
      <View style={styles.viewfinderArea}>
        {/* Слайдер зума */}
        <View style={styles.zoomCol}>
          <Text style={styles.zoomLabel}>+</Text>
          <View
            style={styles.zoomTrack}
            onStartShouldSetResponder={() => true}
            onResponderGrant={e => onZoomStart(e.nativeEvent.pageY)}
            onResponderMove={e => onZoomMove(e.nativeEvent.pageY)}
            onResponderRelease={onZoomEnd}
          >
            <View style={styles.zoomFill} />
            <View style={[styles.zoomThumb, { bottom: `${Math.round(zoom * 100)}%` as any }]} />
          </View>
          <Text style={styles.zoomLabel}>−</Text>
        </View>

        {/* Квадратный видоискатель */}
        <View style={styles.viewfinderWrapper}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
            flash={flash}
            zoom={zoom}
          />
          <View style={styles.cornerMask} pointerEvents="none" />
        </View>
      </View>

      {/* Нижняя панель: световые утечки + полоска плёнок + затвор */}
      <View style={styles.bottomPanel}>
        {/* Flare / light leak selector */}
        <View style={styles.flareRow}>
          <Text style={styles.flareLabel}>СВЕТ</Text>
          {FLARE_OPTIONS.map(f => {
            const active = selectedFlare === f
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setSelectedFlare(f)}
                style={[styles.flareBtn, active && styles.flareBtnActive]}
              >
                <Text style={[styles.flareBtnText, active && styles.flareBtnTextActive]}>
                  {FLARE_LABELS[f]}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <FlatList
          ref={filmStripRef}
          data={[{ id: '__none__', name: '∅', thumb: null, cube: null } as any, ...FILM_PRESETS]}
          keyExtractor={item => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stripContent}
          renderItem={({ item }) => {
            const isNone   = item.id === '__none__'
            const isActive = isNone ? selectedPreset === null : selectedPreset?.id === item.id
            return (
              <TouchableOpacity
                style={[styles.stripItem, isActive && styles.stripItemActive]}
                onPress={() => setSelectedPreset(isNone ? null : item)}
              >
                {isNone ? (
                  <Text style={[styles.stripNone, isActive && styles.stripNoneActive]}>∅</Text>
                ) : item.thumb ? (
                  <Image source={item.thumb} style={styles.stripImg} />
                ) : (
                  // Алго-пресет — нет картинки, показываем текстовую плашку
                  <View style={[styles.stripImg, styles.stripAlgoThumb]}>
                    <Text style={[styles.stripAlgoLabel, isActive && styles.stripAlgoLabelActive]} numberOfLines={2}>
                      {item.name}
                    </Text>
                  </View>
                )}
                <Text
                  style={[styles.stripLabel, isActive && styles.stripLabelActive]}
                  numberOfLines={1}
                >
                  {isNone ? 'Без' : item.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            )
          }}
        />

        {/* Кнопка затвора */}
        <View style={styles.shutterRow}>
          <TouchableOpacity style={styles.shutter} onPress={takePicture} activeOpacity={0.8}>
            <View style={styles.shutterInner}>
              <View style={styles.shutterGlow} pointerEvents="none" />
              <Text style={styles.shutterText}>[A]</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG_DARK },

  centered: {
    flex: 1, backgroundColor: C.BG_DARK,
    justifyContent: 'center', alignItems: 'center',
    padding: 32, gap: 12,
  },
  lockEmoji: { fontSize: 48, marginBottom: 8 },
  lockTitle: { color: C.WHITE, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  lockHint:  { color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  permissionBtn: {
    marginTop: 16,
    borderWidth: 1, borderColor: C.AMBER,
    paddingHorizontal: 28, paddingVertical: 12, borderRadius: 30,
    backgroundColor: 'rgba(201,146,42,0.1)',
  },
  permissionBtnText: { color: C.AMBER, fontWeight: '600' },
  processingText: { color: '#777', marginTop: 16, fontSize: 14 },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8,
  },
  topRight: { flexDirection: 'row', gap: 8 },
  topBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center', alignItems: 'center',
  },
  topBtnText: { color: C.WHITE, fontSize: 18 },
  topBtnFlashActive: { color: C.AMBER_LIGHT },

  viewfinderArea: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, gap: 12, marginTop: 8,
  },

  zoomCol: {
    width: 32, height: VIEWFINDER, alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 8,
  },
  zoomLabel: { color: '#555', fontSize: 18, fontWeight: '300' },
  zoomTrack: {
    flex: 1, width: 3, backgroundColor: '#1A1208',
    borderRadius: 2, marginVertical: 6, overflow: 'visible', position: 'relative',
  },
  zoomFill: {
    position: 'absolute', bottom: 0, left: 0, right: 0, top: 0,
    backgroundColor: '#2E2218', borderRadius: 2,
  },
  zoomThumb: {
    position: 'absolute', left: -7,
    width: 17, height: 17, borderRadius: 9,
    backgroundColor: C.AMBER, borderWidth: 2, borderColor: C.BG_DARK,
  },

  viewfinderWrapper: {
    flex: 1, height: VIEWFINDER, borderRadius: 20, overflow: 'hidden',
  },
  camera: { width: '100%', height: '100%' },
  cornerMask: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },

  bottomPanel: {
    flex: 1, justifyContent: 'flex-end', paddingBottom: 36, gap: 16,
  },

  flareRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, gap: 8,
  },
  flareLabel: {
    color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
    marginRight: 4,
  },
  flareBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: '#333',
    justifyContent: 'center', alignItems: 'center',
  },
  flareBtnActive: {
    borderWidth: 2, borderColor: C.AMBER,
    backgroundColor: 'rgba(196,168,130,0.15)',
  },
  flareBtnText: { color: '#555', fontSize: 16 },
  flareBtnTextActive: { color: C.AMBER },
  stripContent: { paddingHorizontal: 16, gap: 10, alignItems: 'center' },
  stripItem: {
    alignItems: 'center', gap: 4, padding: 4,
    borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent',
  },
  stripItemActive: { borderColor: C.AMBER },
  stripImg: {
    width: STRIP_SIZE, height: STRIP_SIZE,
    borderRadius: 8, backgroundColor: '#1A1208',
  },
  stripNone: {
    width: STRIP_SIZE, height: STRIP_SIZE,
    borderRadius: 8, backgroundColor: '#1A1208',
    textAlign: 'center', textAlignVertical: 'center',
    lineHeight: STRIP_SIZE, color: '#555', fontSize: 20, overflow: 'hidden',
  },
  stripNoneActive: { color: C.AMBER },
  stripLabel: { color: '#555', fontSize: 10 },
  stripLabelActive: { color: C.AMBER },

  shutterRow: { alignItems: 'center' },
  shutter: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: '#2E1A0A',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#2E1A0A', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 14,
    elevation: 8,
  },
  shutterInner: {
    width: 74, height: 74, borderRadius: 37,
    backgroundColor: '#C4A882',
    justifyContent: 'center', alignItems: 'center',
  },
  shutterGlow: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#D4B99A',
    opacity: 0.45,
  },
  shutterText: {
    color: '#1A0F05',
    fontFamily: 'JetBrainsMono_800ExtraBold',
    fontSize: 40,
    letterSpacing: -0.8,
    textAlign: 'center',
  },

  // ── Превью после съёмки ──────────────────────────────
  previewScroll: { paddingBottom: 48 },
  previewFilmStrip: { width: '100%' },
  preview: { width: '100%', aspectRatio: 1, backgroundColor: '#111' },
  presetBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, marginTop: 12,
  },
  presetThumb: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#1A1208' },
  presetName: { color: C.AMBER, fontSize: 13 },

  sectionLabel: {
    color: '#666', fontSize: 11, letterSpacing: 1.5,
    textTransform: 'uppercase', paddingHorizontal: 16,
    marginTop: 20, marginBottom: 10,
  },
  moodRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, gap: 8, marginBottom: 16,
  },
  moodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
    borderColor: '#2E2218', backgroundColor: '#1A1208',
  },
  moodChipActive: {
    borderColor: C.AMBER,
    backgroundColor: 'rgba(201,146,42,0.12)',
  },
  moodEmoji: { fontSize: 14 },
  moodText: { color: '#555', fontSize: 13 },
  moodTextActive: { color: C.AMBER },

  moodChipCustom: {
    borderColor: '#C4A882',
    backgroundColor: 'rgba(196,168,130,0.12)',
  },
  moodChipRemove: {
    color: '#888', fontSize: 10, marginLeft: 2,
  },
  moodChipPlus: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: '#2E2218',
    backgroundColor: '#1A1208',
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center',
  },
  moodChipPlusText: {
    color: '#666', fontSize: 22, lineHeight: 24,
    textAlign: 'center',
  },

  // Модальное окно
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#141008',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 24, paddingBottom: 48,
    gap: 16,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#333', alignSelf: 'center', marginBottom: 8,
  },
  modalTitle: {
    color: C.WHITE, fontSize: 18, fontWeight: '700', textAlign: 'center',
  },
  modalHint: {
    color: '#555', fontSize: 13, textAlign: 'center', marginTop: -8,
  },
  modalInputRow: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
  },
  emojiInput: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: '#1A1208', borderWidth: 1, borderColor: '#2E2218',
    color: C.WHITE, fontSize: 28, textAlign: 'center',
  },
  labelInput: {
    flex: 1, height: 56, borderRadius: 14,
    backgroundColor: '#1A1208', borderWidth: 1, borderColor: '#2E2218',
    color: C.WHITE, fontSize: 15, paddingHorizontal: 14,
  },
  modalConfirmBtn: {
    backgroundColor: C.BROWN, borderRadius: 30,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  modalConfirmBtnDisabled: { opacity: 0.4 },
  modalConfirmText: { color: C.WHITE, fontSize: 15, fontWeight: '700' },

  captionInput: {
    marginHorizontal: 16, backgroundColor: '#1A1208',
    borderRadius: 12, padding: 14, color: C.WHITE,
    fontSize: 15, borderWidth: 1, borderColor: '#2E2218',
    minHeight: 80, textAlignVertical: 'top',
  },

  actionRow: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 16,
  },
  retakeBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 30,
    borderWidth: 1, borderColor: '#2E2218', alignItems: 'center',
  },
  retakeText: { color: '#777', fontSize: 15 },
  publishBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 30,
    backgroundColor: C.BROWN, alignItems: 'center',
  },
  publishBtnDisabled: { opacity: 0.5 },
  publishText: { color: C.WHITE, fontSize: 15, fontWeight: '700' },

  successScreen: {
    flex: 1, backgroundColor: C.BG_DARK,
    justifyContent: 'center', alignItems: 'center', gap: 14,
  },
  successEmoji: { fontSize: 56 },
  successTitle: { color: C.WHITE, fontSize: 22, fontWeight: '700' },
  successHint: { color: '#777', fontSize: 14 },

  // Алго-пресет плашки
  stripAlgoThumb: {
    backgroundColor: '#1A1208',
    justifyContent: 'center', alignItems: 'center', padding: 4,
  },
  stripAlgoLabel: {
    color: '#555', fontSize: 9, textAlign: 'center', fontWeight: '600',
    letterSpacing: 0.5, lineHeight: 12,
  },
  stripAlgoLabelActive: { color: C.AMBER },
  presetThumbAlgo: {
    backgroundColor: '#2E2218',
    borderRadius: 6, borderWidth: 1, borderColor: C.AMBER,
  },
})
