import type { AgentDeckApi } from '../shared/api'

declare global {
  interface Window {
    api: AgentDeckApi
  }
}

export {}
