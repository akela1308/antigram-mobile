/**
 * LutProcessor.tsx
 *
 * Компонент-"призрак" — рендерит GLView за экраном, применяет LUT + зерно к фото
 * и возвращает URI отфильтрованного изображения через onDone.
 *
 * Зерно реализовано в GLSL (GPU):
 *  - Гауссовское распределение через суммирование 4 хэшей (Central Limit Theorem)
 *  - Поддержка кластеров (grain size > 1px)
 *  - T-grain форма (треугольный кластер, как у Kodak)
 *  - Цветной шум через per-channel веса
 */

import { useRef } from 'react'
import { View } from 'react-native'
import { GLView } from 'expo-gl'
import { Asset } from 'expo-asset'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { FilmPreset } from '../constants/filmPresets'

// ─── Парсинг .cube ────────────────────────────────────────────────────────────

function parseCubeFile(text: string) {
  const lines = text.split('\n')
  let size = 33
  const entries: number[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    if (t.startsWith('LUT_3D_SIZE')) { size = parseInt(t.split(/\s+/)[1], 10); continue }
    if (t.startsWith('TITLE') || t.startsWith('DOMAIN')) continue
    const parts = t.split(/\s+/)
    if (parts.length === 3) {
      const r = parseFloat(parts[0]), g = parseFloat(parts[1]), b = parseFloat(parts[2])
      if (!isNaN(r)) entries.push(r, g, b)
    }
  }
  return { size, data: new Float32Array(entries) }
}

// ─── 3D LUT → 2D текстура ─────────────────────────────────────────────────────

function packLut(lut: { size: number; data: Float32Array }) {
  const { size, data } = lut
  const width = size * size, height = size
  const pixels = new Uint8Array(width * height * 4)
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const i  = (r + g * size + b * size * size) * 3
        const px = (b * size + r) + g * width
        pixels[px * 4]     = Math.min(255, Math.round(data[i]     * 255))
        pixels[px * 4 + 1] = Math.min(255, Math.round(data[i + 1] * 255))
        pixels[px * 4 + 2] = Math.min(255, Math.round(data[i + 2] * 255))
        pixels[px * 4 + 3] = 255
      }
  return { pixels, width, height }
}

// ─── GLSL ─────────────────────────────────────────────────────────────────────

const VERT = `
  attribute vec2 a_pos; attribute vec2 a_uv; varying vec2 v_uv;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); v_uv = a_uv; }
`

