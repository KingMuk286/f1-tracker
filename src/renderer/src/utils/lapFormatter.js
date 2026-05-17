// Convert "1:23.456" or seconds float to display string
export function formatLapTime(raw) {
  if (!raw) return '—'
  if (typeof raw === 'string' && raw.includes(':')) return raw
  const secs = parseFloat(raw)
  if (isNaN(secs)) return '—'
  const m = Math.floor(secs / 60)
  const s = (secs % 60).toFixed(3).padStart(6, '0')
  return `${m}:${s}`
}

// Convert lap time string to seconds for comparison
export function lapToSeconds(str) {
  if (!str || str === '—') return null
  if (!str.includes(':')) return parseFloat(str)
  const [m, s] = str.split(':')
  return parseInt(m, 10) * 60 + parseFloat(s)
}

// Format gap: "+1.234" or "1 lap"
export function formatGap(gap) {
  if (!gap) return '—'
  if (gap === '0.0' || gap === '0') return 'LEADER'
  return gap.startsWith('+') || gap.startsWith('-') ? gap : `+${gap}`
}

// Format points to 1 decimal if fractional
export function formatPoints(pts) {
  if (pts === undefined || pts === null) return '0'
  const n = parseFloat(pts)
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
