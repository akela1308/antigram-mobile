/**
 * photoProcessor.ts
 *
 * Full photo processing pipeline:
 *   jpeg-js decode → applyAlgo → applyGrain → applyLUT (expo-gl) → applyFlare → jpeg-js encode
 *
 * All image manipulation is done on raw RGBA Uint8ClampedArray buffers.
 * LUT step uses GLView.createContextAsync() for a headless WebGL context.
 */

import * as FileSystem from 'expo-file-system/legacy'
import { Asset } from 'expo-asset'
import { GLView } from 'expo-gl'
import * as jpeg from 'jpeg-js'
import { decode as decodeBase64, encode as encodeBase64 } from 'base64-arraybuffer'
import type { FilmPreset, GrainConfig, AlgoType } from '../constants/filmPresets'

export type FlareType = 'none' | 'leak_warm' | 'leak_cool' | 'edge_burn' | 'streak'

// ─── Decode / Encode ──────────────────────────────────────────────────────────

async function readImagePixels(uri: string): Promise<{
  data: Uint8ClampedArray
  width: number
  height: number
}> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  const buffer = decodeBase64(base64)
  const raw = jpeg.decode(new Uint8Array(buffer), { useTArray: true, formatAsRGBA: true })
  return { data: new Uint8ClampedArray(raw.data), width: raw.width, height: raw.height }
}

async function writeImagePixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  quality = 92,
): Promise<string> {
  const encoded = jpeg.encode({ data: Buffer.from(data), width, height }, quality)
  // Safely extract ArrayBuffer without stale offset
  const ab = encoded.data.buffer.slice(
    encoded.data.byteOffset,
    encoded.data.byteOffset + encoded.data.byteLength,
  ) as ArrayBuffer
  const base64 = encodeBase64(ab)
  const outputUri = `${FileSystem.cacheDirectory}processed_${Date.now()}.jpg`
  await FileSystem.writeAsStringAsync(outputUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  })
  return outputUri
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v))
}

function triangleRandom(): number {
  return (Math.random() + Math.random()) / 2
}

// ─── Grain — port of Python add_noise() ──────────────────────────────────────

function applyGrain(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  grain: GrainConfig,
): void {
  const scale = grain.intensity * 220

  if (grain.size <= 1.0) {
    // Per-pixel noise (fine grain)
    for (let i = 0; i < data.length; i += 4) {
      const rnd = grain.shape === 'tgrain' ? triangleRandom() : Math.random()
      const n = rnd * scale
      data[i]     = clamp(data[i]     + n * grain.r)
      data[i + 1] = clamp(data[i + 1] + n * grain.g)
      data[i + 2] = clamp(data[i + 2] + n * grain.b)
    }
  } else {
    // Cluster noise (size > 1.0): generate on a grid, each cluster shares one value
    const cellW = Math.ceil(grain.size)
    const cellH = Math.ceil(grain.size)
    const gridW = Math.ceil(width  / cellW)
    const gridH = Math.ceil(height / cellH)
    const noiseGrid = new Float32Array(gridW * gridH)
    for (let k = 0; k < noiseGrid.length; k++) {
      const rnd = grain.shape === 'tgrain' ? triangleRandom() : Math.random()
      noiseGrid[k] = rnd * scale
    }
    for (let y = 0; y < height; y++) {
      const gy = Math.min(Math.floor(y / cellH), gridH - 1)
      for (let x = 0; x < width; x++) {
        const gx = Math.min(Math.floor(x / cellW), gridW - 1)
        const n = noiseGrid[gy * gridW + gx]
        const i = (y * width + x) * 4
        data[i]     = clamp(data[i]     + n * grain.r)
        data[i + 1] = clamp(data[i + 1] + n * grain.g)
        data[i + 2] = clamp(data[i + 2] + n * grain.b)
      }
    }
  }
}

// ─── Algorithmic presets ──────────────────────────────────────────────────────

