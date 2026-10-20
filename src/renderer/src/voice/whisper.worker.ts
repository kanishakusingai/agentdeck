/// <reference lib="webworker" />
// Runs Whisper speech-to-text on this machine. Audio never leaves the computer;
// only the model files are downloaded once from Hugging Face and then cached.
import { env, pipeline } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true

type Transcriber = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>

let loading: Promise<Transcriber> | null = null
let loadedModel = ''

const post = (msg: unknown): void => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg)

function load(model: string): Promise<Transcriber> {
  if (loading && loadedModel === model) return loading
  loadedModel = model
  loading = pipeline('automatic-speech-recognition', model, {
    device: 'wasm',
    progress_callback: (p: unknown) => post({ type: 'progress', data: p })
  }).then((t) => {
    post({ type: 'ready', model })
    return t as unknown as Transcriber
  })
  loading.catch(() => {
    loading = null
  })
  return loading
}

self.onmessage = async (e: MessageEvent) => {
  const { type, id, model, audio } = e.data as { type: string; id?: number; model: string; audio?: Float32Array }
  try {
    const transcriber = await load(model)
    if (type === 'transcribe' && audio) {
      const out = await transcriber(audio, { chunk_length_s: 30, stride_length_s: 5 })
      const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim()
      post({ type: 'result', id, text })
    }
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}
