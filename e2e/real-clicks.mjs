// Real-mouse check of the title bar: moves your actual mouse pointer, so don't touch it while it runs.
// Playwright's normal clicks bypass Windows' title-bar hit-testing, so they can't catch drag-region bugs.
// Usage: `npm run test:real-clicks` (dev build) or `node e2e/real-clicks.mjs <path-to-AgentDeck.exe>`.
import { _electron as electron } from '@playwright/test'
import { execFileSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const exe = process.argv[2] ?? 'release/win-unpacked/AgentDeck.exe'
const app = await electron.launch({
  ...(process.argv[2] === 'dev' ? { args: ['out/main/index.js'] } : { executablePath: exe }),
  env: { ...process.env, AGENTDECK_USER_DATA: mkdtempSync(join(tmpdir(), 'agentdeck-osclick-')) }
})
const page = await app.firstWindow()
await page.waitForSelector('header')
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  w.setBounds({ x: 40, y: 40, width: 1400, height: 860 })
  w.show()
  w.focus()
  w.moveTop()
})
await page.waitForTimeout(800)
const { bounds, scale } = await app.evaluate(({ BrowserWindow, screen }) => {
  const w = BrowserWindow.getAllWindows()[0]
  const b = w.getContentBounds()
  return { bounds: b, scale: screen.getDisplayMatching(b).scaleFactor }
})

function realClick(x, y) {
  const ps = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class M { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e); }
"@
[M]::SetProcessDPIAware() | Out-Null
[M]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
Start-Sleep -Milliseconds 150
[M]::mouse_event(2,0,0,0,0); Start-Sleep -Milliseconds 60; [M]::mouse_event(4,0,0,0,0)`
  execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true })
}

async function clickTab(name, frac = 0.25) {
  const box = await page.getByRole('tab', { name }).boundingBox()
  const x = (bounds.x + box.x + box.width * frac) * scale
  const y = (bounds.y + box.y + box.height / 2) * scale
  await page.evaluate(() => {
    window.__downs = 0
    window.addEventListener('pointerdown', () => window.__downs++, { capture: true, once: true })
  })
  realClick(x, y)
  await page.waitForTimeout(700)
  const selected = await page.getByRole('tab', { name }).getAttribute('aria-selected')
  const reached = await page.evaluate(() => window.__downs)
  const mode = await page.locator('[data-mode]').first().getAttribute('data-mode')
  console.log(`real click on "${name}" @${frac}: ${selected === 'true' ? 'WORKS' : 'IGNORED'} · event reached page: ${reached > 0} · mode=${mode}`)
}

for (const [name, frac] of [['Agent', 0.25], ['Code', 0.25], ['Code', 0.75], ['Thread', 0.5], ['Agent', 0.5]]) await clickTab(name, frac)

// The other title-bar buttons must take real clicks too.
await clickTab('Code', 0.5)
const settings = await page.getByRole('button', { name: /^Settings/ }).boundingBox()
realClick((bounds.x + settings.x + settings.width / 2) * scale, (bounds.y + settings.y + settings.height / 2) * scale)
await page.waitForTimeout(700)
console.log(`real click on "Settings": ${(await page.getByRole('dialog').count()) > 0 ? 'WORKS' : 'IGNORED'}`)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const sidebarBtn = page.getByRole('button', { name: /sidebar/ })
const sidebar = await sidebarBtn.boundingBox()
const before = await sidebarBtn.getAttribute('aria-label')
realClick((bounds.x + sidebar.x + sidebar.width / 2) * scale, (bounds.y + sidebar.y + sidebar.height / 2) * scale)
await page.waitForTimeout(700)
console.log(`real click on "Sidebar": ${(await sidebarBtn.getAttribute('aria-label')) !== before ? 'WORKS' : 'IGNORED'}`)

// The window buttons drawn in the title bar.
const winState = () => app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  return { max: w.isMaximized(), min: w.isMinimized() }
})
async function clickButton(name) {
  const box = await page.getByRole('button', { name }).boundingBox()
  realClick((bounds.x + box.x + box.width / 2) * scale, (bounds.y + box.y + box.height / 2) * scale)
  await page.waitForTimeout(900)
}
await clickButton('Maximize window')
console.log(`real click on "Maximize": ${(await winState()).max ? 'WORKS' : 'IGNORED'}`)
// Maximising moves the window: re-measure before the next click.
Object.assign(bounds, await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds()))
await clickButton('Restore window')
console.log(`real click on "Restore": ${!(await winState()).max ? 'WORKS' : 'IGNORED'}`)
Object.assign(bounds, await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds()))
await clickButton('Minimize window')
console.log(`real click on "Minimize": ${(await winState()).min ? 'WORKS' : 'IGNORED'}`)
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore())
await app.close()
