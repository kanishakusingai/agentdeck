import { create } from 'zustand'
import { activeTerminalPtyId } from '../lib/canvas'
import { writePty } from '../lib/pty-bus'
import { settings, toast } from '../lib/store'
import { initialPtt, pttReducer, type PttEvent, type PttState } from './ptt'

interface VoiceState {
  ptt: PttState
  /** 0–100 while the speech model downloads, null when idle/ready. */
  modelProgress: number | null
  modelReady: boolean
}

export const useVoice = create<VoiceState>(() => ({ ptt: initialPtt, modelProgress: null, modelReady: false }))

const dispatch = (event: PttEvent): void => useVoice.setState((s) => ({ ptt: pttReducer(s.ptt, event) }))

// ---------- Whisper worker ----------

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>()
const fileProgress = new Map<string, { loaded: number; total: number }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data as { type: string; id?: number; text?: string; message?: string; data?: Record<string, unknown> }
    if (msg.type === 'progress' && msg.data) {
      const d = msg.data
      if (d.status === 'progress' && typeof d.file === 'string') {
        fileProgress.set(d.file, { loaded: Number(d.loaded ?? 0), total: Number(d.total ?? 0) })
        let loaded = 0
        let total = 0
        for (const f of fileProgress.values()) {
          loaded += f.loaded
          total += f.total
        }
        if (total > 0) useVoice.setState({ modelProgress: Math.min(99, Math.round((loaded / total) * 100)) })
      }
    } else if (msg.type === 'ready') {
      useVoice.setState({ modelProgress: null, modelReady: true })
    } else if (msg.type === 'result' && msg.id !== undefined) {
      pending.get(msg.id)?.resolve(msg.text ?? '')
      pending.delete(msg.id)
    } else if (msg.type === 'error') {
      useVoice.setState({ modelProgress: null })
      if (msg.id !== undefined) {
        pending.get(msg.id)?.reject(new Error(msg.message))
        pending.delete(msg.id)
      } else {
        toast(`Speech model failed to load: ${msg.message}`, 'error')
      }
    }
  }
  return worker
}

export function preloadModel(): void {
  if (!useVoice.getState().modelReady && useVoice.getState().modelProgress === null) {
    useVoice.setState({ modelProgress: 0 })
  }
  getWorker().postMessage({ type: 'load', model: settings().whisperModel })
}

function transcribe(audio: Float32Array): Promise<string> {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    if (!useVoice.getState().modelReady && useVoice.getState().modelProgress === null) useVoice.setState({ modelProgress: 0 })
    getWorker().postMessage({ type: 'transcribe', id, model: settings().whisperModel, audio }, [audio.buffer])
  })
}

// ---------- recording ----------

let recorder: MediaRecorder | null = null
let chunks: Blob[] = []
let target: Element | null = null

async function startRecording(): Promise<void> {
  target = document.activeElement
  dispatch({ type: 'keyDown', at: Date.now() })
  if (useVoice.getState().ptt.phase !== 'recording') return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    })
    // The key may already be released while the mic was opening: nothing to transcribe.
    if (useVoice.getState().ptt.phase !== 'recording') {
      stream.getTracks().forEach((t) => t.stop())
      dispatch({ type: 'cancelled' })
      toast('Hold the key while you speak — the microphone needs a moment to start.')
      return
    }
    chunks = []
    recorder = new MediaRecorder(stream)
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    recorder.start()
  } catch {
    dispatch({ type: 'failed', message: 'Microphone unavailable. Check Windows Settings → Privacy → Microphone.' })
  }
}

async function stopRecording(): Promise<void> {
  dispatch({ type: 'keyUp', at: Date.now() })
  const rec = recorder
  recorder = null
  if (!rec) return
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()))
  rec.stop()
  rec.stream.getTracks().forEach((t) => t.stop())
  await stopped
  if (useVoice.getState().ptt.phase !== 'transcribing') return
  try {
    const blob = new Blob(chunks, { type: rec.mimeType })
    const ctx = new AudioContext({ sampleRate: 16000 })
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const audio = new Float32Array(decoded.getChannelData(0))
    void ctx.close()
    const text = await transcribe(audio)
    dispatch({ type: 'transcribed', text })
    if (text) insertText(text, target)
    else toast("Didn't catch that — try holding the key a little longer.")
  } catch (err) {
    dispatch({ type: 'failed', message: err instanceof Error ? err.message : 'Transcription failed.' })
  }
}

export function toggleRecording(): void {
  if (useVoice.getState().ptt.phase === 'recording') void stopRecording()
  else void startRecording()
}

// ---------- inserting text where the user is working ----------

function insertIntoField(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const before = el.value.slice(0, start)
  const spacer = before && !/\s$/.test(before) ? ' ' : ''
  const next = before + spacer + text + el.value.slice(end)
  // Use the native setter so React notices the change.
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  const caret = (before + spacer + text).length
  el.setSelectionRange(caret, caret)
  el.focus()
}

export function insertText(text: string, el: Element | null): void {
  // A real text field gets the text; xterm's hidden input does not (the terminal does).
  const isXterm = el instanceof HTMLElement && el.classList.contains('xterm-helper-textarea')
  if (!isXterm && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && /^(text|search|url|)$/.test(el.type)))) {
    insertIntoField(el, text)
    return
  }
  const pane = el?.closest('[data-pty-id]')
  if (pane) {
    writePty(pane.getAttribute('data-pty-id')!, text)
    return
  }
  const ptyId = activeTerminalPtyId()
  if (ptyId) return writePty(ptyId, text)
  void navigator.clipboard.writeText(text)
  toast('Dictated text copied to the clipboard.')
}

// ---------- hold-to-talk key ----------

export function installPushToTalk(): () => void {
  const isKey = (e: KeyboardEvent): boolean => e.code === settings().pushToTalkKey
  const down = (e: KeyboardEvent): void => {
    if (!isKey(e)) return
    e.preventDefault()
    e.stopPropagation()
    if (!e.repeat) void startRecording()
  }
  const up = (e: KeyboardEvent): void => {
    if (!isKey(e)) return
    e.preventDefault()
    e.stopPropagation()
    if (useVoice.getState().ptt.phase === 'recording') void stopRecording()
  }
  const blur = (): void => {
    if (useVoice.getState().ptt.phase === 'recording') void stopRecording()
  }
  // Capture phase so terminals never see the key.
  window.addEventListener('keydown', down, true)
  window.addEventListener('keyup', up, true)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', down, true)
    window.removeEventListener('keyup', up, true)
    window.removeEventListener('blur', blur)
  }
}
