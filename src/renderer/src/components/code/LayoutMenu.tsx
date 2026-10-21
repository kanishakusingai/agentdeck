import { Columns2, Grid2x2, LayoutGrid, Square } from 'lucide-react'
import { MAX_PANES_PER_SESSION } from '@shared/types'
import { activeSessionId, arrange } from '../../lib/canvas'
import { useApp } from '../../lib/store'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tip } from '../ui'

/** The grid button in the title bar: arrange the panes of the session on screen. */
export function LayoutMenu() {
  const sessionId = useApp((s) => {
    void s.snapshot!.ui.activeSessions
    const wsId = s.snapshot!.ui.activeWorkspaceId
    return wsId ? activeSessionId(wsId) : undefined
  })
  const count = useApp((s) => (sessionId ? (s.panels[sessionId]?.length ?? 0) : 0))
  if (!sessionId) return null
  return (
    <Menu>
      <Tip label={`Layout · ${count} of ${MAX_PANES_PER_SESSION} panes in this session`}>
        <MenuTrigger asChild>
          <button
            aria-label="Layout"
            data-testid="layout-menu"
            className="no-drag flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg"
          >
            <LayoutGrid size={15} />
          </button>
        </MenuTrigger>
      </Tip>
      <MenuContent align="end">
        <MenuLabel>{count === 0 ? 'Nothing on screen to arrange' : `Arrange ${count} pane${count === 1 ? '' : 's'}`}</MenuLabel>
        <MenuItem disabled={count === 0} onSelect={() => arrange(sessionId, 1)}>
          <Square size={13} className="text-fg-muted" /> One at a time
        </MenuItem>
        <MenuItem disabled={count === 0} onSelect={() => arrange(sessionId, 2)}>
          <Columns2 size={13} className="text-fg-muted" /> Two side by side
        </MenuItem>
        <MenuItem disabled={count === 0} onSelect={() => arrange(sessionId, 4)}>
          <Grid2x2 size={13} className="text-fg-muted" /> Four in a grid
        </MenuItem>
        <MenuSeparator />
        <MenuItem disabled={count === 0} onSelect={() => arrange(sessionId)} hint="Ctrl+Shift+L" data-testid="tidy">
          <LayoutGrid size={13} className="text-fg-muted" /> Tidy — all panes, equal tiles
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