const FRAG = (sz: number) => `
  precision mediump float;

  uniform sampler2D u_photo, u_lut;
  uniform float     u_sz;
  uniform vec2      u_resolution;

  // Grain uniforms
  uniform float u_grain_intensity; // сила зерна, 0.04 ≈ ±10 бит на 0-255
  uniform float u_grain_size;      // размер кластера (1.0 = 1px, 2.5 = крупное)
  uniform float u_grain_shape;     // 0 = round/gaussian, 1 = T-grain (Kodak)
  uniform vec3  u_grain_weights;   // веса каналов R/G/B для цветного шума

  varying vec2  v_uv;

  // ── LUT ──────────────────────────────────────────────────────────────────────
  vec3 lut(vec3 c) {
    float bF = c.b*(u_sz-1.0), b0 = floor(bF), b1 = min(b0+1.0,u_sz-1.0);
    float gN = (c.g*(u_sz-1.0)+0.5)/u_sz, rPx = c.r*(u_sz-1.0)+0.5;
    vec2 uv0 = vec2((b0*u_sz+rPx)/(u_sz*u_sz),gN);
    vec2 uv1 = vec2((b1*u_sz+rPx)/(u_sz*u_sz),gN);
    return mix(texture2D(u_lut,uv0).rgb, texture2D(u_lut,uv1).rgb, bF-b0);
  }

  // ── GRAIN ─────────────────────────────────────────────────────────────────────
  //
  // Хэш без видимой периодичности (Inigo Quilez "hash without sine")
  float grainHash(vec2 p) {
    p = fract(p * vec2(0.1031, 0.1030));
    p += dot(p, p.yx + 33.33);
    return fract((p.x + p.y) * p.x);
  }

  // Гауссовское приближение через CLT (сумма 4 равномерных)
  // Возвращает [-1, +1]
  float gaussian4(vec2 cell) {
    float a = grainHash(cell);
    float b = grainHash(cell + vec2(0.1, 0.7));
    float c2 = grainHash(cell + vec2(0.4, 0.3));
    float d = grainHash(cell + vec2(0.8, 0.6));
    return (a + b + c2 + d) * 0.5 - 1.0;
  }

  // Value noise: Hermite-интерполяция между узлами сетки.
  // Работает в координатах GL-viewport — каждый пиксель = 1 единица.
  // Для size=1.0: каждый пиксель независим (чистое зерно).
  // Для size>1: соседние пиксели плавно коррелированы (крупное зерно).
  float valueNoise(vec2 px, float sz) {
    vec2 scaled = px / max(sz, 1.0);
    vec2 i = floor(scaled);
    vec2 f = fract(scaled);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(gaussian4(i              ), gaussian4(i + vec2(1.0, 0.0)), u.x),
      mix(gaussian4(i + vec2(0.0,1.0)), gaussian4(i + vec2(1.0,1.0)), u.x),
      u.y
    );
  }

  // T-grain (Kodak): треугольный кластер
  float tgrain(vec2 px, float sz) {
    float center = valueNoise(px, sz);
    float tl     = valueNoise(px + vec2(-sz, -sz), sz) * 0.5;
    float tr     = valueNoise(px + vec2( sz, -sz), sz) * 0.5;
    float bot    = valueNoise(px + vec2(0.0,   sz), sz) * 0.5;
    return (center + tl + tr + bot) / 2.5;
  }

  void main() {
    vec4 s = texture2D(u_photo, v_uv);
    vec3 color = lut(s.rgb);

    if (u_grain_intensity > 0.001) {
      vec2 px = v_uv * u_resolution;

      // Выбираем форму зерна
      float g = (u_grain_shape > 0.5)
        ? tgrain(px, u_grain_size)
        : valueNoise(px, u_grain_size);

      // Luminosity mask: зерно максимально в полутонах, меньше в тенях и светах.
      // Это физика плёнки: мало засвеченных кристаллов = мало зерна (тени),
      // перевозбуждённые кристаллы сливаются = зерно теряется (света).
      // Формула 4*L*(1-L): 0 в чисто чёрном/белом, 1.0 при L=0.5
      // Мин. порог 0.25 — небольшое зерно остаётся даже в тенях (основа плёнки).
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float lumaMask = max(0.25, 4.0 * luma * (1.0 - luma));

      // Neutrality guard: серые/нейтральные пиксели (R≈G≈B) не меняют оттенок.
      // Для таких пикселей веса зерна принудительно выравниваются до (1,1,1),
      // чтобы серый оставался серым вне зависимости от LUT и u_grain_weights.
      float maxDev = max(abs(color.r - color.g),
                     max(abs(color.g - color.b), abs(color.r - color.b)));
      // saturation: 0.0 = нейтральный (все каналы равны), 1.0 = цветной пиксель
      // порог 8.0 → maxDev > 0.125 считается цветным
      float saturation = clamp(maxDev * 8.0, 0.0, 1.0);
      vec3 effectiveWeights = mix(vec3(1.0), u_grain_weights, saturation);

      float gi = g * u_grain_intensity * lumaMask;
      color.r = clamp(color.r + gi * effectiveWeights.r, 0.0, 1.0);
      color.g = clamp(color.g + gi * effectiveWeights.g, 0.0, 1.0);
      color.b = clamp(color.b + gi * effectiveWeights.b, 0.0, 1.0);
    }

    gl_FragColor = vec4(color, s.a);
  }
`

