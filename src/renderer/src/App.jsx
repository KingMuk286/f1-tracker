import { useState } from 'react'
import { useTheme } from './hooks/useTheme'
import { NotificationProvider } from './context/NotificationContext'
import { WatchlistProvider } from './context/WatchlistContext'
import Header    from './components/Header'
import Sidebar   from './components/Sidebar'
import TeamFocus   from './tabs/TeamFocus'
import LiveTiming  from './tabs/LiveTiming'
import Standings   from './tabs/Standings'
import Results     from './tabs/Results'
import Calendar    from './tabs/Calendar'
import Drivers     from './tabs/Drivers'
import Teams       from './tabs/Teams'
import Compare     from './tabs/Compare'
import Analytics   from './tabs/Analytics'
import Weather     from './tabs/Weather'
import PitStrategy from './tabs/PitStrategy'
import Telemetry   from './tabs/Telemetry'
import Watchlist   from './tabs/Watchlist'
import RaceReplay  from './tabs/RaceReplay'

const TABS = {
  team:        TeamFocus,
  live:        LiveTiming,
  standings:   Standings,
  results:     Results,
  calendar:    Calendar,
  drivers:     Drivers,
  teams:       Teams,
  compare:     Compare,
  analytics:   Analytics,
  weather:     Weather,
  pitStrategy: PitStrategy,
  telemetry:   Telemetry,
  watchlist:   Watchlist,
  replay:      RaceReplay,
}

function AppInner() {
  const [activeTab, setActiveTab] = useState('team')
  const [season, setSeason] = useState(new Date().getFullYear() >= 2026 ? 2026 : 2025)
  const { theme, toggle } = useTheme()
  const TabContent = TABS[activeTab] || TeamFocus

  return (
    <div className="app">
      <div style={{ WebkitAppRegion: 'drag', height: 28, background: 'var(--bg)', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }} />
      <Header season={season} onSeasonChange={setSeason} theme={theme} onToggleTheme={toggle} />
      <div className="content-area" style={{ flexDirection: 'row' }}>
        <Sidebar active={activeTab} onChange={setActiveTab} />
        <div className="tab-content" style={{ flex: 1 }}><TabContent key={season} season={season} /></div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <NotificationProvider>
      <WatchlistProvider>
        <AppInner />
      </WatchlistProvider>
    </NotificationProvider>
  )
}
