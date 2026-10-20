// Push-to-talk state machine: hold a key to record, release to transcribe.

export type PttState =
  | { phase: 'idle'; lastText?: string }
  | { phase: 'recording'; startedAt: number }
  | { phase: 'transcribing' }
  | { phase: 'error'; message: string }

export type PttEvent =
  | { type: 'keyDown'; at: number }
  | { type: 'keyUp'; at: number }
  | { type: 'transcribed'; text: string }
  | { type: 'failed'; message: string }
  /** Nothing was captured (e.g. released before the microphone opened). */
  | { type: 'cancelled' }

/** Shorter presses are treated as accidental taps. */
export const MIN_RECORDING_MS = 300

export const initialPtt: PttState = { phase: 'idle' }

export function pttReducer(state: PttState, event: PttEvent): PttState {
  switch (event.type) {
    case 'keyDown':
      return state.phase === 'idle' || state.phase === 'error' ? { phase: 'recording', startedAt: event.at } : state
    case 'keyUp':
      if (state.phase !== 'recording') return state
      return event.at - state.startedAt < MIN_RECORDING_MS ? { phase: 'idle' } : { phase: 'transcribing' }
    case 'transcribed':
      return state.phase === 'transcribing' ? { phase: 'idle', lastText: event.text } : state
    case 'failed':
      return { phase: 'error', message: event.message }
    case 'cancelled':
      return { phase: 'idle' }
  }
}
