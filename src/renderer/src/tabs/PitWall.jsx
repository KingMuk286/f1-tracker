import { useState, useMemo } from 'react'
import { useApiData } from '../hooks/useApiData'
import { useDriverPhotos } from '../hooks/useDriverPhotos'
import { jolpicaUrl, TTL } from '../constants/endpoints'
import { getTeams } from '../constants/teams'
import CustomSelect from '../components/CustomSelect'
import TeamDot from '../components/TeamDot'
import StatCard from '../components/StatCard'
import DriverAvatar from '../components/DriverAvatar'
import { formatPoints } from '../utils/lapFormatter'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

export default function PitWall({ season }) {
  const teams = getTeams(season)
  const { getPhoto } = useDriverPhotos(season)

  const [selectedId, setSelectedId] = useState(teams[0]?.id || '')
  const team = teams.find(t => t.id === selectedId) || teams[0]

  const teamOptions = teams.map(t => ({ value: t.id, label: t.name }))

  const d0 = team?.drivers[0]
  const d1 = team?.drivers[1]

  // Standings
  const { data: dData, stale } = useApiData(
    `standings-drivers-${season}`, jolpicaUrl(season, 'driverStandings.json'), TTL.STANDINGS, [season]
  )
  const { data: cData } = useApiData(
    `standings-constructors-${season}`, jolpicaUrl(season, 'constructorStandings.json'), TTL.STANDINGS, [season]
  )

  const driverStandings = dData?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || []
  const constructorStandings = cData?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || []

  const d0St = driverStandings.find(s => s.Driver.driverId === d0?.id)
  const d1St = driverStandings.find(s => s.Driver.driverId === d1?.id)
  const teamSt = constructorStandings.find(c => c.Constructor.constructorId === team?.id)

  // Race results
  const { data: res0, loading: l0 } = useApiData(
    d0 ? `driver-results-${season}-${d0.id}` : 'noop',
    d0 ? jolpicaUrl(season, `drivers/${d0.id}/results.json?limit=100`) : null,
    TTL.RESULTS, [season, selectedId]
  )
  const { data: res1, loading: l1 } = useApiData(
    d1 ? `driver-results-${season}-${d1.id}` : 'noop',
    d1 ? jolpicaUrl(season, `drivers/${d1.id}/results.json?limit=100`) : null,
    TTL.RESULTS, [season, selectedId]
  )

  const races0 = res0?.MRData?.RaceTable?.Races || []
  const races1 = res1?.MRData?.RaceTable?.Races || []

  // Race-by-race table
  const allRounds = useMemo(() => (
    [...new Set([...races0.map(r => r.round), ...races1.map(r => r.round)])]
      .sort((a, b) => parseInt(b) - parseInt(a))
  ), [races0, races1])

  const raceRows = useMemo(() => allRounds.map(round => {
    const r0 = races0.find(r => r.round === round)
    const r1 = races1.find(r => r.round === round)
    return {
      round,
      name: (r0 || r1)?.raceName || '',
      pos0: r0?.Results?.[0]?.position,
      pts0: r0?.Results?.[0]?.points,
      pos1: r1?.Results?.[0]?.position,
      pts1: r1?.Results?.[0]?.points,
    }
  }), [allRounds, races0, races1])

  // Cumulative points chart
  const chartData = useMemo(() => {
    let c0 = 0, c1 = 0
    return allRounds.slice().reverse().map(round => {
      const r0 = races0.find(r => r.round === round)
      const r1 = races1.find(r => r.round === round)
      c0 += parseFloat(r0?.Results?.[0]?.points || 0)
      c1 += parseFloat(r1?.Results?.[0]?.points || 0)
      return {
        race: `R${round}`,
        [d0?.short || 'D1']: c0,
        [d1?.short || 'D2']: c1,
      }
    })
  }, [allRounds, races0, races1, d0, d1])

  // H2H
  const h2h = useMemo(() => {
    let a = 0, b = 0
    races0.forEach(r0 => {
      const r1 = races1.find(r => r.round === r0.round)
      if (!r1) return
      const pA = parseInt(r0.Results?.[0]?.position)
      const pB = parseInt(r1.Results?.[0]?.position)
      if (!isNaN(pA) && !isNaN(pB)) { if (pA < pB) a++; else if (pB < pA) b++ }
    })
    return { a, b }
  }, [races0, races1])

  if (!team) return <div className="loading">No team data</div>

  return (
    <div>
      {stale && <div className="stale-badge mb-12">Cached data</div>}

      {/* Header with team selector */}
      <div className="section-header mb-16">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 20, background: team.color, borderRadius: 2 }} />
          <span className="section-title">Pit Wall — {season}</span>
        </div>
        <CustomSelect
          value={selectedId}
          onChange={setSelectedId}
          options={teamOptions}
          buttonStyle={{ fontSize: 13, fontWeight: 600, minWidth: 160 }}
        />
      </div>

      {/* Constructor banner */}
      {teamSt && (
        <div className="card mb-16" style={{ borderLeft: `3px solid ${team.color}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TeamDot color={team.color} size={10} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>{team.name}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>
              P{teamSt.position} Constructor · {formatPoints(teamSt.points)} pts · {teamSt.wins} wins
            </span>
          </div>
        </div>
      )}

      {/* Driver stat cards */}
      <div className="grid-2 mb-16">
        {[d0, d1].map((d, idx) => {
          const dst = idx === 0 ? d0St : d1St
          if (!d) return null
          return (
            <div key={d.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <DriverAvatar
                  photoUrl={getPhoto(d.short, d.number)}
                  name={d.name}
                  number={d.number}
                  teamColor={team.color}
                  size={40}
                />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>#{d.number} · {d.short}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <StatCard label="Position" value={dst ? `P${dst.position}` : '—'} accent={team.color} />
                <StatCard label="Points"   value={dst ? formatPoints(dst.points) : '—'} />
                <StatCard label="Wins"     value={dst?.wins ?? '—'} />
              </div>
            </div>
          )
        })}
      </div>

      {/* H2H bar */}
      {d0 && d1 && (h2h.a + h2h.b > 0) && (
        <div className="card mb-16">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Teammate Head-to-Head
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {h2h.a} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{d0.short}</span>
            </span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{d1.short}</span> {h2h.b}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: `${team.color}33`, position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, height: '100%',
              width: `${(h2h.a / (h2h.a + h2h.b)) * 100}%`,
              background: team.color, borderRadius: 4,
            }} />
          </div>
        </div>
      )}

      {/* Cumulative points chart */}
      {chartData.length > 0 && d0 && d1 && (
        <div className="card page-section">
          <div className="card-title">Cumulative Points — {d0.short} vs {d1.short}</div>
          <div className="chart-wrap" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
                <XAxis dataKey="race" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey={d0.short} stroke={team.color} strokeWidth={2}   dot={false} activeDot={{ r: 3 }} />
                <Line type="monotone" dataKey={d1.short} stroke={team.color} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" strokeOpacity={0.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Race-by-race table */}
      <div className="section-header">
        <span className="section-title">Race by Race</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {l0 || l1 ? (
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
                  <span style={{ color: team.color }}>{d0?.short}</span> Pos
                </th>
                <th style={{ textAlign: 'center' }}>
                  <span style={{ color: team.color }}>{d0?.short}</span> Pts
                </th>
                <th style={{ textAlign: 'center' }}>
                  <span style={{ color: team.color, opacity: 0.6 }}>{d1?.short}</span> Pos
                </th>
                <th style={{ textAlign: 'center' }}>
                  <span style={{ color: team.color, opacity: 0.6 }}>{d1?.short}</span> Pts
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
                    {row.pos0 ? `P${row.pos0}` : '—'}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {row.pts0 ?? '—'}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>
                    {row.pos1 ? `P${row.pos1}` : '—'}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {row.pts1 ?? '—'}
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
