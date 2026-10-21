/**
 * Reading an agent's screen: the slash-command menu it is showing and the text in
 * its input line. Works from what is drawn, so the box offers exactly the commands
 * the agent itself offers (its built-ins, the user's own commands, skills, plugins).
 */

export interface ScreenRow {
  /** The row as shown. */
  text: string
  /** The row with faint text (placeholders, ghost suggestions) blanked out. */
  solid: string
  /** How the row's first visible character is drawn (colour, bold, inverse) — tells the highlighted item from the rest. */
  style: string
}

export interface MenuItem {
  /** The command as typed, e.g. "/compact" or "/code status". */
  name: string
  /** Another name the agent shows in brackets, e.g. Claude's "/usage (cost)". */
  alias?: string
  description: string
}

export interface TerminalMenu {
  items: MenuItem[]
  /** Index of the row the agent has highlighted, or -1 if it can't be told. */
  highlighted: number
  /** Items the agent says it has beyond the visible ones ("(+75 more)"). */
  more: number
}

const MARKS = '❯›>▶►'
const ITEM = new RegExp(`^\\s{0,4}(?:([${MARKS}])\\s+)?(\\/[^\\s/]+(?: [^\\s/(][^\\s/]*)*)(?: \\(([^)]+)\\))?\\s{2,}(\\S.*?)\\s*$`, 'u')
const SUB = new RegExp(`^\\s{0,2}(?:([${MARKS}])\\s+|\\s{2})([a-z][\\w-]*)\\s{2,}(\\S.*?)\\s*$`, 'u')
const CONTINUED = /^\s{8,}(\S.*?)\s*$/u
const MORE = /^\s*[([]?\s*(?:\+|↓\s*)?(\d+)\s+more\b/u
const PROMPT_END = /[>›❯$#%:»]\s*$/u

const trimEnd = (s: string): string => s.replace(/[\s│┃|]+$/u, '')

interface Parsed {
  item: MenuItem
  marked: boolean
  style: string
}

interface Block {
  start: number
  end: number
  rows: Parsed[]
  more: number
}

function blocks(rows: ScreenRow[], pattern: RegExp, name: (m: RegExpExecArray) => MenuItem): Block[] {
  const found: Block[] = []
  let current: Block | null = null
  rows.forEach((row, i) => {
    const m = pattern.exec(row.text)
    if (m) {
      if (!current) found.push((current = { start: i, end: i, rows: [], more: 0 }))
      current.rows.push({ item: name(m), marked: Boolean(m[1]), style: row.style })
      current.end = i
      return
    }
    const more = current && !current.more ? CONTINUED.exec(row.text) : null
    if (current && more) {
      const last = current.rows[current.rows.length - 1].item
      last.description = `${last.description} ${more[1]}`
      current.end = i
      return
    }
    const count = current ? MORE.exec(row.text) : null
    if (current && count) current.more = Number(count[1])
    current = null
  })
  return found
}

/** The highlighted row: the one with a marker, else the only one drawn differently from the rest. */
function highlight(rows: Parsed[]): number {
  const marked = rows.findIndex((r) => r.marked)
  if (marked >= 0) return marked
  if (rows.length < 2) return -1
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.style, (counts.get(r.style) ?? 0) + 1)
  if (counts.size !== 2) return -1
  return rows.findIndex((r) => counts.get(r.style) === 1)
}

/** Bottom-most row that shows `typed` right after a prompt. */
function promptRow(rows: ScreenRow[], typed: string): { row: number; prompt: string } | null {
  const want = typed.trimEnd()
  if (!want) return null
  for (let i = rows.length - 1; i >= 0; i--) {
    const line = trimEnd(rows[i].solid)
    if (!line.endsWith(want)) continue
    const prompt = rows[i].solid.slice(0, line.length - want.length)
    if (prompt.length > 0 && prompt.length <= 80 && PROMPT_END.test(prompt)) return { row: i, prompt }
  }
  return null
}

/** The prompt drawn in front of the input line (e.g. "› ", "PS C:\\> "), found by where `typed` appears. */
export function findPrompt(rows: ScreenRow[], typed: string): string | null {
  return promptRow(rows, typed)?.prompt ?? null
}

/** The slash-command menu the terminal is showing for what was typed, or null if there is none. */
export function readSlashMenu(rows: ScreenRow[], typed: string): TerminalMenu | null {
  const input = promptRow(rows, typed)?.row
  const all = blocks(rows, ITEM, (m) => ({ name: m[2], ...(m[3] ? { alias: m[3] } : {}), description: m[4] }))
  let chosen: Block | undefined
  if (input === undefined) chosen = all[all.length - 1]
  else {
    const gap = (b: Block): number => (b.start > input ? b.start - input - 1 : input - b.end - 1)
    chosen = all.filter((b) => gap(b) >= 0 && gap(b) <= 2).sort((a, b) => gap(a) - gap(b))[0]
    // A command's own sub-commands (Kiro after Tab) are listed right under the input, without "/".
    if (!chosen && typed.startsWith('/')) {
      const parent = typed.trim()
      chosen = blocks(rows, SUB, (m) => ({ name: `${parent} ${m[2]}`, description: m[3] })).find((b) => b.start === input + 1)
    }
  }
  if (!chosen) return null
  return { items: chosen.rows.map((r) => r.item), highlighted: highlight(chosen.rows), more: chosen.more }
}

/**
 * What the input line holds, read from the screen: the lowest row starting with `prompt`,
 * without faint placeholder text. Null when it can't be read safely (no such row, or the
 * text may continue on the next row).
 */
export function readInputLine(rows: ScreenRow[], prompt: string, cols: number): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    // Screen rows lose trailing blanks, so an empty line can show as the prompt minus its space.
    if (!row.solid.startsWith(prompt)) {
      if (prompt.trimEnd() && row.solid.trimEnd() === prompt.trimEnd()) return ''
      continue
    }
    if (row.solid.trimEnd().length >= cols - 1) return null
    return trimEnd(row.solid.slice(prompt.length))
  }
  return null
}
