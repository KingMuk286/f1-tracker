import { useState, useMemo } from 'react'
import { useApiData } from '../hooks/useApiData'
import { useDriverPhotos } from '../hooks/useDriverPhotos'
import { jolpicaUrl, TTL } from '../constants/endpoints'
import { getTeams } from '../constants/teams'
import TeamDot from '../components/TeamDot'
import StatCard from '../components/StatCard'
import DriverAvatar from '../components/DriverAvatar'
import { formatPoints } from '../utils/lapFormatter'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, Legend
} from 'recharts'

export default function Teams({ season }) {
  const [selected, setSelected] = useState(null)
  const teams = getTeams(season)
  const { getPhoto } = useDriverPhotos(season)

  const { data: cStandings } = useApiData(`standings-constructors-${season}`, jolpicaUrl(season, 'constructorStandings.json'), TTL.STANDINGS, [season])
  const { data: dStandings } = useApiData(`standings-drivers-${season}`,      jolpicaUrl(season, 'driverStandings.json'),      TTL.STANDINGS, [season])

  const cList = cStandings?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || []
  const dList = dStandings?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings     || []

  const getCSt = teamId => cList.find(c => c.Constructor.constructorId === teamId)
  const getDSt = driverId => dList.find(d => d.Driver.driverId === driverId)

  const selectedTeam    = selected ? teams.find(t => t.id === selected) : null
  const selectedCSt     = selectedTeam ? getCSt(selectedTeam.id) : null

  // Per-driver results for selected team
  const d0 = selectedTeam?.drivers[0]
  const d1 = selectedTeam?.drivers[1]

  const { data: res0 } = useApiData(
    d0 ? `driver-results-${season}-${d0.id}` : 'noop',
    d0 ? jolpicaUrl(season, `drivers/${d0.id}/results.json?limit=100`) : null,
    TTL.RESULTS, [season, selected]
  )
  const { data: res1 } = useApiData(
    d1 ? `driver-results-${season}-${d1.id}` : 'noop',
    d1 ? jolpicaUrl(season, `drivers/${d1.id}/results.json?limit=100`) : null,
    TTL.RESULTS, [season, selected]
  )

  const races0 = res0?.MRData?.RaceTable?.Races || []
  const races1 = res1?.MRData?.RaceTable?.Races || []

  function driverStats(races) {
    let podiums = 0, dnfs = 0, totalPos = 0, n = 0, pts = 0
    races.forEach(r => {
      const res = r.Results?.[0]
      if (!res) return
      const pos = parseInt(res.position)
      pts += parseFloat(res.points || 0)
      if (!isNaN(pos)) { totalPos += pos; n++ }
      if (pos <= 3) podiums++
      const st = res.status || ''
      if (st !== 'Finished' && !st.startsWith('+')) dnfs++
    })
    return { podiums, dnfs, avgPos: n ? (totalPos / n).toFixed(1) : '—', pts }
  }

  const st0 = useMemo(() => driverStats(races0), [races0])
  const st1 = useMemo(() => driverStats(races1), [races1])

  // h2h between team drivers
  const h2h = useMemo(() => {
    let a = 0, b = 0
    races0.forEach(rA => {
      const rB = races1.find(r => r.round === rA.round)
      if (!rB) return
      const pA = parseInt(rA.Results?.[0]?.position)
      const pB = parseInt(rB.Results?.[0]?.position)
      if (!isNaN(pA) && !isNaN(pB)) { if (pA < pB) a++; else if (pB < pA) b++ }
    })
    return { a, b }
  }, [races0, races1])

  // Shared rounds combined pts chart
  const sharedRounds = [...new Set([...races0.map(r => r.round), ...races1.map(r => r.round)])]
    .sort((a, b) => parseInt(a) - parseInt(b))

  const driverPtsChart = d0 && d1 ? sharedRounds.map(round => {
    const r0 = races0.find(r => r.round === round)
    const r1 = races1.find(r => r.round === round)
    return {
      race: `R${round}`,
      [d0.short]: parseFloat(r0?.Results?.[0]?.points || 0),
      [d1.short]: parseFloat(r1?.Results?.[0]?.points || 0),
    }
  }) : []

  // Constructor bar chart for all teams
  const constructorChart = teams.map(t => {
    const st = getCSt(t.id)
    return { name: t.name.length > 9 ? t.name.slice(0, 9) : t.name, points: parseFloat(st?.points || 0), color: t.color, id: t.id }
  }).sort((a, b) => b.points - a.points)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '300px 1fr' : '1fr', gap: 16, alignItems: 'start' }}>

      {/* Team grid */}
      <div>
        <div className="section-header">
          <span className="section-title">Teams — {season}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{teams.length} teams</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {teams.map(t => {
            const cst = getCSt(t.id)
            const d0st = getDSt(t.drivers[0]?.id)
            const d1st = getDSt(t.drivers[1]?.id)
            return (
              <div
                key={t.id}
                className={`team-card ${selected === t.id ? 'selected' : ''}`}
                onClick={() => setSelected(selected === t.id ? null : t.id)}
                style={{ borderLeft: `3px solid ${t.color}` }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{t.name}</div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {t.drivers.map((d, i) => {
                        const dst = getDSt(d.id)
                        return (
                          <div key={d.id} className="flex-center gap-6">
                            <DriverAvatar photoUrl={getPhoto(d.short, d.number)} name={d.name} number={d.number} teamColor={t.color} size={28} />
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 600 }}>{d.short}</div>
                              {dst && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>P{dst.position} · {formatPoints(dst.points)}</div>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {cst && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: t.color }}>{formatPoints(cst.points)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>pts · P{cst.position}</div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedTeam && (
        <div>
          {/* Header */}
          <div className="section-header">
            <div className="flex-center gap-10">
              <div style={{ width: 4, height: 28, background: selectedTeam.color, borderRadius: 2 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{selectedTeam.name}</div>
                {selectedCSt && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    P{selectedCSt.position} Constructor · {formatPoints(selectedCSt.points)} pts · {selectedCSt.wins} wins
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Constructor stats */}
          {selectedCSt && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              <StatCard label="Position" value={`P${selectedCSt.position}`} accent={selectedTeam.color} />
              <StatCard label="Points" value={formatPoints(selectedCSt.points)} />
              <StatCard label="Wins" value={selectedCSt.wins} />
              <StatCard label="Drivers" value={selectedTeam.drivers.length} />
            </div>
          )}

          {/* Driver side-by-side */}
          <div className="card page-section">
            <div className="card-title">Driver Comparison</div>
            <div className="grid-2" style={{ gap: 24 }}>
              {selectedTeam.drivers.map((d, idx) => {
                const dst = getDSt(d.id)
                const stx = idx === 0 ? st0 : st1
                return (
                  <div key={d.id}>
                    <div className="flex-center gap-10" style={{ marginBottom: 12 }}>
                      <DriverAvatar photoUrl={getPhoto(d.short, d.number)} name={d.name} number={d.number} teamColor={selectedTeam.color} size={56} />
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: selectedTeam.color }}>#{d.number}</div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{d.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.short}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <StatCard label="Pos" value={dst ? `P${dst.position}` : '—'} />
                      <StatCard label="Pts" value={dst ? formatPoints(dst.points) : '—'} />
                      <StatCard label="Wins" value={dst?.wins ?? '—'} />
                      <StatCard label="Podiums" value={stx.podiums} />
                      <StatCard label="Avg Pos" value={stx.avgPos} />
                      <StatCard label="DNFs" value={stx.dnfs} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* h2h bar */}
            {d0 && d1 && (h2h.a + h2h.b > 0) && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Teammate Head-to-Head
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{h2h.a} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{d0.short}</span></span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}><span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{d1.short}</span> {h2h.b}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: selectedTeam.color, opacity: 0.3, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(h2h.a / (h2h.a + h2h.b)) * 100}%`, background: selectedTeam.color, opacity: 1, borderRadius: 4 }} />
                </div>
              </div>
            )}
          </div>

          {/* Points per race chart */}
          {driverPtsChart.length > 0 && d0 && d1 && (
            <div className="card page-section">
              <div className="card-title">Points Per Race — {d0.short} vs {d1.short}</div>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={driverPtsChart} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey={d0.short} fill={selectedTeam.color} fillOpacity={0.9} radius={[2, 2, 0, 0]} />
                    <Bar dataKey={d1.short} fill={selectedTeam.color} fillOpacity={0.4} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* All constructors chart */}
          <div className="card">
            <div className="card-title">Constructor Points — All {season} Teams</div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={constructorChart} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />
                  <Bar dataKey="points" radius={[3, 3, 0, 0]}>
                    {constructorChart.map((entry, i) => (
                      <Cell key={i} fill={entry.color} fillOpacity={entry.id === selectedTeam.id ? 1 : 0.3} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