function mkShader(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error')
  return sh
}
function mkProg(gl: WebGLRenderingContext, vert: string, frag: string) {
  const p = gl.createProgram()!
  gl.attachShader(p, mkShader(gl, gl.VERTEX_SHADER,   vert))
  gl.attachShader(p, mkShader(gl, gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? 'link error')
  return p
}

// ─── Компонент ────────────────────────────────────────────────────────────────

interface Props {
  photoUri:    string
  photoWidth:  number
  photoHeight: number
  preset:      FilmPreset
  onDone:      (uri: string) => void
}

export default function LutProcessor({ photoUri, photoWidth, photoHeight, preset, onDone }: Props) {
  const glRef = useRef<GLView>(null)

  const maxDim = 1080
  const scale  = Math.min(1, maxDim / Math.max(photoWidth, photoHeight))
  const w = Math.round(photoWidth  * scale)
  const h = Math.round(photoHeight * scale)

  async function onContextCreate(gl: WebGLRenderingContext) {
    try {
      if (!preset.cube) {
        onDone(photoUri)
        return
      }

      // 1. Загружаем .cube
      const cubeAsset = Asset.fromModule(preset.cube)
      await cubeAsset.downloadAsync()
      const cubeText = await FileSystem.readAsStringAsync(cubeAsset.localUri!, {
        encoding: 'utf8' as any,
      })
      const lut = parseCubeFile(cubeText)
      const { pixels: lutPx, width: lutW, height: lutH } = packLut(lut)

      // 2. Нормализуем EXIF-ориентацию фото
      const normalized = await ImageManipulator.manipulateAsync(
        photoUri, [],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
      )
      const photoAsset = Asset.fromURI(normalized.uri)
      await photoAsset.downloadAsync()

      // 3. Программа
      const prog = mkProg(gl, VERT, FRAG(lut.size))
      gl.useProgram(prog)

      // 4. Quad
      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1,-1, 0,1,  1,-1, 1,1,  -1,1, 0,0,  1,1, 1,0,
      ]), gl.STATIC_DRAW)
      const aPos = gl.getAttribLocation(prog, 'a_pos')
      const aUv  = gl.getAttribLocation(prog, 'a_uv')
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
      gl.enableVertexAttribArray(aUv);  gl.vertexAttribPointer(aUv,  2, gl.FLOAT, false, 16, 8)

      // 5. Текстура фото
      const photoTex = gl.createTexture()
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, photoTex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      ;(gl as any).texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photoAsset)

      // 6. Текстура LUT
      const lutTex = gl.createTexture()
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lutTex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lutW, lutH, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutPx)

      // 7. Uniforms — LUT
      gl.uniform1i(gl.getUniformLocation(prog, 'u_photo'), 0)
      gl.uniform1i(gl.getUniformLocation(prog, 'u_lut'),   1)
      gl.uniform1f(gl.getUniformLocation(prog, 'u_sz'),    lut.size)

      // 8. Uniforms — зерно
      // Передаём оригинальное разрешение фото, а не downscaled GL viewport.
      // px = v_uv * u_resolution → координаты в оригинальных пикселях,
      // поэтому grain_size=1.0 = 1 оригинальный пиксель (не кластер).
      const g = preset.grain
      gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), photoWidth, photoHeight)
      gl.uniform1f(gl.getUniformLocation(prog, 'u_grain_intensity'),  g.intensity             )
      gl.uniform1f(gl.getUniformLocation(prog, 'u_grain_size'),       g.size                  )
      gl.uniform1f(gl.getUniformLocation(prog, 'u_grain_shape'),      g.shape === 'tgrain' ? 1.0 : 0.0)
      gl.uniform3f(gl.getUniformLocation(prog, 'u_grain_weights'),    g.r,         g.g,  g.b  )

      // 9. Рендер
      gl.viewport(0, 0, w, h)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, photoTex)
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lutTex)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.flush()
      ;(gl as any).endFrameEXP()

      // 10. Снэпшот
      const snap = await glRef.current!.takeSnapshotAsync({
        format: 'jpeg',
      })

      onDone(typeof snap.uri === 'string' ? snap.uri : photoUri)

    } catch {
      onDone(photoUri)
    }
  }

  return (
    <View
      style={{ position: 'absolute', left: -9999, top: 0, width: w, height: h }}
      pointerEvents="none"
    >
      <GLView
        ref={glRef}
        style={{ width: w, height: h }}
        onContextCreate={onContextCreate}
      />
    </View>
  )
}
