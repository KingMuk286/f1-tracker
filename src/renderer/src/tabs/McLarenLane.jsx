import { useState } from 'react'
import { useApiData } from '../hooks/useApiData'
import { jolpicaUrl, TTL } from '../constants/endpoints'
import { getTeams } from '../constants/teams'
import TeamDot from '../components/TeamDot'
import StatCard from '../components/StatCard'
import { formatPoints, formatLapTime, lapToSeconds } from '../utils/lapFormatter'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

export default function McLarenLane({ season }) {
  const teams = getTeams(season)
  const mclaren = teams.find(t => t.id === 'mclaren')
  const norris  = mclaren?.drivers[0]
  const piastri = mclaren?.drivers[1]

  const [selectedRace, setSelectedRace] = useState('')

  // standings
  const dUrl = jolpicaUrl(season, 'driverStandings.json')
  const { data: dData, stale: dStale } = useApiData(`standings-drivers-${season}`, dUrl, TTL.STANDINGS, [season])
  const standings = dData?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || []

  const norrisSt  = standings.find(s => s.Driver.driverId === 'norris')
  const piastriSt = standings.find(s => s.Driver.driverId === 'piastri')
  const mcStanding = dData?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings
    ? null  // placeholder — constructor standings fetched separately
    : null

  // constructor standings
  const cUrl = jolpicaUrl(season, 'constructorStandings.json')
  const { data: cData } = useApiData(`standings-constructors-${season}`, cUrl, TTL.STANDINGS, [season])
  const mcConst = cData?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings
    ?.find(c => c.Constructor.constructorId === 'mclaren')

  // race results for both
  const norrisUrl  = jolpicaUrl(season, 'drivers/norris/results.json?limit=100')
  const piastriUrl = jolpicaUrl(season, 'drivers/piastri/results.json?limit=100')

  const { data: norrisData,  loading: nLoading  } = useApiData(`norris-results-${season}`,  norrisUrl,  TTL.RESULTS, [season])
  const { data: piastriData, loading: pLoading  } = useApiData(`piastri-results-${season}`, piastriUrl, TTL.RESULTS, [season])

  const norrisRaces  = norrisData?.MRData?.RaceTable?.Races  || []
  const piastriRaces = piastriData?.MRData?.RaceTable?.Races || []

  // combined race table
  const allRounds = [...new Set([
    ...norrisRaces.map(r => r.round),
    ...piastriRaces.map(r => r.round)
  ])].sort((a, b) => parseInt(b) - parseInt(a))

  const raceRows = allRounds.map(round => {
    const nr = norrisRaces.find(r => r.round === round)
    const pr = piastriRaces.find(r => r.round === round)
    return {
      round,
      name: (nr || pr)?.raceName || '',
      norrisPos: nr?.Results?.[0]?.position,
      norrisPts: nr?.Results?.[0]?.points,
      piastriPos: pr?.Results?.[0]?.position,
      piastriPts: pr?.Results?.[0]?.points,
    }
  })

  // lap time chart data (race lap times if available)
  // build cumulative points chart
  let nCum = 0, pCum = 0
  const chartData = allRounds.slice().reverse().map(round => {
    const nr = norrisRaces.find(r => r.round === round)
    const pr = piastriRaces.find(r => r.round === round)
    nCum += parseFloat(nr?.Results?.[0]?.points || 0)
    pCum += parseFloat(pr?.Results?.[0]?.points || 0)
    return { race: `R${round}`, Norris: nCum, Piastri: pCum }
  })

  return (
    <div>
      {dStale && <div className="stale-badge mb-12">Cached data</div>}

      {/* header */}
      <div className="section-header mb-16">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 20, background: '#FF8700', borderRadius: 2 }} />
          <span className="section-title">McLaren Lane — {season}</span>
        </div>
      </div>

      {/* constructor card */}
      {mcConst && (
        <div className="card mb-16" style={{ borderLeft: '3px solid #FF8700' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TeamDot color="#FF8700" size={10} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>McLaren</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>
              P{mcConst.position} Constructor — {formatPoints(mcConst.points)} pts — {mcConst.wins} wins
            </span>
          </div>
        </div>
      )}

      {/* driver stat cards */}
      <div className="grid-2 mb-16">
        {/* Norris */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#FF8700' }}>
              #{norris?.number}
            </span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Lando Norris</span>
          </div>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <StatCard label="Position" value={norrisSt ? `P${norrisSt.position}` : '—'} accent="#FF8700" />
            <StatCard label="Points" value={norrisSt ? formatPoints(norrisSt.points) : '—'} />
            <StatCard label="Wins" value={norrisSt?.wins ?? '—'} />
          </div>
        </div>

        {/* Piastri */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#e8a020' }}>
              #{piastri?.number}
            </span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Oscar Piastri</span>
          </div>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <StatCard label="Position" value={piastriSt ? `P${piastriSt.position}` : '—'} accent="#e8a020" />
            <StatCard label="Points" value={piastriSt ? formatPoints(piastriSt.points) : '—'} />
            <StatCard label="Wins" value={piastriSt?.wins ?? '—'} />
          </div>
        </div>
      </div>

      {/* cumulative points chart */}
      {chartData.length > 0 && (
        <div className="card page-section">
          <div className="card-title">Cumulative Points — Norris vs Piastri</div>
          <div className="chart-wrap" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
                <XAxis dataKey="race" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Norris"  stroke="#FF8700" strokeWidth={2}   dot={false} activeDot={{ r: 3 }} />
                <Line type="monotone" dataKey="Piastri" stroke="#e8a020" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* race by race table */}
      <div className="section-header">
        <span className="section-title">Race by Race</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {nLoading || pLoading ? (
          <div className="loading">Loading results…</div>
        ) : raceRows.length === 0 ? (
          <div className="loading">No race data yet</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rd</th>
                <th>Race</th>
                <th style={{ textAlign: 'center' }}>
                  <span style={{ color: '#FF8700' }}>NOR</span> Pos
                </th>
                <th style={{ textAlign: 'center' }}>
                  <span style={{ color: '#FF8700' }}>NOR</span> Pts
                </th>
                <th style={{ textAlign: 'center' }}>
                  <span style={{ color: '#e8a020' }}>PIA</span> Pos
                </th>
                <th style={{ textAlign: 'center' }}>
                  <span style={{ color: '#e8a020' }}>PIA</span> Pts
                </th>
              </tr>
            </thead>
            <tbody>
              {raceRows.map((row, i) => (
                <tr key={i}>
                  <td className="pos">{row.round}</td>
                  <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.name}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>
                    {row.norrisPos ? `P${row.norrisPos}` : '—'}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {row.norrisPts ?? '—'}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>
                    {row.piastriPos ? `P${row.piastriPos}` : '—'}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {row.piastriPts ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
