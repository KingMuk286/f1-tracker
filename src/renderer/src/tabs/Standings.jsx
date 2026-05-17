import { useApiData } from '../hooks/useApiData'
import { jolpicaUrl, TTL } from '../constants/endpoints'
import { getTeamColor, getTeams } from '../constants/teams'
import TeamDot from '../components/TeamDot'
import { formatPoints } from '../utils/lapFormatter'

// Map Jolpica constructorId to our team IDs
const CONSTRUCTOR_MAP = {
  mclaren: 'mclaren', ferrari: 'ferrari', mercedes: 'mercedes',
  red_bull: 'red_bull', aston_martin: 'aston_martin', alpine: 'alpine',
  williams: 'williams', haas: 'haas', sauber: 'sauber', rb: 'rb',
  audi: 'audi', racing_bulls: 'racing_bulls', cadillac: 'cadillac'
}

function resolveTeamColor(constructorId, season) {
  const id = CONSTRUCTOR_MAP[constructorId] || constructorId
  return getTeamColor(id, season)
}

export default function Standings({ season }) {
  const dUrl = jolpicaUrl(season, 'driverStandings.json')
  const cUrl = jolpicaUrl(season, 'constructorStandings.json')

  const { data: dData, loading: dLoading, stale: dStale } = useApiData(
    `standings-drivers-${season}`, dUrl, TTL.STANDINGS, [season]
  )
  const { data: cData, loading: cLoading, stale: cStale } = useApiData(
    `standings-constructors-${season}`, cUrl, TTL.STANDINGS, [season]
  )

  const drivers = dData?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || []
  const constructors = cData?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || []

  const validDrivers = drivers.filter(d =>
    d.Driver?.familyName && d.Driver.familyName.length > 1 && /^[A-Za-z\s\-']+$/.test(d.Driver.familyName)
  )

  const isMcLaren = (d) => d?.Constructors?.[0]?.constructorId === 'mclaren'

  return (
    <div>
      {(dStale || cStale) && (
        <div className="stale-badge mb-12">Cached data — unable to refresh</div>
      )}
      {season === 2026 && !dLoading && validDrivers.length === 0 && (
        <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          2026 standings data is not yet available from the API. Check back after the season begins.
        </div>
      )}
      {season === 2026 && !dLoading && validDrivers.length > 0 && (
        <div className="stale-badge mb-12" style={{ marginBottom: 8 }}>
          2026 API data may be incomplete
        </div>
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Driver Standings */}
        <div className="page-section">
          <div className="section-header">
            <span className="section-title">Driver Championship</span>
            <div className="flex-center gap-8">
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{season}</span>
              {validDrivers.length > 0 && (
                <button
                  onClick={async () => {
                    const header = 'Position,Driver,Team,Points,Wins'
                    const rows = validDrivers.map(d =>
                      `${d.position},"${d.Driver.givenName} ${d.Driver.familyName}","${d.Constructors?.[0]?.name || ''}",${d.points},${d.wins}`
                    )
                    await window.api.exportCsv(`driver_standings_${season}.csv`, [header, ...rows].join('\n'))
                  }}
                  style={{ fontSize: 11, padding: '3px 9px', borderRadius: 4, cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                >
                  Export CSV
                </button>
              )}
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {dLoading ? (
              <div className="loading">Loading standings…</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>Pos</th>
                    <th>Driver</th>
                    <th>Team</th>
                    <th style={{ textAlign: 'right' }}>Pts</th>
                    <th style={{ textAlign: 'right' }}>W</th>
                  </tr>
                </thead>
                <tbody>
                  {validDrivers.map((d, i) => {
                    const mc = isMcLaren(d)
                    const color = resolveTeamColor(d.Constructors?.[0]?.constructorId, season)
                    return (
                      <tr key={i} className={mc ? 'mclaren-row' : ''}>
                        <td className="pos">{d.position}</td>
                        <td>
                          <span className="driver-name">
                            {d.Driver.givenName[0]}. {d.Driver.familyName}
                          </span>
                        </td>
                        <td>
                          <div className="flex-center gap-6">
                            <TeamDot color={color} />
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {d.Constructors?.[0]?.name}
                            </span>
                          </div>
                        </td>
                        <td className="points" style={{ textAlign: 'right' }}>
                          {formatPoints(d.points)}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>
                          {d.wins}
                        </td>
                      </tr>
                    )
                  })}
                  {!dLoading && validDrivers.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No data available</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Constructor Standings */}
        <div className="page-section">
          <div className="section-header">
            <span className="section-title">Constructor Championship</span>
            <div className="flex-center gap-8">
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{season}</span>
              {constructors.length > 0 && (
                <button
                  onClick={async () => {
                    const header = 'Position,Team,Points,Wins'
                    const rows = constructors.map(c =>
                      `${c.position},"${c.Constructor.name}",${c.points},${c.wins}`
                    )
                    await window.api.exportCsv(`constructor_standings_${season}.csv`, [header, ...rows].join('\n'))
                  }}
                  style={{ fontSize: 11, padding: '3px 9px', borderRadius: 4, cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                >
                  Export CSV
                </button>
              )}
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {cLoading ? (
              <div className="loading">Loading standings…</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>Pos</th>
                    <th>Team</th>
                    <th style={{ textAlign: 'right' }}>Pts</th>
                    <th style={{ textAlign: 'right' }}>W</th>
                  </tr>
                </thead>
                <tbody>
                  {constructors.map((c, i) => {
                    const color = resolveTeamColor(c.Constructor.constructorId, season)
                    const isMc = c.Constructor.constructorId === 'mclaren'
                    return (
                      <tr key={i} className={isMc ? 'mclaren-row' : ''}>
                        <td className="pos">{c.position}</td>
                        <td>
                          <div className="flex-center gap-8">
                            <TeamDot color={color} />
                            <span className="driver-name">{c.Constructor.name}</span>
                          </div>
                        </td>
                        <td className="points" style={{ textAlign: 'right' }}>
                          {formatPoints(c.points)}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>
                          {c.wins}
                        </td>
                      </tr>
                    )
                  })}
                  {!cLoading && constructors.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No data available</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
