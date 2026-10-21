import { describe, expect, it } from 'vitest'
import { buildGridLayout, gridColumns, isEvenGrid, planAdd, type GridNodeShape, type PanelState } from './layout'

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

  it('Tidy puts three panes side by side so they are all the same size', () => {
    expect(rows(buildGridLayout(p.slice(0, 3), { width: 1000, height: 800 }))).toEqual([[['a'], ['b'], ['c']]])
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

describe('gridColumns', () => {
  it('keeps up to three panes in one row, then grows a near-square grid', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9, 10].map(gridColumns)).toEqual([1, 2, 3, 2, 3, 3, 3, 3, 4])
  })
})

describe('planAdd', () => {
  const leaf = (id: string) => ({ type: 'leaf' as const, data: { id } })
  const branch = (...data: GridNodeShape[]) => ({ type: 'branch' as const, data })
  const grid = (orientation: 'HORIZONTAL' | 'VERTICAL', root: GridNodeShape) => ({ orientation, root })

  it('opens the first pane anywhere', () => {
    expect(planAdd(undefined)).toEqual({ kind: 'first' })
    expect(planAdd(grid('HORIZONTAL', branch()))).toEqual({ kind: 'first' })
  })

  it('adds to the right of the last pane while the row has room', () => {
    expect(planAdd(grid('HORIZONTAL', leaf('a')))).toEqual({ kind: 'right', groupId: 'a' })
    expect(planAdd(grid('HORIZONTAL', branch(leaf('a'), leaf('b'))))).toEqual({ kind: 'right', groupId: 'b' })
    // 4 panes in 2×2 → the 5th needs 3 columns: everything is re-tiled.
    expect(planAdd(grid('VERTICAL', branch(branch(leaf('a'), leaf('b')), branch(leaf('c'), leaf('d')))))).toEqual({ kind: 'retile' })
    // 5 panes (3 + 2) → the 6th fills the bottom row.
    expect(planAdd(grid('VERTICAL', branch(branch(leaf('a'), leaf('b'), leaf('c')), branch(leaf('d'), leaf('e')))))).toEqual({
      kind: 'right',
      groupId: 'e'
    })
  })

  it('starts a new row when the last row is full', () => {
    // 6 panes (3 + 3) → the 7th starts a third row.
    const six = grid('VERTICAL', branch(branch(leaf('a'), leaf('b'), leaf('c')), branch(leaf('d'), leaf('e'), leaf('f'))))
    expect(planAdd(six)).toEqual({ kind: 'below' })
  })

  it('re-tiles a canvas the user split by hand', () => {
    const nested = grid('HORIZONTAL', branch(leaf('a'), branch(leaf('b'), leaf('c'))))
    expect(planAdd(nested)).toEqual({ kind: 'retile' })
  })
})

describe('isEvenGrid', () => {
  const leaf = (id: string) => ({ type: 'leaf' as const, data: { id } })
  const branch = (...data: GridNodeShape[]) => ({ type: 'branch' as const, data })

  it('accepts the shape Tidy would build and rejects others', () => {
    expect(isEvenGrid({ orientation: 'HORIZONTAL', root: branch(leaf('a'), leaf('b')) })).toBe(true)
    expect(isEvenGrid({ orientation: 'VERTICAL', root: branch(leaf('a'), leaf('b')) })).toBe(false)
    expect(isEvenGrid({ orientation: 'VERTICAL', root: branch(branch(leaf('a'), leaf('b')), leaf('c')) })).toBe(false)
  })
})
