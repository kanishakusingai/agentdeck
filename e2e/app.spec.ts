import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { delimiter, join, resolve } from 'path'

const root = resolve(__dirname, '..')
const shots = join(root, 'e2e', 'screenshots')
mkdirSync(shots, { recursive: true })

const userData = mkdtempSync(join(tmpdir(), 'agentdeck-e2e-data-'))
const workspaceDir = mkdtempSync(join(tmpdir(), 'agentdeck-e2e-site-'))
writeFileSync(join(workspaceDir, 'notes.md'), '# notes\n')
// A fake "claude" first on PATH that immediately reports a usage limit.
const fakeBin = mkdtempSync(join(tmpdir(), 'agentdeck-e2e-bin-'))
writeFileSync(join(fakeBin, 'claude.cmd'), '@echo off\r\necho Claude usage limit reached. Your limit will reset at 3pm.\r\n')

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [join(root, 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
      AGENTDECK_USER_DATA: userData,
      AGENTDECK_E2E_PICK_FOLDER: workspaceDir
    }
  })
  const page = await app.firstWindow()
  await page.waitForSelector('header')
  return { app, page }
}

const shot = (page: Page, name: string) => page.screenshot({ path: join(shots, `${name}.png`) })

/** Visible pane tabs (other sessions' canvases stay mounted but hidden). */
const tabs = (page: Page) => page.getByTestId('pane-tab').locator('visible=true')
const visible = (page: Page, testId: string) => page.getByTestId(testId).locator('visible=true')

/** A new terminal: Launch on an empty session, otherwise a pane's + › Terminal. */
async function newTerminal(page: Page): Promise<void> {
  if ((await tabs(page).count()) === 0) {
    await visible(page, 'launch').first().click()
    await page.getByTestId('new-terminal').click()
    return
  }
  await visible(page, 'new-pane').first().click()
  await expect(page.getByRole('menu').getByText('New pane', { exact: true })).toBeVisible()
  await page.getByTestId('new-pane-terminal').click()
}

/** Stop a pane for good: right-click its name › Close › confirm. */
async function closePane(page: Page, title: RegExp | string): Promise<void> {
  await tabs(page).filter({ hasText: title }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^Close (terminal|pane)$/ }).click()
  await page.getByTestId('ask-confirm').click()
  await expect(page.getByTestId('ask-dialog')).toBeHidden()
}

const sessionNamed = (page: Page, name: string) => page.getByTestId('session-name').filter({ hasText: name })

