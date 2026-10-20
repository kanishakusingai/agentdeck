// Detects "you are out of quota" messages printed by agent CLIs.

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

export interface LimitResult {
  limited: boolean
  resetAt?: number
}

const LIMIT_PATTERNS = [
  /usage limit\s*(?:has been\s*)?reached/i,
  /hit your (?:usage )?limit/i,
  /(?:5-hour|five-hour|weekly|daily|session) limit reached/i,
  /out of (?:usage|credits) until/i
]

function nextClockTime(hour12: number, minute: number, meridiem: string, now: Date): number {
  let hour = hour12 % 12
  if (meridiem.toLowerCase() === 'pm') hour += 12
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0)
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1)
  return at.getTime()
}

export function detectUsageLimit(text: string, now: Date = new Date()): LimitResult {
  const epoch = text.match(/usage limit reached\|(\d{10,13})/i)
  if (epoch) {
    const n = Number(epoch[1])
    return { limited: true, resetAt: n < 1e12 ? n * 1000 : n }
  }
  if (!LIMIT_PATTERNS.some((p) => p.test(text))) return { limited: false }

  const clock = text.match(/(?:resets?|reset at|try again at)\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (clock) {
    return { limited: true, resetAt: nextClockTime(Number(clock[1]), Number(clock[2] ?? 0), clock[3], now) }
  }

  const relative = text.match(/try again in\s*(?:(\d+)\s*days?)?\s*(?:(\d+)\s*hours?)?\s*(?:(\d+)\s*min(?:ute)?s?)?/i)
  if (relative && (relative[1] || relative[2] || relative[3])) {
    const minutes = Number(relative[1] ?? 0) * 1440 + Number(relative[2] ?? 0) * 60 + Number(relative[3] ?? 0)
    return { limited: true, resetAt: now.getTime() + minutes * 60000 }
  }

  return { limited: true }
}
