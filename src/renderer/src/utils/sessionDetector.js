import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
dayjs.extend(utc)

export function isSessionActive(session) {
  if (!session) return false
  const now = Date.now()
  const start = new Date(session.date_start).getTime()
  const end   = new Date(session.date_end).getTime()
  return start <= now && now <= end
}

export function getSessionLabel(session) {
  if (!session) return ''
  const types = {
    'Practice 1': 'FP1',
    'Practice 2': 'FP2',
    'Practice 3': 'FP3',
    'Sprint Shootout': 'SQ',
    'Sprint': 'Sprint',
    'Qualifying': 'Qualifying',
    'Race': 'Race'
  }
  return types[session.session_name] || session.session_name || ''
}

export function formatCountdown(targetDate) {
  if (!targetDate) return null
  const diff = new Date(targetDate).getTime() - Date.now()
  if (diff <= 0) return null
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}
