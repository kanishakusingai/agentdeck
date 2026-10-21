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

/** Launch › Terminal (the plain terminal is the first item of the one Launch menu). */
async function newTerminal(page: Page): Promise<void> {
  await page.getByTestId('launch-agent').locator('visible=true').first().click()
  await expect(page.getByRole('menuitem').first()).toHaveText(/Terminal/)
  await page.getByTestId('new-terminal').click()
}

/** Stop a pane for good: right-click its tab › Close › confirm. */
async function closePane(page: Page, title: RegExp | string): Promise<void> {
  await tabs(page).filter({ hasText: title }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^Close (terminal|pane)$/ }).click()
  await page.getByTestId('ask-confirm').click()
  await expect(page.getByTestId('ask-dialog')).toBeHidden()
}

test('the whole app: projects, sessions, terminals, layout, modes, persistence', async () => {
  test.setTimeout(180_000)
  let { app, page } = await launch()

  // 1. A dark window with the title bar and mode switch; first run asks to create a project
  await expect(page.getByText('AgentDeck').first()).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Welcome to AgentDeck')).toBeVisible()
  await expect(page.getByTestId('project-name')).toBeFocused()
  await shot(page, '01-empty')

  // 2. Name the project, then choose where it works (folder picker stubbed for tests)
  await page.getByTestId('project-name').fill('Site')
  await page.getByTestId('project-next').click()
  await expect(page.getByTestId('continue-without-folder')).toBeVisible()
  await shot(page, '01b-choose-folder')
  await page.getByTestId('add-first-workspace').click()
  await expect(page.getByTestId('workspace-row')).toHaveCount(1)
  await expect(page.getByTestId('workspace-row')).toContainText('Site')
  // The full folder path is shown
  await expect(page.getByTestId('project-path')).toContainText('agentdeck-e2e-site-')
  await expect(page.getByText('Nothing on screen in this session')).toBeVisible()
  await shot(page, '02-workspace')

  // 3. A real terminal: typed commands produce output; the prompt shows the full folder path
  await newTerminal(page)
  await expect(tabs(page)).toHaveCount(1)
  await page.locator('.xterm').first().click()
  await expect(page.locator('.xterm-rows').first()).toContainText('agentdeck-e2e-site-', { timeout: 15000 })
  await page.keyboard.type('echo agentdeck-$(20+3)')
  await page.keyboard.press('Enter')
  await expect(page.locator('.xterm-rows').first()).toContainText('agentdeck-23', { timeout: 15000 })

  // 3b. Every pane has its own message box: Enter sends it to that terminal
  const box = page.getByTestId('pane-composer').first().locator('textarea')
  await box.click()
  // Typing must not resize the terminal (a resize makes the shell redraw over itself)
  const termHeight = () => page.locator('[data-pty-id] > div.min-h-0').first().evaluate((e) => e.getBoundingClientRect().height)
  const heightBefore = await termHeight()
  await box.press('x')
  expect(await termHeight()).toBe(heightBefore)
  await box.fill('')
  await box.fill('echo composer-$(40+2)')
  await box.press('Enter')
  await expect(page.locator('.xterm-rows').first()).toContainText('composer-42', { timeout: 15000 })
  await expect(box).toHaveValue('')
  // Alt+↑ brings the last message back
  await box.press('Alt+ArrowUp')
  await expect(box).toHaveValue('echo composer-$(40+2)')
  await box.fill('')
  // "@" lists the workspace's files
  await box.pressSequentially('look at @not')
  await expect(page.getByRole('listbox', { name: 'Files' })).toBeVisible()
  await expect(page.getByRole('option', { name: /notes\.md/ })).toBeVisible()
  await shot(page, '03a-file-picker')
  await box.press('Enter')
  await expect(box).toHaveValue('look at @notes.md ')
  await box.fill('')

  // 4. New panes keep every tile the same size (no Tidy needed)
  await newTerminal(page)
  await newTerminal(page)
  await newTerminal(page)
  await expect(tabs(page)).toHaveCount(4)
  await page.waitForTimeout(500)
  const rects = () =>
    page.locator('[data-canvas]:not(.keep-hidden) .dv-groupview').evaluateAll((els) =>
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

  // 4b. Full screen: the terminal opens large over a see-through backdrop; the grid is untouched
  const rectsBefore = await rects()
  await page.getByTestId('zoom-pane').locator('visible=true').first().click()
  await expect(page.getByTestId('fullscreen')).toBeVisible()
  await expect(page.getByTestId('fullscreen').locator('.xterm')).toBeVisible()
  await expect(page.getByTestId('fullscreen').locator('.xterm-rows')).toContainText('agentdeck-23')
  await shot(page, '03c-full-screen')
  await page.keyboard.press('F11')
  await expect(page.getByTestId('fullscreen')).toBeHidden()
  await expect(tabs(page)).toHaveCount(4)
  await expect.poll(rects).toEqual(rectsBefore)
  // The terminal is back in its pane
  await expect(page.locator('.xterm-rows').first()).toContainText('agentdeck-23')

  // 4c. The × only takes a pane off the screen; it keeps running and comes back from the side panel
  await tabs(page).nth(1).hover()
  await page.getByRole('button', { name: /^Remove Terminal 2 from screen/ }).click()
  await expect(tabs(page)).toHaveCount(3)
  await expect(page.getByTestId('pane-row-offscreen')).toHaveCount(1)
  await expect(page.getByTestId('dashboard-row')).toHaveCount(4)
  await shot(page, '03d-off-screen')
  await page.getByTestId('pane-row-offscreen').click()
  await expect(tabs(page)).toHaveCount(4)
  await expect(page.getByTestId('pane-row-offscreen')).toHaveCount(0)

  // 4d. Sessions: right-click a terminal › Move to session › New session
  await page.getByTestId('pane-row').filter({ hasText: 'Terminal 3' }).click({ button: 'right' })
  await expect(page.getByTestId('context-menu')).toBeVisible()
  await page.getByRole('menuitem', { name: 'Move to session' }).click()
  await page.getByRole('menuitem', { name: 'New session' }).click()
  await expect(page.getByTestId('session-tab')).toHaveCount(2)
  await expect(page.getByTestId('session-tab').nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(tabs(page)).toHaveCount(1)
  await expect(tabs(page).first()).toContainText('Terminal 3')
  await shot(page, '03e-session-2')
  // Drag it back onto Session 1 in the side panel
  await page.getByTestId('pane-row').filter({ hasText: 'Terminal 3' }).dragTo(page.getByTestId('session-row').first())
  await expect(page.getByTestId('session-tab').first()).toHaveAttribute('aria-selected', 'true')
  await expect(tabs(page)).toHaveCount(4)
  await shot(page, '03f-dragged-back')

  // Closing for good asks first, in the app's own dialog
  await tabs(page).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Close terminal' }).click()
  await expect(page.getByTestId('ask-dialog')).toContainText('The program running in this terminal stops')
  await shot(page, '03g-close-confirm')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('ask-dialog')).toBeHidden()
  await expect(tabs(page)).toHaveCount(4)

  // Collapsing a session in the side panel hides its list; expanding brings it back
  await page.getByTestId('session-toggle').first().click()
  await expect(page.getByTestId('pane-row')).toHaveCount(0)
  await page.getByTestId('session-toggle').first().click()
  await expect(page.getByTestId('pane-row')).toHaveCount(4)

  // Layout lives in one small dropdown
  await page.getByTestId('layout-menu').click()
  await expect(page.getByRole('menuitem', { name: /Two side by side/ })).toBeVisible()
  await shot(page, '03h-layout-menu')
  await page.getByTestId('tidy').click()
  await expect(tabs(page)).toHaveCount(4)
  // Tidy keeps processes alive: the first terminal still shows its output
  await expect(page.locator('.xterm-rows').locator('visible=true').first()).toContainText('agentdeck-23')

  // 5. Dashboard lists every running pane
  await expect(page.getByTestId('dashboard-row')).toHaveCount(4)
  await page.waitForTimeout(800)
  await shot(page, '03-code-mode')

  // 6. Closing a pane stops its process
  await closePane(page, 'Terminal 4')
  await expect(page.getByTestId('dashboard-row')).toHaveCount(3)

  // 7. Launch-agent menu lists the catalog, Kiro CLI included
  await page.getByTestId('launch-agent').first().click()
  await expect(page.getByRole('menuitem', { name: /Aider/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Kiro CLI/ })).toBeVisible()
  await shot(page, '04-launch-menu')

  // 7b. Launching an agent opens it in a pane; a usage limit becomes a choice
  await page.getByRole('menuitem', { name: /Claude Code/ }).click()
  await expect(page.getByText('Usage limit reached.', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /Resume when it resets/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue on another account/ })).toBeVisible()
  await expect(page.getByTestId('stat-needs')).toContainText('1')
  await shot(page, '04b-usage-limit')
  // An agent pane's box lists the agent's slash commands
  const claudeBox = page.getByRole('textbox', { name: 'Message to Claude' })
  await claudeBox.click()
  await claudeBox.pressSequentially('/comp')
  await expect(page.getByRole('listbox', { name: 'Commands' })).toBeVisible()
  await expect(page.getByRole('option', { name: /\/compact/ })).toBeVisible()
  await shot(page, '04c-slash-commands')
  await claudeBox.press('Escape')
  await expect(page.getByRole('listbox', { name: 'Commands' })).toBeHidden()
  await claudeBox.fill('')
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('Usage limit reached.', { exact: true })).toBeHidden()
  await closePane(page, 'Claude Code')
  await expect(page.getByTestId('dashboard-row')).toHaveCount(3)

  // 8. Browser tab in the sidebar; + adds another
  await page.getByRole('tab', { name: 'Browser', exact: true }).click()
  await expect(page.getByLabel('Address').locator('visible=true')).toHaveValue('http://localhost:3000')
  await page.getByTestId('sidebar-add').click()
  await page.getByTestId('sidebar-new-browser').click()
  await expect(page.getByTestId('sidebar-browser-tab')).toHaveCount(2)
  await expect(page.getByRole('tab', { name: 'Browser 2' })).toHaveAttribute('aria-selected', 'true')
  await page.waitForTimeout(1200)
  await shot(page, '05-browser')
  await page.getByRole('button', { name: 'Close Browser 2' }).click({ force: true })
  await expect(page.getByTestId('sidebar-browser-tab')).toHaveCount(1)
  await page.getByRole('tab', { name: 'Dashboard' }).click()

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
  await page.getByTestId('sidebar-resizer').dblclick()
  expect(await sidebarWidth()).toBe(340)

  // 9. Mode switch changes rail and main area
  await page.getByRole('tab', { name: 'Thread' }).click()
  await expect(page.getByTestId('rail-thread')).toBeVisible()
  await expect(page.getByLabel('Search threads')).toBeVisible()
  await page.waitForTimeout(500)
  await shot(page, '06-thread-mode')

  await page.getByRole('tab', { name: 'Agent' }).click()
  await expect(page.getByTestId('rail-agent')).toBeVisible()
  await expect(page.getByText("Agents that work while you don't")).toBeVisible()
  await shot(page, '07-agent-mode')

  // 10. Routine editor
  await page.getByTestId('new-routine').click()
  await expect(page.getByRole('dialog', { name: 'New routine' })).toBeVisible()
  await shot(page, '08-routine-editor')
  await page.keyboard.press('Escape')

  // 11. Settings: add a named account and make it the default; the full-path switch is there
  await page.keyboard.press('Control+,')
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
  await shot(page, '09c-dropdown')
  await page.getByRole('option', { name: 'Work' }).click()
  await expect(page.getByLabel('Default Codex account')).toContainText('Work')
  await page.getByRole('button', { name: 'Terminal & browser' }).click()
  await expect(page.getByRole('switch', { name: 'Show the full folder path' })).toBeChecked()
  await shot(page, '09d-terminal-settings')
  await page.keyboard.press('Escape')
  await closePane(page, 'Sign in')
  await page.getByRole('tab', { name: 'Agent' }).click()

  // 12. Restart: project, sessions and mode are remembered
  await app.close()
  ;({ app, page } = await launch())
  await expect(page.getByRole('tab', { name: 'Agent' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Code' }).click()
  await expect(page.getByTestId('workspace-row')).toHaveCount(1)
  await expect(page.getByTestId('session-tab')).toHaveCount(2)
  // The saved layout comes back with fresh shells in each pane
  await expect(tabs(page)).toHaveCount(3)
  // Restored panes belong to their project
  await expect(page.getByTestId('dashboard-row').first()).toContainText('Site')

  // 13. A second project without a folder, from the side panel's “New project”
  await page.getByTestId('add-workspace').click()
  await expect(page.getByTestId('new-project-dialog')).toBeVisible()
  await page.getByTestId('new-project-dialog').getByTestId('project-name').fill('Notes')
  await page.getByTestId('new-project-dialog').getByTestId('project-next').click()
  await shot(page, '10a-new-project-dialog')
  await page.getByTestId('new-project-dialog').getByTestId('continue-without-folder').click()
  await expect(page.getByTestId('new-project-dialog')).toBeHidden()
  await expect(page.getByTestId('workspace-row')).toHaveCount(2)
  await expect(page.getByTestId('workspace-row').filter({ hasText: 'Notes' })).toBeVisible()
  // Removing a project asks in the app's own dialog; Cancel keeps it
  await page.getByRole('button', { name: /options$/ }).first().click()
  await page.getByRole('menuitem', { name: 'Remove project' }).click()
  await expect(page.getByTestId('ask-dialog')).toContainText('Your files stay where they are')
  await shot(page, '10b-remove-project')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('workspace-row')).toHaveCount(2)
  await expect(page.getByText('Nothing on screen in this session').locator('visible=true').first()).toBeVisible()
  await shot(page, '10-second-project')
  await app.close()
})