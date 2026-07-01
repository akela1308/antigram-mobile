// ─── Тип зерна ────────────────────────────────────────────────────────────────
//
// intensity  — сила зерна (0–1, цветовой сдвиг на пиксель)
// size       — размер кластера в оригинальных пикселях фото
//              1.0 = 1 px (мелчайшее, ISO 100-200)
//              1.5 = мелкое (ISO 400)
//              2.5 = заметное (ISO 800+)
// shape      — 'round' = гауссовское | 'tgrain' = T-grain Kodak (треугольный кластер)
// r/g/b      — вес канала. Все 1.0 = нейтральное.
//              r>g>b = тёплое зерно (Kodak Portra)
//              r<g<b = холодное/синее (Fuji, Cold)
//              один канал 0 = цветной шум (канал не шумит → другие доминируют)
//
export type GrainConfig = {
  intensity: number
  size:      number
  shape:     'round' | 'tgrain'
  r:         number
  g:         number
  b:         number
}

// Алгоритмические пресеты — без .cube файла, обрабатываются в AlgoProcessor
export type AlgoType = 'orthochrom' | 'ultramax' | 'vision_t'

export type FilmPreset = {
  id:        string
  name:      string
  thumb?:    number   // опционально — algo-пресеты используют placeholder
  cube?:     number   // опционально — только LUT-пресеты
  grain:     GrainConfig
  algoType?: AlgoType // задан → AlgoProcessor, иначе → LutProcessor
}

export const FILM_PRESETS: FilmPreset[] = [
  {
    id:    'agfa',
    name:  'Agfa Vista',
    thumb: require('../../assets/presets/agfa.png'),
    cube:  require('../../assets/presets/agfa.cube'),
    // Тёплый шум: красный доминирует, синий подавлен
    grain: { intensity: 0.012, size: 1.3, shape: 'round',  r: 1.0, g: 0.85, b: 0.65 },
  },
  {
    id:    'bleach',
    name:  'Bleach Bypass',
    thumb: require('../../assets/presets/bleach.png'),
    cube:  require('../../assets/presets/bleach.cube'),
    // Нейтральный — Bleach Bypass не имеет цветного характера
    grain: { intensity: 0.011, size: 1.3, shape: 'round',  r: 1.0, g: 1.0, b: 1.0 },
  },
  {
    id:    'cold',
    name:  'Cold',
    thumb: require('../../assets/presets/cold.png'),
    cube:  require('../../assets/presets/cold.cube'),
    // Холодный: синий доминирует, красный подавлен
    grain: { intensity: 0.008, size: 1.0, shape: 'round',  r: 0.55, g: 0.80, b: 1.0 },
  },
  {
    id:    'fuji',
    name:  'Fuji Superia',
    thumb: require('../../assets/presets/fuji.png'),
    cube:  require('../../assets/presets/fuji.cube'),
    // Fuji: зелёный слой чуть сильнее (характерно для Fuji)
    grain: { intensity: 0.007, size: 1.0, shape: 'round',  r: 0.70, g: 1.0, b: 0.85 },
  },
  {
    id:    'hc_bw',
    name:  'HC Black & White',
    thumb: require('../../assets/presets/hc_bw.png'),
    cube:  require('../../assets/presets/hc_bw.cube'),
    // Ч/Б — нейтральное
    grain: { intensity: 0.018, size: 2.0, shape: 'round',  r: 1.0, g: 1.0, b: 1.0 },
  },
  {
    id:    'kodak',
    name:  'Kodak Portra',
    thumb: require('../../assets/presets/kodak.png'),
    cube:  require('../../assets/presets/kodak.cube'),
    // T-grain + тёплый шум: красный максимальный, синий минимальный
    grain: { intensity: 0.010, size: 1.2, shape: 'tgrain', r: 1.0, g: 0.90, b: 0.65 },
  },
  {
    id:    'lc_bw',
    name:  'LC Black & White',
    thumb: require('../../assets/presets/lc_bw.png'),
    cube:  require('../../assets/presets/lc_bw.cube'),
    // Ч/Б — нейтральное
    grain: { intensity: 0.008, size: 1.0, shape: 'round',  r: 1.0, g: 1.0, b: 1.0 },
  },
  {
    id:    'slide',
    name:  'Slide',
    thumb: require('../../assets/presets/slide.png'),
    cube:  require('../../assets/presets/slide.cube'),
    // Слайд: почти нейтральный, чуть тёплый
    grain: { intensity: 0.005, size: 0.8, shape: 'round',  r: 1.0, g: 0.90, b: 0.80 },
  },
  {
    id:    'technicolor',
    name:  'Technicolor',
    thumb: require('../../assets/presets/technicolor.png'),
    cube:  require('../../assets/presets/technicolor.cube'),
    // Кросс-процесс: красный и зелёный, синий подавлен
    grain: { intensity: 0.014, size: 1.7, shape: 'round',  r: 1.0, g: 0.95, b: 0.45 },
  },
  {
    id:    'warm',
    name:  'Warm',
    thumb: require('../../assets/presets/warm.png'),
    cube:  require('../../assets/presets/warm.cube'),
    // Тёплый: красный максимальный, синий сильно подавлен
    grain: { intensity: 0.009, size: 1.0, shape: 'round',  r: 1.0, g: 0.80, b: 0.50 },
  },

  // ─── Алгоритмические пресеты (без .cube) ──────────────────────────────────
  {
    id:       'orthochrom',
    name:     'Orthochrom',
    algoType: 'orthochrom' as AlgoType,
    // Только красный канал → Ч/Б + резкий контраст. Зерно крупное нейтральное
    grain: { intensity: 0.022, size: 1.8, shape: 'round',  r: 1.0, g: 1.0, b: 1.0 },
  },
  {
    id:       'ultramax',
    name:     'Ultramax',
    algoType: 'ultramax' as AlgoType,
    // Тёплый (+500K), насыщенный, контрастный. Зерно тёплое
    grain: { intensity: 0.010, size: 1.3, shape: 'round',  r: 1.0, g: 0.85, b: 0.60 },
  },
  {
    id:       'vision_t',
    name:     'Vision T',
    algoType: 'vision_t' as AlgoType,
    // Холодный (-500K), мягкий контраст. T-grain холодный
    grain: { intensity: 0.009, size: 1.5, shape: 'tgrain', r: 0.65, g: 0.80, b: 1.0 },
  },
]
