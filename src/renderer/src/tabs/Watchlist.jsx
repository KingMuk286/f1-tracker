import { useApiData } from '../hooks/useApiData'
import { useDriverPhotos } from '../hooks/useDriverPhotos'
import { useWatchlist } from '../context/WatchlistContext'
import { jolpicaUrl, TTL } from '../constants/endpoints'
import { getTeams, constructorColor } from '../constants/teams'
import TeamDot from '../components/TeamDot'
import DriverAvatar from '../components/DriverAvatar'
import StatCard from '../components/StatCard'
import { formatPoints } from '../utils/lapFormatter'

function PinButton({ id, style }) {
  const { isPinned, toggle } = useWatchlist()
  const pinned = isPinned(id)
  return (
    <button
      onClick={() => toggle(id)}
      style={{
        fontSize: 14, padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
        background: pinned ? '#FF870022' : 'var(--card)',
        border: `1px solid ${pinned ? '#FF8700' : 'var(--border)'}`,
        color: pinned ? '#FF8700' : 'var(--text-muted)',
        ...style
      }}
      title={pinned ? 'Remove from watchlist' : 'Add to watchlist'}
    >
      {pinned ? '★' : '☆'}
    </button>
  )
}

function WatchlistDriverCard({ driver, standing, season }) {
  const { getPhoto } = useDriverPhotos()
  const photo = getPhoto(driver.short, driver.number)

  const { data: resultsData } = useApiData(
    `driver-results-${season}-${driver.id}`,
    jolpicaUrl(season, `drivers/${driver.id}/results.json?limit=5`),
    TTL.RESULTS, [season, driver.id]
  )
  const lastRace = resultsData?.MRData?.RaceTable?.Races?.slice(-1)[0]
  const lastResult = lastRace?.Results?.[0]

  return (
    <div className="card" style={{ borderLeft: `3px solid ${driver.teamColor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <DriverAvatar photoUrl={photo} name={driver.name} number={driver.number} teamColor={driver.teamColor} size={52} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{driver.name}</div>
          <div className="flex-center gap-6" style={{ marginTop: 2 }}>
            <TeamDot color={driver.teamColor} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{driver.teamName} · #{driver.number}</span>
          </div>
        </div>
        <PinButton id={driver.id} />
      </div>

      {standing ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
          <StatCard label="Position" value={`P${standing.position}`} accent={driver.teamColor} />
          <StatCard label="Points" value={formatPoints(standing.points)} />
          <StatCard label="Wins" value={standing.wins} />
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>Standings loading…</div>
      )}

      {lastRace && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Last race: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{lastRace.raceName}</span>
          {lastResult && (
            <span style={{ marginLeft: 6, color: parseInt(lastResult.position) <= 3 ? driver.teamColor : 'var(--text-secondary)', fontWeight: 600 }}>
              P{lastResult.position} · {lastResult.points} pts
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function WatchlistTeamCard({ team, standing, season }) {
  const { data: resultsData } = useApiData(
    `constructor-results-${season}-${team.id}-recent`,
    jolpicaUrl(season, `constructors/${team.id}/results.json?limit=10`),
    TTL.RESULTS, [season, team.id]
  )
  const lastRace = resultsData?.MRData?.RaceTable?.Races?.slice(-1)[0]
  const teamPts = (lastRace?.Results || []).reduce((s, r) => s + parseFloat(r.points || 0), 0)

  return (
    <div className="card" style={{ borderLeft: `3px solid ${team.color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 4, height: 40, background: team.color, borderRadius: 2, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{team.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {team.drivers.map(d => d.name).join(' · ')}
          </div>
        </div>
        <PinButton id={team.id} />
      </div>

      {standing ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
          <StatCard label="Position" value={`P${standing.position}`} accent={team.color} />
          <StatCard label="Points" value={formatPoints(standing.points)} />
          <StatCard label="Wins" value={standing.wins} />
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>Standings loading…</div>
      )}

      {lastRace && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Last race: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{lastRace.raceName}</span>
          {teamPts > 0 && (
            <span style={{ marginLeft: 6, color: team.color, fontWeight: 600 }}>+{teamPts} pts</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function Watchlist({ season }) {
  const { pinned, toggle } = useWatchlist()
  const teams = getTeams(season)

  const allDrivers = teams.flatMap(t =>
    t.drivers.map(d => ({ ...d, teamId: t.id, teamName: t.name, teamColor: t.color }))
  )

  const { data: dStandData } = useApiData(
    `standings-drivers-${season}`, jolpicaUrl(season, 'driverStandings.json'), TTL.STANDINGS, [season]
  )
  const { data: cStandData } = useApiData(
    `standings-constructors-${season}`, jolpicaUrl(season, 'constructorStandings.json'), TTL.STANDINGS, [season]
  )

  const driverStandings = dStandData?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || []
  const constructorStandings = cStandData?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || []

  const pinnedDrivers = allDrivers.filter(d => pinned.includes(d.id))
  const pinnedTeams = teams.filter(t => pinned.includes(t.id))

  return (
    <div>
      <div className="section-header">
        <span className="section-title">Watchlist — {season}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pinned.length} pinned</span>
      </div>

      {pinned.length === 0 ? (
        <div className="card" style={{ maxWidth: 480 }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>★ Nothing pinned yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Pin drivers from the <strong>Drivers</strong> tab and teams from the <strong>Teams</strong> tab using the ☆ button. They'll appear here with live stats.
          </div>
        </div>
      ) : (
        <>
          {pinnedDrivers.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Drivers ({pinnedDrivers.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {pinnedDrivers.map(d => {
                  const standing = driverStandings.find(s => s.Driver.driverId === d.id)
                  return <WatchlistDriverCard key={d.id} driver={d} standing={standing} season={season} />
                })}
              </div>
            </div>
          )}

          {pinnedTeams.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Teams ({pinnedTeams.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {pinnedTeams.map(t => {
                  const standing = constructorStandings.find(s => s.Constructor.constructorId === t.id)
                  return <WatchlistTeamCard key={t.id} team={t} standing={standing} season={season} />
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export { PinButton }
