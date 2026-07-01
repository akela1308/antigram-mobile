/**
 * applyLut.ts
 * Применяет .cube LUT к фото через expo-gl (headless WebGL).
 * Работает в Expo Go без нативных модулей.
 */

// Buffer полифилл — jpeg-js требует Node.js Buffer, которого нет в RN
if (typeof global.Buffer === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  global.Buffer = require('buffer').Buffer
}

import { GLView } from 'expo-gl'
import { Asset } from 'expo-asset'
import * as FileSystem from 'expo-file-system/legacy'
import jpeg from 'jpeg-js'

// ─── Парсинг .cube ────────────────────────────────────────────────────────────

type LutData = { size: number; data: Float32Array }

function parseCubeFile(text: string): LutData {
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
      const r = parseFloat(parts[0])
      const g = parseFloat(parts[1])
      const b = parseFloat(parts[2])
      if (!isNaN(r)) entries.push(r, g, b)
    }
  }
  return { size, data: new Float32Array(entries) }
}

// ─── 3D LUT → 2D текстура: x = b*size + r,  y = g ──────────────────────────

function packLutToRgba(lut: LutData): { pixels: Uint8Array; width: number; height: number } {
  const { size, data } = lut
  const width  = size * size
  const height = size
  const pixels = new Uint8Array(width * height * 4)

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const lutIdx = (r + g * size + b * size * size) * 3
        const px     = (b * size + r) + g * width
        pixels[px * 4 + 0] = Math.min(255, Math.round(data[lutIdx + 0] * 255))
        pixels[px * 4 + 1] = Math.min(255, Math.round(data[lutIdx + 1] * 255))
        pixels[px * 4 + 2] = Math.min(255, Math.round(data[lutIdx + 2] * 255))
        pixels[px * 4 + 3] = 255
      }
    }
  }
  return { pixels, width, height }
}

// ─── GLSL ─────────────────────────────────────────────────────────────────────

const VERT_SRC = `
  attribute vec2 a_pos;
  attribute vec2 a_uv;
  varying   vec2 v_uv;
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
    v_uv = a_uv;
  }
`

const fragSrc = (size: number) => `
  precision mediump float;
  uniform sampler2D u_photo;
  uniform sampler2D u_lut;
  uniform float     u_size;
  varying vec2      v_uv;

  vec3 applyLut(vec3 c) {
    float sz   = u_size;
    float bF   = c.b * (sz - 1.0);
    float b0   = floor(bF);
    float b1   = min(b0 + 1.0, sz - 1.0);
    float bMix = bF - b0;

    float gN  = (c.g * (sz - 1.0) + 0.5) / sz;
    float rPx = c.r * (sz - 1.0) + 0.5;

    vec2 uv0 = vec2((b0 * sz + rPx) / (sz * sz), gN);
    vec2 uv1 = vec2((b1 * sz + rPx) / (sz * sz), gN);

    return mix(
      texture2D(u_lut, uv0).rgb,
      texture2D(u_lut, uv1).rgb,
      bMix
    );
  }

  void main() {
    vec4 src = texture2D(u_photo, v_uv);
    gl_FragColor = vec4(applyLut(src.rgb), src.a);
  }
`

// ─── Хелперы GL ───────────────────────────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error('Shader: ' + gl.getShaderInfoLog(sh))
  return sh
}

function buildProgram(gl: WebGLRenderingContext, vert: string, frag: string): WebGLProgram {
  const prog = gl.createProgram()!
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER,   vert))
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error('Link: ' + gl.getProgramInfoLog(prog))
  return prog
}

// ─── Кодирование RGBA → JPEG файл ────────────────────────────────────────────

function uint8ToBase64(u8: Uint8Array): string {
  // btoa не умеет напрямую Uint8Array — конвертируем через строку
  let binary = ''
  const len = u8.byteLength
  for (let i = 0; i < len; i += 8192) {
    const chunk = u8.subarray(i, i + 8192)
    binary += String.fromCharCode(...(chunk as any))
  }
  return btoa(binary)
}

