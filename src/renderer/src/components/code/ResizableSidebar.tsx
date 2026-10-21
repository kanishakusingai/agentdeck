import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { cn } from '../../lib/cn'
import { clampSidebarWidth, maxSidebarWidth, SIDEBAR_WIDTH } from '../../lib/sidebar'
import { setSidebarWidth, useApp } from '../../lib/store'
import { Sidebar } from './Sidebar'

function useWindowWidth(): number {
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

/** The right sidebar with a drag handle on its left edge (double-click it to reset the size). */
export function ResizableSidebar() {
  const saved = useApp((s) => s.snapshot!.ui.sidebarWidth ?? SIDEBAR_WIDTH.default)
  const railOpen = useApp((s) => s.snapshot!.ui.railOpen !== false)
  const max = maxSidebarWidth(useWindowWidth(), railOpen)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  // The live drag lives in a ref so letting go always saves exactly where the mouse stopped.
  const drag = useRef<{ x: number; start: number; width: number } | null>(null)
  const width = clampSidebarWidth(dragWidth ?? saved, max)

  const onDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, start: width, width }
    setDragWidth(width)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    // Dragging left makes the sidebar wider.
    d.width = clampSidebarWidth(d.start + (d.x - e.clientX), max)
    setDragWidth(d.width)
  }
  const onUp = (): void => {
    const d = drag.current
    drag.current = null
    setDragWidth(null)
    // A plain click (no movement) saves nothing.
    if (d && d.width !== d.start) setSidebarWidth(d.width)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const step = e.shiftKey ? 80 : 20
    if (e.key === 'ArrowLeft') setSidebarWidth(clampSidebarWidth(width + step, max))
    else if (e.key === 'ArrowRight') setSidebarWidth(clampSidebarWidth(width - step, max))
    else return
    e.preventDefault()
  }

  return (
    <div className="relative shrink-0" style={{ width }} data-testid="sidebar">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={SIDEBAR_WIDTH.min}
        aria-valuemax={max}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => setSidebarWidth(SIDEBAR_WIDTH.default)}
        onKeyDown={onKey}
        className="group absolute -left-2 top-0 bottom-0 z-10 flex w-2 cursor-col-resize justify-center outline-none"
        data-testid="sidebar-resizer"
      >
        <span className={cn('my-3 w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-accent/70 group-focus-visible:bg-accent', dragWidth !== null && 'bg-accent')} />
      </div>
      <div className="card h-full overflow-hidden">
        <Sidebar />
      </div>
      {/* While dragging, a cover stops the browser and terminals from grabbing the mouse. */}
      {dragWidth !== null && <div className="fixed inset-0 z-[70] cursor-col-resize" />}
    </div>
  )
}
