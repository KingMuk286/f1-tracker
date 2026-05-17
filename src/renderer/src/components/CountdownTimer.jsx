import { useState, useEffect } from 'react'
import { formatCountdown } from '../utils/sessionDetector'

export default function CountdownTimer({ targetDate, label }) {
  const [display, setDisplay] = useState(formatCountdown(targetDate))

  useEffect(() => {
    setDisplay(formatCountdown(targetDate))
    const id = setInterval(() => {
      setDisplay(formatCountdown(targetDate))
    }, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  if (!display) return null

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      {label && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>}
      <span className="countdown" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{display}</span>
    </div>
  )
}
