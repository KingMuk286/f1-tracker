import { useState, useEffect } from 'react'
import { useLiveSession } from '../hooks/useLiveSession'
import { useWatchlist } from '../context/WatchlistContext'

const SECTIONS = [
  {
    label: null,
    items: [
      { id: 'live',      label: 'Live Timing', live: true },
      { id: 'replay',    label: 'Replay' },
    ],
  },
  {
    label: 'Season',
    items: [
      { id: 'standings', label: 'Standings' },
      { id: 'results',   label: 'Results' },
      { id: 'calendar',  label: 'Calendar' },
    ],
  },
  {
    label: 'Explore',
    items: [
      { id: 'drivers',     label: 'Drivers' },
      { id: 'teams',       label: 'Teams' },
      { id: 'watchlist',   label: 'Watchlist', watchlist: true },
      { id: 'pitWall',     label: 'Pit Wall' },
    ],
  },
  {
    label: 'Analysis',
    collapsible: true,
    items: [
      { id: 'analytics',   label: 'Analytics' },
      { id: 'compare',     label: 'Compare' },
      { id: 'telemetry',   label: 'Telemetry' },
      { id: 'pitStrategy', label: 'Pit Strategy' },
      { id: 'weather',     label: 'Weather' },
    ],
  },
]

const ANALYSIS_IDS = ['analytics', 'compare', 'telemetry', 'pitStrategy', 'weather']

export default function Sidebar({ active, onChange }) {
  const { isLive } = useLiveSession()
  const { pinned } = useWatchlist()
  const [collapsed, setCollapsed] = useState(() => !ANALYSIS_IDS.includes(active))

  // Auto-expand if active tab is inside Analysis
  useEffect(() => {
    if (ANALYSIS_IDS.includes(active)) setCollapsed(false)
  }, [active])

  return (
    <div style={{
      width: 168,
      height: '100%',
      borderRight: '1px solid var(--border)',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflowY: 'auto',
      paddingBottom: 12,
    }}>
      {SECTIONS.map((section, si) => {
        const isCollapsible = !!section.collapsible
        const isExpanded = !isCollapsible || !collapsed

        return (
          <div key={si}>
            {section.label && (
              <button
                onClick={() => isCollapsible && setCollapsed(c => !c)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '10px 12px 3px',
                  background: 'none', border: 'none',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                  color: 'var(--text-muted)', textTransform: 'uppercase',
                  cursor: isCollapsible ? 'pointer' : 'default',
                }}
              >
                {section.label}
                {isCollapsible && (
                  <span style={{
                    fontSize: 8, color: 'var(--text-muted)',
                    display: 'inline-block',
                    transform: isExpanded ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.15s',
                  }}>▼</span>
                )}
              </button>
            )}
            {section.label === null && <div style={{ height: 8 }} />}
            {isExpanded && section.items.map(item => {
              const isActive = active === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onChange(item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    width: '100%', padding: '5px 12px 5px 10px',
                    background: isActive ? 'var(--accent-light)' : 'transparent',
                    border: 'none',
                    borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--card)'
                      e.currentTarget.style.color = 'var(--text)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--text-muted)'
                    }
                  }}
                >
                  {item.live && isLive && <span className="live-dot" />}
                  {item.watchlist && pinned.length > 0 && (
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      background: 'var(--accent)', color: '#fff',
                      borderRadius: '50%', width: 14, height: 14,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {pinned.length}
                    </span>
                  )}
                  {item.label}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
