/**
 * AlgoProcessor.tsx
 *
 * Компонент-"призрак" — применяет алгоритмические пресеты (без .cube) к фото через GLView.
 * Три алгоритма: Orthochrom, Ultramax, Vision T.
 * Зерно — тот же движок, что и в LutProcessor.
 */

import { useRef } from 'react'
import { View } from 'react-native'
import { GLView } from 'expo-gl'
import { Asset } from 'expo-asset'
import * as ImageManipulator from 'expo-image-manipulator'
import { FilmPreset, AlgoType } from '../constants/filmPresets'

// ─── Маппинг алго → uniform int ───────────────────────────────────────────────
const ALGO_INDEX: Record<AlgoType, number> = {
  orthochrom: 0,
  ultramax:   1,
  vision_t:   2,
}

// ─── GLSL ─────────────────────────────────────────────────────────────────────

const VERT = `
  attribute vec2 a_pos; attribute vec2 a_uv; varying vec2 v_uv;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); v_uv = a_uv; }
`

const FRAG = `
  precision mediump float;

  uniform sampler2D u_photo;
  uniform int       u_algo;        // 0=orthochrom, 1=ultramax, 2=vision_t
  uniform vec2      u_resolution;

  // Grain uniforms
  uniform float u_grain_intensity;
  uniform float u_grain_size;
  uniform float u_grain_shape;
  uniform vec3  u_grain_weights;

  varying vec2 v_uv;

  // ── Grain ─────────────────────────────────────────────────────────────────

  float grainHash(vec2 p) {
    p = fract(p * vec2(0.1031, 0.1030));
    p += dot(p, p.yx + 33.33);
    return fract((p.x + p.y) * p.x);
  }

  float gaussian4(vec2 cell) {
    float a  = grainHash(cell);
    float b  = grainHash(cell + vec2(0.1, 0.7));
    float c2 = grainHash(cell + vec2(0.4, 0.3));
    float d  = grainHash(cell + vec2(0.8, 0.6));
    return (a + b + c2 + d) * 0.5 - 1.0;
  }

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

  float tgrain(vec2 px, float sz) {
    float center = valueNoise(px, sz);
    float tl     = valueNoise(px + vec2(-sz, -sz), sz) * 0.5;
    float tr     = valueNoise(px + vec2( sz, -sz), sz) * 0.5;
    float bot    = valueNoise(px + vec2(0.0,   sz), sz) * 0.5;
    return (center + tl + tr + bot) / 2.5;
  }

  // ── Алгоритмы ─────────────────────────────────────────────────────────────

  vec3 applyOrthochrom(vec3 c) {
    // Ортохроматическая плёнка: спектральная чувствительность
    //   Красный (620-700nm)          → нечувствительна → тёмный/чёрный
    //   Зелёный (500-570nm)          → средняя чувствительность → серый
    //   Синий/голубой/фиолетовый     → максимальная → белый/светлый

    // Базовая яркость: красный исключён полностью, синий доминирует
    float luma = c.g * 0.38 + c.b * 0.62;

    // Дополнительное подавление красных тонов:
    // чем объект "краснее" относительно синего и зелёного — тем темней
    float redExcess = clamp(c.r - max(c.g, c.b) * 0.8, 0.0, 1.0);
    luma = clamp(luma - redExcess * 0.55, 0.0, 1.0);

    // Высокий контраст — характерен для ортохромной плёнки
    luma = clamp((luma - 0.5) * 1.65 + 0.5, 0.0, 1.0);

    return vec3(luma);
  }

  vec3 applyUltramax(vec3 c) {
    // Тёплый сдвиг (+500K): красный +10%, синий -15%
    c = c * vec3(1.10, 1.02, 0.85);
    // Контраст ×1.28
    c = clamp((c - 0.5) * 1.28 + 0.5, 0.0, 1.0);
    // Насыщенность ×1.40
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = clamp(mix(vec3(luma), c, 1.40), 0.0, 1.0);
    return c;
  }

  vec3 applyVisionT(vec3 c) {
    // Холодный сдвиг (-500K): синий +14%, красный -10%
    c = c * vec3(0.90, 0.98, 1.14);
    // Контраст ×0.85 (мягче)
    c = clamp((c - 0.5) * 0.85 + 0.5, 0.0, 1.0);
    // Насыщенность ×0.88 (чуть бледнее)
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = clamp(mix(vec3(luma), c, 0.88), 0.0, 1.0);
    return c;
  }

  void main() {
    vec4 s = texture2D(u_photo, v_uv);
    vec3 color = s.rgb;

    // Применяем алгоритм
    if (u_algo == 0) {
      color = applyOrthochrom(color);
    } else if (u_algo == 1) {
      color = applyUltramax(color);
    } else {
      color = applyVisionT(color);
    }

    // Зерно (тот же движок, что и в LutProcessor)
    if (u_grain_intensity > 0.001) {
      vec2 px = v_uv * u_resolution;

      float g = (u_grain_shape > 0.5)
        ? tgrain(px, u_grain_size)
        : valueNoise(px, u_grain_size);

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float lumaMask = max(0.25, 4.0 * luma * (1.0 - luma));

      float maxDev = max(abs(color.r - color.g),
                     max(abs(color.g - color.b), abs(color.r - color.b)));
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

export default function AlgoProcessor({ photoUri, photoWidth, photoHeight, preset, onDone }: Props) {
  const glRef = useRef<GLView>(null)

  const maxDim = 1080
  const scale  = Math.min(1, maxDim / Math.max(photoWidth, photoHeight))
  const w = Math.round(photoWidth  * scale)
  const h = Math.round(photoHeight * scale)

  const algoIndex = ALGO_INDEX[preset.algoType ?? 'orthochrom']

  async function onContextCreate(gl: WebGLRenderingContext) {
    try {
      // 1. Нормализуем EXIF-ориентацию
      const normalized = await ImageManipulator.manipulateAsync(
        photoUri, [],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
      )
      const photoAsset = Asset.fromURI(normalized.uri)
      await photoAsset.downloadAsync()

      // 2. Программа
      const prog = mkProg(gl, VERT, FRAG)
      gl.useProgram(prog)

      // 3. Quad
      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1,-1, 0,1,  1,-1, 1,1,  -1,1, 0,0,  1,1, 1,0,
      ]), gl.STATIC_DRAW)
      const aPos = gl.getAttribLocation(prog, 'a_pos')
      const aUv  = gl.getAttribLocation(prog, 'a_uv')
      gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
      gl.enableVertexAttribArray(aUv);  gl.vertexAttribPointer(aUv,  2, gl.FLOAT, false, 16, 8)

      // 4. Текстура фото
      const photoTex = gl.createTexture()
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, photoTex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      ;(gl as any).texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photoAsset)

      // 5. Uniforms
      gl.uniform1i(gl.getUniformLocation(prog, 'u_photo'), 0)
      gl.uniform1i(gl.getUniformLocation(prog, 'u_algo'),  algoIndex)
      gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), photoWidth, photoHeight)

      const g = preset.grain
      gl.uniform1f(gl.getUniformLocation(prog, 'u_grain_intensity'), g.intensity)
      gl.uniform1f(gl.getUniformLocation(prog, 'u_grain_size'),      g.size)
      gl.uniform1f(gl.getUniformLocation(prog, 'u_grain_shape'),     g.shape === 'tgrain' ? 1.0 : 0.0)
      gl.uniform3f(gl.getUniformLocation(prog, 'u_grain_weights'),   g.r, g.g, g.b)

      // 6. Рендер
      gl.viewport(0, 0, w, h)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, photoTex)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.flush()
      ;(gl as any).endFrameEXP()

      // 7. Снэпшот
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
