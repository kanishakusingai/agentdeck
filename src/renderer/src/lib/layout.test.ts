import { describe, expect, it } from 'vitest'
import { buildGridLayout, type PanelState } from './layout'

const panel = (id: string): PanelState => ({ id, contentComponent: 'terminal', title: id, params: {} })
const p = ['a', 'b', 'c', 'd'].map(panel)

type Node = { type: string; data: unknown; size?: number }
const rows = (layout: ReturnType<typeof buildGridLayout>): string[][][] =>
  (layout.grid.root.data as Node[]).map((row) => (row.data as Node[]).map((leaf) => (leaf.data as { views: string[] }).views))

describe('buildGridLayout', () => {
  it('Tidy puts four panes in an even 2×2 grid', () => {
    const layout = buildGridLayout(p, { width: 1000, height: 800 })
    expect(rows(layout)).toEqual([[['a'], ['b']], [['c'], ['d']]])
    const [row1] = layout.grid.root.data as Node[]
    expect(row1.size).toBe(400)
    expect((row1.data as Node[]).map((l) => l.size)).toEqual([500, 500])
  })

  it('Tidy puts three panes in two rows, the last one full width', () => {
    expect(rows(buildGridLayout(p.slice(0, 3), { width: 1000, height: 800 }))).toEqual([[['a'], ['b']], [['c']]])
  })

  it('the single preset stacks every pane as tabs in one tile', () => {
    expect(rows(buildGridLayout(p.slice(0, 3), { tiles: 1, width: 1000, height: 800 }))).toEqual([[['a', 'b', 'c']]])
  })

  it('the 2-up preset shares panes between two tiles side by side', () => {
    expect(rows(buildGridLayout(p.slice(0, 3), { tiles: 2, width: 1000, height: 800 }))).toEqual([[['a', 'c'], ['b']]])
  })

  it('keeps every pane and its parameters', () => {
    const withParams = [{ ...panel('t1'), params: { ptyId: 'x' } }]
    expect(buildGridLayout(withParams, { width: 10, height: 10 }).panels.t1).toMatchObject({ params: { ptyId: 'x' } })
  })
})
