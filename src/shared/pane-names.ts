/** Agent panes get a person's name (like teammates), so several agents in one project are easy to tell apart. */
export const PANE_NAMES = ['Matthew', 'John', 'Cynthia', 'Andy', 'Sarah', 'David', 'Emma', 'James', 'Olivia', 'Liam', 'Mia', 'Noah', 'Ava', 'Lucas', 'Zoe', 'Ethan']

/**
 * The title for a new pane, given the titles already used in its project.
 * - `wanted`: a name the pane already had (a restored layout, a rename) — kept as it is.
 * - agent panes: the first free name from PANE_NAMES.
 * - everything else ("Terminal", "Sign in · Work"): numbered when taken — "Terminal 2", "Terminal 3", …
 */
export function paneTitle(opts: { base: string; agent: boolean; taken: Iterable<string>; wanted?: string }): string {
  const wanted = opts.wanted?.trim().slice(0, 40)
  if (wanted) return wanted
  const taken = new Set(opts.taken)
  if (opts.agent) {
    const free = PANE_NAMES.find((n) => !taken.has(n))
    if (free) return free
  }
  if (!taken.has(opts.base)) return opts.base
  let n = 2
  while (taken.has(`${opts.base} ${n}`)) n++
  return `${opts.base} ${n}`
}
