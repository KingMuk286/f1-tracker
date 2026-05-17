import { useLiveSession } from '../hooks/useLiveSession'
import { useWatchlist } from '../context/WatchlistContext'

const TABS = [
  { id: 'team',        label: 'Team Focus' },
  { id: 'live',        label: 'Live Timing', live: true },
  { id: 'standings',   label: 'Standings' },
  { id: 'results',     label: 'Results' },
  { id: 'calendar',    label: 'Calendar' },
  { id: 'drivers',     label: 'Drivers' },
  { id: 'teams',       label: 'Teams' },
  { id: 'compare',     label: 'Compare' },
  { id: 'analytics',   label: 'Analytics' },
  { id: 'weather',     label: 'Weather' },
  { id: 'pitStrategy', label: 'Pit Strategy' },
  { id: 'telemetry',   label: 'Telemetry' },
  { id: 'watchlist',   label: 'Watchlist', watchlist: true },
  { id: 'replay',      label: 'Replay' },
]

export default function TabBar({ active, onChange }) {
  const { isLive } = useLiveSession()
  const { pinned } = useWatchlist()

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
      padding: '0 28px',
      overflowX: 'auto',
      flexShrink: 0,
    }}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            padding: '10px 14px', fontSize: 13,
            fontWeight: active === tab.id ? 600 : 400,
            color: active === tab.id ? 'var(--text)' : 'var(--text-muted)',
            marginBottom: -1, whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none',
            borderBottom: active === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          {tab.live && isLive && <span className="live-dot" />}
          {tab.watchlist && pinned.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              background: 'var(--accent)', color: '#fff',
              borderRadius: '50%', width: 16, height: 16,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {pinned.length}
            </span>
          )}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
