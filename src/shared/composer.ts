/**
 * Pure helpers for the per-pane message box: spotting "/" and "@" triggers,
 * ranking file suggestions and inserting the chosen one. (Slash commands are read
 * from the terminal itself: see terminal-screen.ts.)
 */

export interface Trigger {
  /** `command` = "/" at the very start, `file` = "@" at the start or after whitespace. */
  kind: 'command' | 'file'
  /** What the user typed after the trigger character. */
  query: string
  /** Index of the trigger character in the text. */
  start: number
}

/** Which suggestion list (if any) the text before the caret asks for. */
export function detectTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret)
  const command = /^\/([^\s/]*)$/.exec(before)
  if (command) return { kind: 'command', query: command[1], start: 0 }
  const file = /(^|\s)@([^\s@]*)$/.exec(before)
  if (file) return { kind: 'file', query: file[2], start: before.length - file[2].length - 1 }
  return null
}

/** Replace the trigger and its query with `insert`, followed by one space (unless `trailingSpace` is false). */
export function applySuggestion(
  text: string,
  caret: number,
  trigger: Trigger,
  insert: string,
  trailingSpace = true
): { text: string; caret: number } {
  const head = text.slice(0, trigger.start) + insert
  const tail = text.slice(caret)
  if (!trailingSpace) return { text: head + tail, caret: head.length }
  if (/^\s/.test(tail)) return { text: head + tail, caret: head.length + 1 }
  return { text: `${head} ${tail}`, caret: head.length + 1 }
}

/** File paths best-first: file name starts with the query, path starts with it, then anywhere. */
export function rankFiles(paths: readonly string[], query: string, limit = 50): string[] {
  const q = query.toLowerCase()
  if (!q) return paths.slice(0, limit)
  const buckets: string[][] = [[], [], [], []]
  for (const p of paths) {
    const lower = p.toLowerCase()
    const name = lower.replace(/\/$/, '').split('/').pop() ?? lower
    if (name.startsWith(q)) buckets[0].push(p)
    else if (lower.startsWith(q)) buckets[1].push(p)
    else if (name.includes(q)) buckets[2].push(p)
    else if (lower.includes(q)) buckets[3].push(p)
  }
  return buckets.flat().slice(0, limit)
}