function applyAlgo(data: Uint8ClampedArray, algoType: AlgoType): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]

    if (algoType === 'orthochrom') {
      // Orthochromatic film: R-channel dominant luminance, high contrast
      const lum = r * 0.90 + g * 0.06 + b * 0.04
      const c = clamp((lum - 128) * 1.55 + 128)
      data[i] = data[i + 1] = data[i + 2] = c

    } else if (algoType === 'ultramax') {
      // Kodak Ultramax 400: warm +500K, saturated, contrasty
      let nr = clamp(r * 1.08 + 12)
      let ng = clamp(g * 1.02)
      let nb = clamp(b * 0.85 - 6)
      data[i]     = clamp((nr - 128) * 1.10 + 128)
      data[i + 1] = clamp((ng - 128) * 1.08 + 128)
      data[i + 2] = clamp((nb - 128) * 1.10 + 128)

    } else if (algoType === 'vision_t') {
      // Kodak Vision3: cool -500K, soft contrast
      let nr = clamp(r * 0.88 - 8)
      let ng = clamp(g * 0.97)
      let nb = clamp(b * 1.14 + 10)
      data[i]     = clamp((nr - 128) * 0.95 + 128)
      data[i + 1] = clamp((ng - 128) * 0.95 + 128)
      data[i + 2] = clamp((nb - 128) * 0.95 + 128)
    }
  }
}

// ─── LUT via expo-gl headless context ────────────────────────────────────────

interface Lut3D {
  size: number
  data: Float32Array
}

async function parseCubeFile(cubeAssetModule: number): Promise<Lut3D> {
  const asset = await Asset.fromModule(cubeAssetModule).downloadAsync()
  const text = await FileSystem.readAsStringAsync(asset.localUri!)

  let size = 33
  const values: number[] = []

  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    if (t.startsWith('LUT_3D_SIZE')) { size = parseInt(t.split(/\s+/)[1], 10); continue }
    if (t.startsWith('TITLE') || t.startsWith('DOMAIN')) continue
    const parts = t.split(/\s+/)
    if (parts.length >= 3) {
      const r = parseFloat(parts[0]), g = parseFloat(parts[1]), b = parseFloat(parts[2])
      if (!isNaN(r)) values.push(r, g, b)
    }
  }

  return { size, data: new Float32Array(values) }
}

const VERT_SRC = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    v_texCoord = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

function buildFragSrc(lutSize: number): string {
  return `
    precision mediump float;
    uniform sampler2D u_image;
    uniform sampler2D u_lut;
    uniform float u_sz;
    varying vec2 v_texCoord;

    vec3 lutLookup(vec3 c) {
      float bF = c.b * (u_sz - 1.0);
      float b0 = floor(bF);
      float b1 = min(b0 + 1.0, u_sz - 1.0);
      float gN = (c.g * (u_sz - 1.0) + 0.5) / u_sz;
      float rPx = c.r * (u_sz - 1.0) + 0.5;
      vec2 uv0 = vec2((b0 * u_sz + rPx) / (u_sz * u_sz), gN);
      vec2 uv1 = vec2((b1 * u_sz + rPx) / (u_sz * u_sz), gN);
      return mix(texture2D(u_lut, uv0).rgb, texture2D(u_lut, uv1).rgb, bF - b0);
    }

    void main() {
      vec4 c = texture2D(u_image, v_texCoord);
      gl_FragColor = vec4(lutLookup(c.rgb), c.a);
    }
  `
}

type HeadlessGL = {
  createContextAsync?: () => Promise<WebGLRenderingContext>
}

async function applyLUT(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cubeAssetModule: number,
): Promise<void> {
  // Guard: GLView.createContextAsync is optional depending on expo-gl build
  const createCtx = (GLView as unknown as HeadlessGL).createContextAsync
  if (!createCtx) return

  const lut = await parseCubeFile(cubeAssetModule)

  const gl = await createCtx.call(GLView)

  // Image texture (TEXTURE0)
  const imgTex = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, imgTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data.buffer))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  // LUT strip texture (size*size × size, RGBA) — matches packLut in LutProcessor
  const lutSize = lut.size
  const lutW = lutSize * lutSize
  const lutH = lutSize
  const lutPx = new Uint8Array(lutW * lutH * 4)
  const ld = lut.data
  for (let b = 0; b < lutSize; b++) {
    for (let g2 = 0; g2 < lutSize; g2++) {
      for (let r = 0; r < lutSize; r++) {
        const srcIdx = (r + g2 * lutSize + b * lutSize * lutSize) * 3
        const dstIdx = ((b * lutSize + r) + g2 * lutW) * 4
        lutPx[dstIdx]     = Math.min(255, Math.round(ld[srcIdx]     * 255))
        lutPx[dstIdx + 1] = Math.min(255, Math.round(ld[srcIdx + 1] * 255))
        lutPx[dstIdx + 2] = Math.min(255, Math.round(ld[srcIdx + 2] * 255))
        lutPx[dstIdx + 3] = 255
      }
    }
  }

  const lutTex = gl.createTexture()
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, lutTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lutW, lutH, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutPx)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  // Shader program
  function mkShader(type: number, src: string): WebGLShader {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    return sh
  }
  const vs = mkShader(gl.VERTEX_SHADER, VERT_SRC)
  const fs = mkShader(gl.FRAGMENT_SHADER, buildFragSrc(lutSize))
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.useProgram(prog)

  gl.uniform1i(gl.getUniformLocation(prog, 'u_image'), 0)
  gl.uniform1i(gl.getUniformLocation(prog, 'u_lut'),   1)
  gl.uniform1f(gl.getUniformLocation(prog, 'u_sz'),    lutSize)

  // Fullscreen triangle pair
  const vbuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1,  1,
    -1,  1,  1, -1,   1,  1,
  ]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'a_position')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  // Offscreen framebuffer
  const outTex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, outTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  const fb = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTex, 0)

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, imgTex)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, lutTex)
  gl.viewport(0, 0, width, height)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  // Read back pixels (Y-flip handled in vertex shader v_texCoord)
  const result = new Uint8Array(width * height * 4)
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, result)

  for (let i = 0; i < data.length; i++) data[i] = result[i]

  gl.deleteTexture(imgTex)
  gl.deleteTexture(lutTex)
  gl.deleteTexture(outTex)
  gl.deleteFramebuffer(fb)
  gl.deleteProgram(prog)
  ;(gl as unknown as { endFrameEXP?: () => void }).endFrameEXP?.()
}