// ─── Главная функция ──────────────────────────────────────────────────────────

export async function applyLutToPhoto(
  photoUri: string,
  cubeModuleId: number,
  photoWidth: number,
  photoHeight: number
): Promise<string> {
  try {
    // 1. Загружаем .cube файл
    const cubeAsset = Asset.fromModule(cubeModuleId)
    await cubeAsset.downloadAsync()
    const cubeText = await FileSystem.readAsStringAsync(cubeAsset.localUri!, {
      encoding: 'utf8' as any,
    })
    const lut = parseCubeFile(cubeText)
    const { pixels: lutPixels, width: lutW, height: lutH } = packLutToRgba(lut)

    // 2. Загружаем фото как Asset (expo-gl требует Asset-объект, не raw URI)
    const photoAsset = Asset.fromURI(photoUri)
    await photoAsset.downloadAsync()

    // Ограничиваем размер для производительности
    const maxDim = 1080
    const scale = Math.min(1, maxDim / Math.max(photoWidth, photoHeight))
    const glW = Math.round(photoWidth  * scale)
    const glH = Math.round(photoHeight * scale)

    // 3. Headless GL-контекст
    const gl = await GLView.createContextAsync()

    // 4. Программа
    const prog = buildProgram(gl as any, VERT_SRC, fragSrc(lut.size))
    gl.useProgram(prog)

    // 5. Квадрат на весь экран
    const verts = new Float32Array([
      -1, -1,   0, 1,
       1, -1,   1, 1,
      -1,  1,   0, 0,
       1,  1,   1, 0,
    ])
    const vbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)

    const aPos = gl.getAttribLocation(prog, 'a_pos')
    const aUv  = gl.getAttribLocation(prog, 'a_uv')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(aUv)
    gl.vertexAttribPointer(aUv,  2, gl.FLOAT, false, 16, 8)

    // 6. Текстура фото — КЛЮЧ: передаём Asset-объект, не { uri }
    const photoTex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, photoTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    // expo-gl умеет загружать Asset-объект напрямую
    ;(gl as any).texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE,
      photoAsset
    )

    // 7. Текстура LUT
    const lutTex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, lutTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lutW, lutH, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutPixels)

    // 8. Uniforms
    gl.uniform1i(gl.getUniformLocation(prog, 'u_photo'), 0)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_lut'),   1)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_size'),  lut.size)

    // 9. Framebuffer для offscreen-рендера
    const fb  = gl.createFramebuffer()
    const out = gl.createTexture()
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, out)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, glW, glH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0)
    gl.viewport(0, 0, glW, glH)

    // 10. Активируем текстуры и рисуем
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, photoTex)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, lutTex)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.flush()

    // 11. Читаем пиксели из framebuffer
    const rawPixels = new Uint8Array(glW * glH * 4)
    gl.readPixels(0, 0, glW, glH, gl.RGBA, gl.UNSIGNED_BYTE, rawPixels)

    // 12. GL y=0 — снизу, а у JPEG y=0 — сверху → переворачиваем
    const flipped = new Uint8Array(glW * glH * 4)
    const rowBytes = glW * 4
    for (let row = 0; row < glH; row++) {
      const srcStart = (glH - 1 - row) * rowBytes
      flipped.set(rawPixels.subarray(srcStart, srcStart + rowBytes), row * rowBytes)
    }

    // 13. Кодируем RGBA → JPEG через jpeg-js
    const encoded = jpeg.encode(
      { data: flipped as any, width: glW, height: glH },
      90
    )

    // 14. Пишем файл в кэш и возвращаем URI
    const outputUri = FileSystem.cacheDirectory + `filtered_${Date.now()}.jpg`
    await FileSystem.writeAsStringAsync(
      outputUri,
      uint8ToBase64(encoded.data),
      { encoding: FileSystem.EncodingType.Base64 }
    )

    return outputUri

  } catch {
    return photoUri
  }
}
