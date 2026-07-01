// ─────────────────────────────────────────────────────────────
// ANTIGRAM — Global Audio Player Context
// Использует expo-av. Треки живут как bundled assets.
// ─────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react'
import { Audio } from 'expo-av'

// ── Треклист ─────────────────────────────────────────────────
export interface Track {
  id: string
  name: string
  file: any
}

const TRACKS: Track[] = [
  {
    id: '1',
    name: 'Faded Polaroid',
    file: require('../../assets/music/Faded Polaroid.mp3'),
  },
  {
    id: '2',
    name: 'Midnight at Caffè Noir',
    file: require('../../assets/music/Midnight at Caffè Noir.mp3'),
  },
  {
    id: '3',
    name: 'Reel of Rain',
    file: require('../../assets/music/Reel of Rain.mp3'),
  },
  {
    id: '4',
    name: 'Sepia Keybook',
    file: require('../../assets/music/Sepia Keybook.mp3'),
  },
  {
    id: '5',
    name: 'App',
    file: require('../../assets/music/APP.mp3'),
  },
  {
    id: '6',
    name: 'Value',
    file: require('../../assets/music/VALUE.mp3'),
  },
]

// ── Типы контекста ────────────────────────────────────────────
interface PlayerContextType {
  tracks: Track[]
  currentIndex: number
  isPlaying: boolean
  isLoading: boolean
  play: () => Promise<void>
  pause: () => Promise<void>
  toggle: () => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
}

const PlayerContext = createContext<PlayerContextType | null>(null)

// ── Provider ──────────────────────────────────────────────────
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying]       = useState(false)
  const [isLoading, setIsLoading]       = useState(false)
  const soundRef = useRef<Audio.Sound | null>(null)

  // Настройка аудиосессии (один раз)
  const audioReady = useRef(false)
  async function ensureAudioMode() {
    if (audioReady.current) return
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    })
    audioReady.current = true
  }

  async function loadAndPlay(index: number) {
    setIsLoading(true)
    await ensureAudioMode()

    // Выгружаем предыдущий трек
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {})
      await soundRef.current.unloadAsync().catch(() => {})
      soundRef.current = null
    }

    const { sound } = await Audio.Sound.createAsync(
      TRACKS[index].file,
      { shouldPlay: true, isLooping: false },
      (status) => {
        if (!status.isLoaded) return
        // Авто-переключение на следующий трек
        if (status.didJustFinish) {
          const next = (index + 1) % TRACKS.length
          setCurrentIndex(next)
          loadAndPlay(next)
        }
      }
    )

    soundRef.current = sound
    setCurrentIndex(index)
    setIsPlaying(true)
    setIsLoading(false)
  }

  const play = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.playAsync()
      setIsPlaying(true)
    } else {
      await loadAndPlay(currentIndex)
    }
  }, [currentIndex])

  const pause = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.pauseAsync()
      setIsPlaying(false)
    }
  }, [])

  const toggle = useCallback(async () => {
    if (isPlaying) {
      await pause()
    } else {
      await play()
    }
  }, [isPlaying, play, pause])

  const next = useCallback(async () => {
    const idx = (currentIndex + 1) % TRACKS.length
    await loadAndPlay(idx)
  }, [currentIndex])

  const prev = useCallback(async () => {
    const idx = (currentIndex - 1 + TRACKS.length) % TRACKS.length
    await loadAndPlay(idx)
  }, [currentIndex])

  return (
    <PlayerContext.Provider value={{
      tracks: TRACKS,
      currentIndex,
      isPlaying,
      isLoading,
      play,
      pause,
      toggle,
      next,
      prev,
    }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be inside PlayerProvider')
  return ctx
}
