import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { type AppData, DEFAULT_SETTINGS, DEFAULT_UI, emptyAppData } from '@shared/types'

const FILE_NAME = 'agentdeck-data.json'

/**
 * Tiny persistent store: one JSON file in the app's data folder.
 * Writes are debounced and atomic (write temp file, then rename).
 */
export class JsonStore {
  private data: AppData
  private readonly file: string
  private timer: NodeJS.Timeout | undefined

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, FILE_NAME)
    this.data = this.load()
  }

  get<K extends keyof AppData>(key: K): AppData[K] {
    return this.data[key]
  }

  set<K extends keyof AppData>(key: K, value: AppData[K]): void {
    this.data[key] = value
    this.scheduleSave()
  }

  update<K extends keyof AppData>(key: K, fn: (current: AppData[K]) => AppData[K]): AppData[K] {
    const next = fn(this.data[key])
    this.set(key, next)
    return next
  }

  snapshot(): AppData {
    return structuredClone(this.data)
  }

  /** Write pending changes to disk immediately. */
  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    renameSync(tmp, this.file)
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 250)
  }

  private load(): AppData {
    const base = emptyAppData()
    if (!existsSync(this.file)) return base
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppData>
      return {
        ...base,
        ...raw,
        settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
        ui: { ...DEFAULT_UI, ...(raw.ui ?? {}) }
      }
    } catch {
      // Keep the broken file for inspection and start fresh.
      try {
        renameSync(this.file, `${this.file}.broken-${Date.now()}`)
      } catch {
        /* ignore */
      }
      return base
    }
  }
}
