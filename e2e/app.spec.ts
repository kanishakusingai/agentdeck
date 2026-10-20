import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { delimiter, join, resolve } from 'path'

const root = resolve(__dirname, '..')
const shots = join(root, 'e2e', 'screenshots')
mkdirSync(shots, { recursive: true })

const userData = mkdtempSync(join(tmpdir(), 'agentdeck-e2e-data-'))
const workspaceDir = mkdtempSync(join(tmpdir(), 'agentdeck-e2e-site-'))
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

test('the whole app: workspaces, terminals, layout, modes, persistence', async () => {
  let { app, page } = await launch()

  // 1. A dark window with the title bar and mode switch
  await expect(page.getByText('AgentDeck').first()).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Add your first workspace')).toBeVisible()
  await shot(page, '01-empty')

  // 2. Add a workspace (folder picker stubbed for tests)
  await page.getByTestId('add-first-workspace').click()
  await expect(page.getByTestId('workspace-row')).toHaveCount(1)
  await expect(page.getByText('No panes open')).toBeVisible()
  await shot(page, '02-workspace')

  // 3. A real terminal: typed commands produce output
  await page.getByTestId('new-terminal').click()
  await expect(page.getByTestId('pane-tab')).toHaveCount(1)
  await page.locator('.xterm').first().click()
  await page.waitForTimeout(1500)
  await page.keyboard.type('echo agentdeck-$(20+3)')
  await page.keyboard.press('Enter')
  await expect(page.locator('.xterm-rows').first()).toContainText('agentdeck-23', { timeout: 15000 })

  // 4. Split into more panes, then Tidy
  await page.getByTestId('new-terminal').click()
  await page.getByTestId('new-terminal').click()
  await page.getByTestId('new-terminal').click()
  await expect(page.getByTestId('pane-tab')).toHaveCount(4)
  await page.getByTestId('tidy').click()
  await expect(page.getByTestId('pane-tab')).toHaveCount(4)
  // Tidy keeps processes alive: the first terminal still shows its output
  await expect(page.locator('.xterm-rows').first()).toContainText('agentdeck-23')

  // 5. Dashboard lists every running pane
  await expect(page.getByTestId('dashboard-row')).toHaveCount(4)
  await page.waitForTimeout(800)
  await shot(page, '03-code-mode')

  // 6. Closing a pane stops its process
  await page.getByRole('button', { name: /^Close Terminal/ }).first().click()
  await expect(page.getByTestId('dashboard-row')).toHaveCount(3)

  // 7. Launch-agent menu lists the catalog
  await page.getByTestId('launch-agent').first().click()
  await expect(page.getByRole('menuitem', { name: /Aider/ })).toBeVisible()
  await shot(page, '04-launch-menu')

  // 7b. Launching an agent opens it in a pane; a usage limit becomes a choice
  await page.getByRole('menuitem', { name: /Claude Code/ }).click()
  await expect(page.getByText('Usage limit reached.', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /Resume when it resets/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue on another account/ })).toBeVisible()
  await expect(page.getByText('Need attention').locator('..')).toContainText('1')
  await shot(page, '04b-usage-limit')
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('Usage limit reached.', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: /^Close Claude Code/ }).click()
  await expect(page.getByTestId('dashboard-row')).toHaveCount(3)

  // 8. Browser tab in the sidebar
  await page.getByRole('tab', { name: 'Browser' }).click()
  await expect(page.getByLabel('Address')).toHaveValue('http://localhost:3000')
  await page.waitForTimeout(1200)
  await shot(page, '05-browser')
  await page.getByRole('tab', { name: 'Dashboard' }).click()

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

  // 11. Settings: add a named account and make it the default
  await page.keyboard.press('Control+,')
  await expect(page.getByRole('dialog')).toContainText('Agents & accounts')
  await shot(page, '09-settings')
  await page.getByLabel('New Codex account name').fill('Work')
  await page.getByRole('button', { name: 'Add account' }).nth(1).click()
  // Adding an account opens the provider's own sign-in in a terminal pane
  await expect(page.getByTestId('pane-tab').filter({ hasText: 'Sign in · Work' })).toBeVisible()
  await shot(page, '09b-sign-in-pane')
  await page.keyboard.press('Control+,')
  await expect(page.getByRole('button', { name: 'Work', exact: true })).toBeVisible()
  await page.getByLabel('Default Codex account').selectOption({ label: 'Work' })
  await expect(page.getByLabel('Default Codex account')).toHaveValue(/.+-.+/)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Close Sign in/ }).click()
  await page.getByRole('tab', { name: 'Agent' }).click()

  // 12. Restart: workspace and mode are remembered
  await app.close()
  ;({ app, page } = await launch())
  await expect(page.getByRole('tab', { name: 'Agent' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Code' }).click()
  await expect(page.getByTestId('workspace-row')).toHaveCount(1)
  // The saved layout comes back with fresh shells in each pane
  await expect(page.getByTestId('pane-tab')).toHaveCount(3)
  await app.close()
})