// ─── Procedural light leaks — pixel-level screen / multiply blend ─────────────

function applyFlare(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  flareType: FlareType,
): void {
  if (flareType === 'none') return

  for (let y = 0; y < height; y++) {
    const ny = y / height
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const nx = x / width

      let fr = 0, fg = 0, fb = 0

      if (flareType === 'leak_warm') {
        // Warm orange leak from top-left corner
        const dist = Math.sqrt(nx * nx + ny * ny)
        const intensity = Math.max(0, 1 - dist / 0.65)
        const glow = intensity * intensity * 0.55
        fr = 200 * glow
        fg = 140 * glow
        fb =  60 * glow

      } else if (flareType === 'leak_cool') {
        // Cool blue leak from bottom-right corner
        const dx = 1 - nx, dy = 1 - ny
        const dist = Math.sqrt(dx * dx + dy * dy)
        const intensity = Math.max(0, 1 - dist / 0.70)
        const glow = intensity * intensity * 0.45
        fr =  60 * glow
        fg = 100 * glow
        fb = 200 * glow

      } else if (flareType === 'edge_burn') {
        // Dark vignette via multiply blend — different from the screen cases
        const cx = nx - 0.5, cy = ny - 0.5
        const dist = Math.sqrt(cx * cx + cy * cy)
        const t = Math.max(0, (dist - 0.30) / 0.22)
        const burn = t * t * 0.75
        data[idx]     = clamp(data[idx]     * (1 - burn))
        data[idx + 1] = clamp(data[idx + 1] * (1 - burn * 0.85))
        data[idx + 2] = clamp(data[idx + 2] * (1 - burn * 0.70))
        continue  // multiply done; skip screen blend below

      } else if (flareType === 'streak') {
        // Thin horizontal light band across mid-frame
        const bandY = Math.abs(ny - 0.48)
        const intensity = Math.max(0, 1 - bandY / 0.06) * 0.18
        fr = 210 * intensity
        fg = 180 * intensity
        fb = 130 * intensity
      }

      // Screen blend: result = 255 - (255-src)*(255-flare)/255
      data[idx]     = clamp(255 - (255 - data[idx])     * (255 - fr) / 255)
      data[idx + 1] = clamp(255 - (255 - data[idx + 1]) * (255 - fg) / 255)
      data[idx + 2] = clamp(255 - (255 - data[idx + 2]) * (255 - fb) / 255)
    }
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function processPhoto(
  sourceUri: string,
  preset: FilmPreset,
  flareType: FlareType = 'none',
): Promise<string> {
  const { data, width, height } = await readImagePixels(sourceUri)

  // 1. Algorithmic preset (pixel math — before LUT)
  if (preset.algoType) {
    applyAlgo(data, preset.algoType)
  }

  // 2. Film grain (pixel math)
  if (preset.grain.intensity > 0.001) {
    applyGrain(data, width, height, preset.grain)
  }

  // 3. LUT colour grade (GPU via expo-gl headless — skipped if unavailable)
  if (preset.cube) {
    await applyLUT(data, width, height, preset.cube)
  }

  // 4. Light leak / flare (pixel math — always last)
  if (flareType !== 'none') {
    applyFlare(data, width, height, flareType)
  }

  return writeImagePixels(data, width, height)
}
