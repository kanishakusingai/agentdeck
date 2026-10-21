import type { SidebarBrowser } from '@shared/types'

// ---------- browser tabs in the right sidebar ----------

/** The sidebar's first browser tab: always there, can't be closed. */
export const MAIN_BROWSER = 'main'
export const DEFAULT_BROWSERS: SidebarBrowser[] = [{ id: MAIN_BROWSER, n: 1 }]

/** "Browser", "Browser 2", … — the number is fixed when the tab is made, so closing one never renames the others. */
export function browserLabel(b: SidebarBrowser): string {
  return b.n === 1 ? 'Browser' : `Browser ${b.n}`
}

export function addBrowser(list: SidebarBrowser[], id: string): SidebarBrowser[] {
  const n = Math.max(0, ...list.map((b) => b.n)) + 1
  return [...list, { id, n }]
}

export function closeBrowser(list: SidebarBrowser[], id: string): SidebarBrowser[] {
  return id === MAIN_BROWSER ? list : list.filter((b) => b.id !== id)
}

/** The tab to show after closing `id`: unchanged, unless `id` was showing — then its left neighbour. */
export function shownAfterClose(list: SidebarBrowser[], shown: string, id: string): string {
  if (shown !== id || id === MAIN_BROWSER) return shown
  const i = list.findIndex((b) => b.id === id)
  return list[i - 1]?.id ?? MAIN_BROWSER
}

export function withUrl(list: SidebarBrowser[], id: string, url: string): SidebarBrowser[] {
  return list.map((b) => (b.id === id ? { ...b, url } : b))
}

// ---------- sidebar width ----------

export const SIDEBAR_WIDTH = { min: 280, default: 340 }
/** Width of the left rail (workspaces and their sessions). */
export const RAIL_WIDTH = 264
/** The page's side padding and the gaps between rail, panes and sidebar. */
const GAP = 8
/** Always leave at least this much room for the panes in the middle. */
export const MIN_CANVAS = 480

/** The widest the sidebar may get in a window this wide, with or without the left rail showing. */
export function maxSidebarWidth(windowWidth: number, railOpen: boolean): number {
  // padding left + padding right + gap before the sidebar, and the rail plus its gap when shown
  const chrome = GAP * 3 + (railOpen ? RAIL_WIDTH + GAP : 0)
  return Math.max(SIDEBAR_WIDTH.min, windowWidth - chrome - MIN_CANVAS)
}

export function clampSidebarWidth(width: number, max: number): number {
  return Math.round(Math.min(max, Math.max(SIDEBAR_WIDTH.min, width)))
}
