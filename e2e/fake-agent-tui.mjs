// A tiny stand-in for an agent CLI's terminal UI (drawn like Kiro CLI's), for the e2e test:
// an input line "› …", and while it starts with "/" a menu of commands (8 at a time,
// the highlighted one bold magenta, "(+N more)" under it). ↑/↓ move, Tab completes,
// Enter runs ("ran: …"), Esc clears the line, Ctrl+C quits.
const COMMANDS = [
  ['/agent', 'List or switch agents'],
  ['/clear', 'Clear the conversation'],
  ['/compact', 'Compact conversation history'],
  ['/context', 'Show or manage context files'],
  ['/copy', 'Copy the last response'],
  ['/e2e-only', 'A command only this fake agent has'],
  ['/help', 'Show help'],
  ['/model', 'Choose the model'],
  ['/quit', 'Quit'],
  ['/tools', 'Show tools'],
  ['/usage', 'Show usage'],
  ['/zebra', 'Last one']
]
// Up to 8 at a time, fewer when the pane is short (like the real ones).
const visible = () => Math.max(3, Math.min(8, (process.stdout.rows || 24) - 7))
let line = ''
let highlight = 0
let ran = ''

const matches = () => (line.startsWith('/') && !line.includes(' ') ? COMMANDS.filter(([name]) => name.startsWith(line)) : [])

function draw() {
  const out = ['\u001b[2J\u001b[H\u001b[?25l', 'Fake Kiro\r\n\r\n', ran ? `ran: ${ran}\r\n` : '\r\n', `› ${line}\u001b[7m \u001b[0m\r\n`]
  const list = matches()
  if (list.length) {
    const VISIBLE = visible()
    const top = Math.max(0, Math.min(highlight - VISIBLE + 1, list.length - VISIBLE))
    list.slice(top, top + VISIBLE).forEach(([name, desc], i) => {
      const padded = name.padEnd(20)
      out.push(top + i === highlight ? `\u001b[1;35m${padded}\u001b[0m${desc}\r\n` : `${padded}${desc}\r\n`)
    })
    if (list.length > VISIBLE) out.push(`(+${list.length - VISIBLE} more)\r\n`)
    out.push(' esc to cancel · ↑↓ to navigate · ↵ to select\r\n')
  }
  process.stdout.write(out.join(''))
}

// eslint-disable-next-line no-control-regex
const TOKEN = /\u001b\[200~([\s\S]*?)\u001b\[201~|\u001b\[[0-?]*[ -/]*[@-~]|\u001bO.|\u001b|[\s\S]/gu

process.stdin.setRawMode(true)
process.stdin.setEncoding('utf8')
process.stdin.on('data', (data) => {
  for (const m of data.matchAll(TOKEN)) {
    const key = m[0]
    const list = matches()
    if (m[1] !== undefined) line += m[1]
    else if (key === '\u0003') {
      process.stdout.write('\u001b[?25h\r\nbye\r\n')
      process.exit(0)
    } else if (key === '\r') {
      ran = list.length ? list[highlight][0] : line
      line = ''
      highlight = 0
    } else if (key === '\u007f' || key === '\b') {
      line = Array.from(line).slice(0, -1).join('')
      highlight = 0
    } else if (key === '\u001b[A') highlight = Math.max(0, highlight - 1)
    else if (key === '\u001b[B') highlight = Math.min(Math.max(0, list.length - 1), highlight + 1)
    else if (key === '\t') {
      if (list.length) line = list[highlight][0]
      highlight = 0
    } else if (key === '\u001b') {
      line = ''
      highlight = 0
    } else if (!/[\u0000-\u001f]/.test(key) && !key.startsWith('\u001b')) {
      line += key
      highlight = 0
    }
  }
  draw()
})
draw()
