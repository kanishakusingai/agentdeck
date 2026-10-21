import type { SerializedDockview } from 'dockview-react'

export interface PanelState {
  id: string
  contentComponent: string
  title: string
  params: Record<string, unknown>
  renderer?: 'always' | 'onlyWhenVisible'
}

/** Columns for an even grid of `n` tiles: up to three in one row, then a near-square grid. */
export function gridColumns(n: number): number {
  return n <= 3 ? Math.max(1, n) : Math.ceil(Math.sqrt(n))
}

/** The parts of dockview's serialised grid that placement needs. */
export type GridNodeShape = { type: 'leaf'; data: { id: string } } | { type: 'branch'; data: GridNodeShape[] }
export interface GridShape {
  orientation: 'HORIZONTAL' | 'VERTICAL' | string
  root: GridNodeShape
}

/** Group ids row by row, or null when the canvas isn't a plain rows-of-tiles grid. */
function gridRows(grid: GridShape): string[][] | null {
  const { root } = grid
  if (root.type === 'leaf') return [[root.data.id]]
  const leaves = (nodes: GridNodeShape[]): string[] | null =>
    nodes.every((n) => n.type === 'leaf') ? nodes.map((n) => (n as { data: { id: string } }).data.id) : null
  if (root.data.length === 0) return []
  if (grid.orientation === 'HORIZONTAL') {
    const row = leaves(root.data)
    return row ? [row] : null
  }
  const rows: string[][] = []
  for (const child of root.data) {
    const row = child.type === 'leaf' ? [child.data.id] : leaves(child.data)
    if (!row) return null
    rows.push(row)
  }
  return rows
}

function isCanonical(rows: string[][]): boolean {
  const count = rows.reduce((n, r) => n + r.length, 0)
  const cols = gridColumns(count)
  return rows.every((r, i) => (i < rows.length - 1 ? r.length === cols : r.length >= 1 && r.length <= cols))
}

/** True when the canvas is laid out exactly like Tidy would lay it out. */
export function isEvenGrid(grid: GridShape): boolean {
  const rows = gridRows(grid)
  return rows !== null && isCanonical(rows)
}

export type AddPlan = { kind: 'first' } | { kind: 'right'; groupId: string } | { kind: 'below' } | { kind: 'retile' }

/**
 * Where a new pane goes so every tile stays the same size: next to the last
 * tile while the bottom row has room, a new row when it's full, or a full
 * re-tile when the number of columns changes or the canvas was split by hand.
 */
export function planAdd(grid: GridShape | undefined): AddPlan {
  if (!grid) return { kind: 'first' }
  const rows = gridRows(grid)
  if (!rows || !isCanonical(rows)) return { kind: 'retile' }
  const count = rows.reduce((n, r) => n + r.length, 0)
  if (count === 0) return { kind: 'first' }
  const last = rows[rows.length - 1]
  const lastId = last[last.length - 1]
  if (rows.length === 1 && count + 1 <= 3) return { kind: 'right', groupId: lastId }
  const cols = gridColumns(count + 1)
  if (cols !== gridColumns(count)) return { kind: 'retile' }
  return last.length < cols ? { kind: 'right', groupId: lastId } : { kind: 'below' }
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
  const cols = gridColumns(tiles)
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