test('the whole app: workspaces, sessions, panes, layout, browser, persistence', async () => {
  test.setTimeout(180_000)
  let { app, page } = await launch()

  // 1. One app (no Agent / Thread modes); first run asks to create a project
  await expect(page.getByText('AgentDeck').first()).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Agent' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Thread' })).toHaveCount(0)
  await expect(page.getByText('Welcome to AgentDeck')).toBeVisible()
  await expect(page.getByTestId('project-name')).toBeFocused()
  await shot(page, '01-empty')

  // 2. Name the project, then choose where it works (folder picker stubbed for tests)
  await page.getByTestId('project-name').fill('Site')
  await page.getByTestId('project-next').click()
  await expect(page.getByTestId('continue-without-folder')).toBeVisible()
  await page.getByTestId('add-first-workspace').click()
  await expect(page.getByRole('navigation', { name: 'Workspaces' })).toContainText('Workspaces')
  await expect(page.getByTestId('workspace-row')).toHaveCount(1)
  await expect(page.getByTestId('workspace-row')).toContainText('Site')
  await expect(page.getByTestId('workspace-row')).toHaveAttribute('title', /agentdeck-e2e-site-/)
  // Its session is listed under it
  await expect(page.getByTestId('session-row')).toHaveCount(1)
  await expect(sessionNamed(page, 'Session 1')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('Nothing on screen in this session')).toBeVisible()
  await shot(page, '02-workspace')

  // 3. A real terminal, no message box under it: typing goes straight into the terminal
  await newTerminal(page)
  await expect(tabs(page)).toHaveCount(1)
  await expect(page.getByTestId('pane-composer')).toHaveCount(0)
  await page.locator('.xterm').first().click()
  await expect(page.locator('.xterm-rows').first()).toContainText('agentdeck-e2e-site-', { timeout: 15000 })
  await page.keyboard.type('echo agentdeck-$(20+3)')
  await page.keyboard.press('Enter')
  await expect(page.locator('.xterm-rows').first()).toContainText('agentdeck-23', { timeout: 15000 })

  // 3b. A pane's + opens the "New pane" menu
  await visible(page, 'new-pane').first().click()
  await expect(page.getByRole('menu').getByText('New pane', { exact: true })).toBeVisible()
  for (const item of ['Terminal', 'Claude Code', 'More agents…', 'Split Down', 'New Tab', 'New Session…']) {
    await expect(page.getByRole('menuitem', { name: new RegExp(item.replace('…', '.')) }).first()).toBeVisible()
  }
  await shot(page, '03a-new-pane-menu')
  await page.keyboard.press('Escape')

  // 4. New panes keep every tile the same size (no Tidy needed)
  await newTerminal(page)
  await newTerminal(page)
  await newTerminal(page)
  await expect(tabs(page)).toHaveCount(4)
  await page.waitForTimeout(500)
  const rects = () =>
    page.locator('[data-canvas]:not(.keep-hidden) .dv-groupview').locator('visible=true').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect()
        return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(',')
      })
    )
  const sizes = (await rects()).map((r) => r.split(',').map(Number))
  expect(sizes).toHaveLength(4)
  for (const [, , w, h] of sizes) {
    expect(Math.abs(w - sizes[0][2])).toBeLessThanOrEqual(2)
    expect(Math.abs(h - sizes[0][3])).toBeLessThanOrEqual(2)
  }
  await shot(page, '03b-even-tiles')

  // 4b. Fill the screen: one pane takes the whole canvas, F11 brings the grid back unchanged
  const rectsBefore = await rects()
  await visible(page, 'maximize-pane').first().click()
  await expect.poll(async () => (await rects()).length).toBe(1)
  await expect(page.locator('.xterm-rows').locator('visible=true').first()).toContainText('agentdeck-23')
  await shot(page, '03c-fill-screen')
  await page.keyboard.press('F11')
  await expect(tabs(page)).toHaveCount(4)
  await expect.poll(rects).toEqual(rectsBefore)

  // 4c. "Remove from screen" (⋯ menu) keeps it running; it is listed under its session and comes back
  await visible(page, 'pane-options').nth(1).click()
  await page.getByRole('menuitem', { name: 'Remove from screen' }).click()
  await expect(tabs(page)).toHaveCount(3)
  await expect(page.getByTestId('pane-row-offscreen')).toHaveCount(1)
  await expect(page.getByTestId('dashboard-row')).toHaveCount(4)
  await shot(page, '03d-off-screen')
  await page.getByTestId('pane-row-offscreen').click()
  await expect(tabs(page)).toHaveCount(4)
  await expect(page.getByTestId('pane-row-offscreen')).toHaveCount(0)

  // 4d. Sessions: right-click a pane › Move to session › New session
  await tabs(page).filter({ hasText: 'Terminal 3' }).click({ button: 'right' })
  await expect(page.getByTestId('context-menu')).toBeVisible()
  await page.getByRole('menuitem', { name: 'Move to session' }).click()
  await page.getByRole('menuitem', { name: 'New session' }).click()
  await expect(page.getByTestId('session-row')).toHaveCount(2)
  await expect(sessionNamed(page, 'Session 2')).toHaveAttribute('aria-current', 'page')
  await expect(tabs(page)).toHaveCount(1)
  await expect(tabs(page).first()).toContainText('Terminal 3')
  await shot(page, '03e-session-2')
  // ...and back with its ⋯ menu
  await visible(page, 'pane-options').first().click()
  await page.getByRole('menuitem', { name: 'Move to session' }).click()
  await page.getByRole('menuitem', { name: 'Session 1' }).click()
  await expect(sessionNamed(page, 'Session 1')).toHaveAttribute('aria-current', 'page')
  await expect(tabs(page)).toHaveCount(4)
  // The session rows show how many panes each has
  await expect(sessionNamed(page, 'Session 1')).toContainText('4')

  // Closing from the menu asks first, in the app's own dialog
  await tabs(page).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Close terminal' }).click()
  await expect(page.getByTestId('ask-dialog')).toContainText('The program running in this terminal stops')
  await shot(page, '03g-close-confirm')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('ask-dialog')).toBeHidden()
  await expect(tabs(page)).toHaveCount(4)

  // Folding a workspace hides its sessions; unfolding brings them back
  await page.getByTestId('workspace-toggle').first().click()
  await expect(page.getByTestId('session-row')).toHaveCount(0)
  await page.getByTestId('workspace-toggle').first().click()
  await expect(page.getByTestId('session-row')).toHaveCount(2)

  // Layout lives in the title bar's grid button
  await page.getByTestId('layout-menu').click()
  await expect(page.getByRole('menuitem', { name: /Two side by side/ })).toBeVisible()
  await shot(page, '03h-layout-menu')
  await page.getByTestId('tidy').click()
  await expect(tabs(page)).toHaveCount(4)
  // Tidy keeps processes alive: the first terminal still shows its output
  await expect(page.locator('.xterm-rows').locator('visible=true').first()).toContainText('agentdeck-23')

  // 5. Dashboard lists every running pane, and its tab counts them
  await expect(page.getByTestId('dashboard-row')).toHaveCount(4)
  await expect(page.getByTestId('dashboard-count')).toHaveText('4')
  await page.waitForTimeout(800)
  await shot(page, '03-code-mode')

  // 6. A terminal's × closes it straight away (its process stops)
  await page.getByRole('button', { name: 'Close Terminal 4' }).locator('visible=true').click()
  await expect(tabs(page)).toHaveCount(3)
  await expect(page.getByTestId('dashboard-row')).toHaveCount(3)

  // 7. "More agents…" opens the full list, with how to install each one
  await visible(page, 'new-pane').first().click()
  await page.getByTestId('new-pane-more-agents').click()
  await expect(page.getByTestId('agents-directory')).toBeVisible()
  expect(await page.getByTestId('agent-card').count()).toBeGreaterThanOrEqual(27)
  await shot(page, '04a-all-agents')
  await page.getByTestId('agents-search').fill('aider')
  await expect(page.getByTestId('agent-card')).toHaveCount(1)
  await expect(page.getByTestId('agent-card')).toContainText('aider-install')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('agents-directory')).toBeHidden()

  // 7b. An agent pane gets a person's name; a usage limit becomes a choice and rings the bell
  await visible(page, 'new-pane').first().click()
  await page.getByRole('menuitem', { name: /Claude Code/ }).click()
  await expect(tabs(page).filter({ hasText: 'Matthew' })).toBeVisible()
  await expect(page.getByText('Usage limit reached.', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /Resume when it resets/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue on another account/ })).toBeVisible()
  await expect(page.getByTestId('stat-needs')).toContainText('1')
  await expect(page.getByTestId('notifications-count')).toHaveText('1')
  await expect(page.getByTestId('dashboard-row').filter({ hasText: 'Matthew' })).toContainText('Claude Code')
  await shot(page, '04b-usage-limit')
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('Usage limit reached.', { exact: true })).toBeHidden()
  // Closing an agent with its × asks first
  await page.getByRole('button', { name: 'Close Matthew' }).locator('visible=true').click()
  await page.getByTestId('ask-confirm').click()
  await expect(tabs(page)).toHaveCount(3)
  await expect(page.getByTestId('dashboard-row')).toHaveCount(3)

  // 8. Browser tab in the sidebar; + adds another
  await page.getByRole('tab', { name: 'Browser', exact: true }).click()
  await expect(page.getByLabel('Address').locator('visible=true')).toHaveValue('localhost:3000')
  // Preview at a phone's width
  await page.getByRole('radio', { name: /Phone/ }).locator('visible=true').click()
  await expect(page.getByRole('radio', { name: /Phone/ }).locator('visible=true')).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radio', { name: /Desktop/ }).locator('visible=true').click()
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('sidebar-add').click()
  }
  await expect(page.getByTestId('sidebar-browser-tab')).toHaveText(['Browser', 'Browser 2', 'Browser 3', 'Browser 4'])
  await expect(page.getByRole('tab', { name: 'Browser 4' })).toHaveAttribute('aria-selected', 'true')
  // The new tab is scrolled into view even when the row overflows
  await expect(page.getByRole('tab', { name: 'Browser 4' })).toBeInViewport({ ratio: 0.95 })
  await page.waitForTimeout(1200)
  await shot(page, '05-browser')
  // Closing one never renames the others; the × of the shown tab is visible, Delete closes from the keyboard
  await page.getByRole('tab', { name: 'Browser 2' }).click()
  await page.getByTitle('Close Browser 2').click()
  await expect(page.getByTestId('sidebar-browser-tab')).toHaveText(['Browser', 'Browser 3', 'Browser 4'])
  await expect(page.getByRole('tab', { name: 'Browser', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Browser 4' }).click()
  await page.getByRole('tab', { name: 'Browser 4' }).press('Delete')
  await expect(page.getByTestId('sidebar-browser-tab')).toHaveText(['Browser', 'Browser 3'])
  await expect(page.getByRole('tab', { name: 'Browser 3' })).toHaveAttribute('aria-selected', 'true')
  // Arrow keys move between the sidebar tabs
  await page.getByRole('tab', { name: 'Browser 3' }).press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'Browser', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: /^Dashboard/ }).click()

  // 8b. The sidebar can be dragged wider by its left edge; double-click resets it
  const sidebarWidth = () => page.getByTestId('sidebar').evaluate((e) => Math.round(e.getBoundingClientRect().width))
  expect(await sidebarWidth()).toBe(340)
  const handle = (await page.getByTestId('sidebar-resizer').boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x - 100, handle.y + handle.height / 2, { steps: 5 })
  await page.mouse.move(handle.x - 200, handle.y + handle.height / 2, { steps: 5 })
  await page.mouse.up()
  expect(Math.abs((await sidebarWidth()) - 540)).toBeLessThanOrEqual(3)
  await shot(page, '05b-wide-sidebar')
  // It can't squeeze the panes: the widest leaves room for the left rail and 480px of panes
  const moved = (await page.getByTestId('sidebar-resizer').boundingBox())!
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2)
  await page.mouse.down()
  await page.mouse.move(0, moved.y + moved.height / 2, { steps: 5 })
  await page.mouse.up()
  const widest = (await page.evaluate<number>('window.innerWidth')) - 24 - 264 - 8 - 480
  expect(Math.abs((await sidebarWidth()) - widest)).toBeLessThanOrEqual(1)
  await page.getByTestId('sidebar-resizer').dblclick()
  expect(await sidebarWidth()).toBe(340)
  // The ⤢ button makes it as wide as it can be, and back
  await page.getByTestId('sidebar-expand').click()
  expect(Math.abs((await sidebarWidth()) - widest)).toBeLessThanOrEqual(1)
  await page.getByTestId('sidebar-expand').click()
  expect(await sidebarWidth()).toBe(340)
  // A plain click doesn't change it; arrow keys do
  await page.getByTestId('sidebar-resizer').click()
  expect(await sidebarWidth()).toBe(340)
  await page.getByTestId('sidebar-resizer').press('ArrowLeft')
  expect(await sidebarWidth()).toBe(360)
  await page.getByTestId('sidebar-resizer').press('ArrowRight')
  expect(await sidebarWidth()).toBe(340)

  // 9. Settings (the gear at the bottom of the side panel): add a named account and make it the default
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: /^Settings/ }).click()
  await expect(page.getByRole('dialog')).toContainText('Agents & accounts')
  await shot(page, '09-settings')
  await page.getByLabel('New Codex account name').fill('Work')
  await page.getByRole('button', { name: 'Add account' }).nth(1).click()
  // Adding an account opens the provider's own sign-in in a terminal pane
  await expect(tabs(page).filter({ hasText: 'Sign in · Work' })).toBeVisible()
  await shot(page, '09b-sign-in-pane')
  await page.keyboard.press('Control+,')
  await expect(page.getByRole('button', { name: 'Work', exact: true })).toBeVisible()
  await page.getByLabel('Default Codex account').click()
  await expect(page.getByRole('option', { name: 'Work' })).toBeVisible()
  await page.getByRole('option', { name: 'Work' }).click()
  await expect(page.getByLabel('Default Codex account')).toContainText('Work')
  await page.getByRole('button', { name: 'Terminal & browser' }).click()
  await expect(page.getByRole('switch', { name: 'Show the full folder path' })).toBeChecked()
  await page.keyboard.press('Escape')
  await closePane(page, 'Sign in')

  // 10. Restart: projects, sessions, panes and browser tabs are remembered
  await app.close()
  ;({ app, page } = await launch())
  await expect(page.getByTestId('workspace-row')).toHaveCount(1)
  await expect(page.getByTestId('session-row')).toHaveCount(2)
  // The saved layout comes back with fresh shells in each pane
  await expect(tabs(page)).toHaveCount(3)
  // Restored panes belong to their project
  await expect(page.getByTestId('dashboard-row').first()).toContainText('Site')
  await expect(page.getByTestId('sidebar-browser-tab')).toHaveText(['Browser', 'Browser 3'])
  await page.waitForTimeout(800)
  await shot(page, '10-restored')

  // 11. A second project without a folder, from the side panel's +
  await page.getByTestId('add-workspace').click()
  await expect(page.getByTestId('new-project-dialog')).toBeVisible()
  await page.getByTestId('new-project-dialog').getByTestId('project-name').fill('Notes')
  await page.getByTestId('new-project-dialog').getByTestId('project-next').click()
  await page.getByTestId('new-project-dialog').getByTestId('continue-without-folder').click()
  await expect(page.getByTestId('new-project-dialog')).toBeHidden()
  await expect(page.getByTestId('workspace-row')).toHaveCount(2)
  await expect(page.getByTestId('workspace-row').filter({ hasText: 'Notes' })).toBeVisible()
  await expect(page.getByText('Nothing on screen in this session').locator('visible=true').first()).toBeVisible()
  // Removing a project asks in the app's own dialog; Cancel keeps it
  await page.getByTestId('workspace-row').filter({ hasText: 'Notes' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Remove project' }).click()
  await expect(page.getByTestId('ask-dialog')).toContainText('Your files stay where they are')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('workspace-row')).toHaveCount(2)
  await shot(page, '11-second-project')

  // 12. "Continue without a project" skips naming and opens a terminal straight away
  await page.getByTestId('add-workspace').click()
  await page.getByTestId('new-project-dialog').getByTestId('continue-without-project').click()
  await expect(page.getByTestId('new-project-dialog')).toBeHidden()
  await expect(page.getByTestId('workspace-row').filter({ hasText: 'Quick sessions' })).toBeVisible()
  await expect(tabs(page)).toHaveCount(1)
  await expect(page.locator('.xterm-rows').locator('visible=true').first()).toContainText('PS>', { timeout: 15000 })
  await shot(page, '12-quick-session')
  await app.close()
})
