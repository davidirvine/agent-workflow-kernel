import { FaustMonoDspGenerator } from '@grame/faustwasm'
import { buildNoteOnMessages } from './keyboard.js'

const PARAM_PREFIX = '/synth/'

/** @type {AudioContext | null} */
let ctx = null
/** @type {any} */
let node = null
/** @type {AnalyserNode | null} */
let analyserNode = null
let active = false
let mixerPeakValue = 0
let outputPeakValue = 0

export async function powerOn() {
  ctx = new AudioContext({ sampleRate: 48000 })
  analyserNode = ctx.createAnalyser()
  analyserNode.fftSize = 2048
  // Expose for Playwright smoke tests
  if (typeof window !== 'undefined') window.__audioCtx = ctx
  await ctx.resume()

  const base = import.meta.env.BASE_URL
  const dspMeta = await (await fetch(`${base}dsp-meta.json`)).json()
  const dspModule = await WebAssembly.compileStreaming(await fetch(`${base}dsp-module.wasm`))

  const generator = new FaustMonoDspGenerator()
  node = await generator.createNode(ctx, 'synth', {
    module: dspModule,
    json: JSON.stringify(dspMeta),
    soundfiles: {},
  })
  if (!node) throw new Error('Faust node creation failed')
  node.setOutputParamHandler((/** @type {string} */ path, /** @type {number} */ value) => {
    if (path === PARAM_PREFIX + 'mixerPeak') mixerPeakValue = value
    if (path === PARAM_PREFIX + 'outputPeak') outputPeakValue = value
  })
  node.connect(analyserNode)
  analyserNode.connect(ctx.destination)
}

export async function powerOff() {
  if (!ctx) return
  mixerPeakValue = 0
  outputPeakValue = 0
  if (node) {
    node.disconnect()
    node = null
  }
  await ctx.close()
  ctx = null
  analyserNode = null
}

/**
 * @param {string} name
 * @param {number} value
 */
export function setParam(name, value) {
  if (!node) return
  if (!Number.isFinite(value)) return
  node.setParamValue(PARAM_PREFIX + name, value)
}

/**
 * @param {number} freq
 */
export function noteOn(freq) {
  if (!node) return
  const messages = buildNoteOnMessages(freq, active)
  for (const msg of messages) {
    setParam(msg.param, msg.value)
  }
  active = true
}

export function noteOff() {
  if (!node) return
  setParam('gate', 0)
  active = false
}

export function getAnalyser() {
  return analyserNode
}

export function getMixerPeak() {
  return mixerPeakValue
}

export function getOutputPeak() {
  return outputPeakValue
}
