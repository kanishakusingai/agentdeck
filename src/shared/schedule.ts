import type { Schedule } from './types'

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function describeSchedule(schedule: Schedule): string {
  if (schedule.kind === 'interval') {
    const m = schedule.minutes
    return m === 1 ? 'Every minute' : `Every ${m} minutes`
  }
  const days = [...schedule.days].sort()
  if (days.length === 0 || days.length === 7) return `Every day at ${schedule.time}`
  if (days.join() === '1,2,3,4,5') return `Weekdays at ${schedule.time}`
  return `${days.map((d) => DAY_NAMES[d]).join(', ')} at ${schedule.time}`
}
