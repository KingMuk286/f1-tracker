import Logo from './Logo'
import NotificationBell from './NotificationBell'
import CustomSelect from './CustomSelect'
import { useLiveSession } from '../hooks/useLiveSession'
import { getSessionLabel } from '../utils/sessionDetector'

export default function Header({ season, onSeasonChange, theme, onToggleTheme }) {
  const { isLive, session } = useLiveSession()

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      height: 52,
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
      flexShrink: 0,
    }}>
      {/* Left — logo + live badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logo size={30} showText={true} />

        {isLive && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 700,
            color: '#16a34a',
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: 5,
            padding: '3px 9px',
            letterSpacing: '0.03em',
          }}>
            <span style={{
              display: 'inline-block', width: 6, height: 6,
              borderRadius: '50%', background: '#22c55e',
            }} />
            LIVE {session ? `· ${getSessionLabel(session)}` : ''}
          </div>
        )}
      </div>

      {/* Right — controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          style={{
            padding: '4px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
            background: 'var(--card)', border: '1px solid var(--border)',
            color: 'var(--text-muted)', fontWeight: 500,
          }}
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>

        {/* Notification bell */}
        <NotificationBell />

        {/* Season selector */}
        <CustomSelect
          value={season}
          onChange={v => onSeasonChange(Number(v))}
          options={[
            { value: 2023, label: '2023 Season' },
            { value: 2024, label: '2024 Season' },
            { value: 2025, label: '2025 Season' },
            { value: 2026, label: '2026 Season' },
          ]}
          buttonStyle={{ fontWeight: 600 }}
        />
      </div>
    </div>
  )
}
