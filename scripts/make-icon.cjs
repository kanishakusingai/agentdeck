// Renders the AgentDeck logo to resources/icon.png, build/icon.png and build/icon.ico.
// Run with: npx electron scripts/make-icon.cjs
const { app, BrowserWindow, nativeImage } = require('electron')
const { writeFileSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs>
  <rect x="1" y="1" width="22" height="22" rx="5.5" fill="url(#g)"/>
  <rect x="1.4" y="1.4" width="21.2" height="21.2" rx="5.2" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="0.4"/>
  <path d="M7 9l3.2 3L7 15" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12.6 15.2h4.6" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/>
</svg>`

/** An .ico made of PNG images (supported since Windows Vista). */
function toIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const dir = Buffer.alloc(16 * pngs.length)
  let offset = 6 + dir.length
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(data.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } })
  const html = `<html><body style="margin:0;background:transparent">${SVG}</body></html>`
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((r) => setTimeout(r, 500))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  const big = nativeImage.createFromBuffer(image.toPNG()).resize({ width: 512, height: 512, quality: 'best' })
  const png = big.toPNG()
  writeFileSync(join(root, 'resources', 'icon.png'), png)
  writeFileSync(join(root, 'build', 'icon.png'), png)
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  writeFileSync(join(root, 'build', 'icon.ico'), toIco(sizes.map((size) => ({ size, data: big.resize({ width: size, height: size, quality: 'best' }).toPNG() }))))
  console.log('icons written')
  app.quit()
})
