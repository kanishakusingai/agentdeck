import type { SerializedDockview } from 'dockview-react'

export interface PanelState {
  id: string
  contentComponent: string
  title: string
  params: Record<string, unknown>
  renderer?: 'always' | 'onlyWhenVisible'
}

/**
 * Build an evenly sized grid layout for the given panels.
 * `tiles` = how many tiles to show (presets); default is one tile per panel (Tidy).
 * Extra panels share tiles as tabs, round-robin.
 */
export function buildGridLayout(
  panels: PanelState[],
  opts: { tiles?: number; width: number; height: number }
): SerializedDockview {
  const tiles = Math.max(1, Math.min(opts.tiles ?? panels.length, panels.length || 1))
  const cols = tiles <= 2 ? tiles : Math.ceil(Math.sqrt(tiles))
  const rowCount = Math.ceil(tiles / cols)

  const groups: string[][] = Array.from({ length: tiles }, () => [])
  panels.forEach((p, i) => groups[i % tiles].push(p.id))

  const rowNodes = Array.from({ length: rowCount }, (_, r) => {
    const inRow = groups.slice(r * cols, r * cols + cols)
    return {
      type: 'branch' as const,
      size: opts.height / rowCount,
      data: inRow.map((views, c) => ({
        type: 'leaf' as const,
        size: opts.width / inRow.length,
        data: { views, activeView: views[0], id: `tile-${r}-${c}` }
      }))
    }
  })

  return {
    grid: {
      root: { type: 'branch', size: opts.width, data: rowNodes },
      width: opts.width,
      height: opts.height,
      orientation: 'VERTICAL' as SerializedDockview['grid']['orientation']
    },
    panels: Object.fromEntries(
      panels.map((p) => [
        p.id,
        { id: p.id, contentComponent: p.contentComponent, title: p.title, params: p.params, renderer: p.renderer }
      ])
    ),
    activeGroup: 'tile-0-0'
  }
}
