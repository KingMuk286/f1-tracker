import { useState, useMemo } from 'react'
import { useApiData } from '../hooks/useApiData'
import { useDriverPhotos } from '../hooks/useDriverPhotos'
import { jolpicaUrl, TTL } from '../constants/endpoints'
import { constructorColor } from '../constants/teams'
import TeamDot from '../components/TeamDot'
import StatCard from '../components/StatCard'
import DriverAvatar from '../components/DriverAvatar'
import CustomSelect from '../components/CustomSelect'
import { formatPoints } from '../utils/lapFormatter'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

function calcDriverStats(races = []) {
  let wins = 0, podiums = 0, dnfs = 0, pts = 0, totalPos = 0, n = 0, fl = 0
  races.forEach(r => {
    const res = r.Results?.[0]; if (!res) return
    const pos = parseInt(res.position)
    const p = parseFloat(res.points || 0)
    pts += p
    if (!isNaN(pos)) { totalPos += pos; n++ }
    if (pos === 1) wins++
    if (pos <= 3) podiums++
    const st = res.status || ''
    if (st !== 'Finished' && !st.startsWith('+')) dnfs++
    if (res.FastestLap?.rank === '1') fl++
  })
  return { wins, podiums, dnfs, pts, fastestLaps: fl, avgPos: n ? (totalPos / n).toFixed(1) : '—', races: n }
}

function H2HBar({ a, b, colorA, colorB, labelA, labelB }) {
  const total = a + b
  if (!total) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No data yet</div>
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
        <span style={{ fontWeight: 700, color: colorA }}>{a} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>{labelA}</span></span>
        <span style={{ fontWeight: 700, color: colorB }}><span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>{labelB}</span> {b}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: colorB + '55', overflow: 'hidden' }}>
        <div style={{ width: `${(a / total) * 100}%`, height: '100%', background: colorA, borderRadius: 4 }} />
      </div>
    </div>
  )
}

export default function TeamFocus({ season }) {
  const { getPhoto } = useDriverPhotos()

  // ── Constructor standings (source of team list) ──
  const { data: cStData, loading: cLoading } = useApiData(
    `standings-constructors-${season}`, jolpicaUrl(season, 'constructorStandings.json'), TTL.STANDINGS, [season]
  )
  const constructors = cStData?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || []

  const [selectedId, setSelectedId] = useState('mclaren')

  // auto-correct if selected team doesn't exist this season
  const validIds = constructors.map(c => c.Constructor.constructorId)
  const effectiveId = validIds.includes(selectedId) ? selectedId : (validIds[0] || 'mclaren')

  const selectedCSt = constructors.find(c => c.Constructor.constructorId === effectiveId)
  const teamName    = selectedCSt?.Constructor?.name || effectiveId
  const teamColor   = constructorColor(effectiveId)

  // ── Driver standings filtered to this constructor ──
  const { data: dStData } = useApiData(
    `standings-drivers-${season}`, jolpicaUrl(season, 'driverStandings.json'), TTL.STANDINGS, [season]
  )
  const allDriverSt = dStData?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || []
  const teamDrivers = allDriverSt.filter(d => d.Constructors?.some(c => c.constructorId === effectiveId))
  const d0st = teamDrivers[0]
  const d1st = teamDrivers[1]

  const d0id = d0st?.Driver?.driverId
  const d1id = d1st?.Driver?.driverId
  const d0short = d0st?.Driver?.code || ''
  const d1short = d1st?.Driver?.code || ''
  const d0name  = d0st ? `${d0st.Driver.givenName} ${d0st.Driver.familyName}` : ''
  const d1name  = d1st ? `${d1st.Driver.givenName} ${d1st.Driver.familyName}` : ''
  const d0num   = parseInt(d0st?.Driver?.permanentNumber || 0)
  const d1num   = parseInt(d1st?.Driver?.permanentNumber || 0)

  // ── Race results for each driver ──
  const { data: res0, loading: r0Loading } = useApiData(
    d0id ? `driver-results-${season}-${d0id}` : 'noop',
    d0id ? jolpicaUrl(season, `drivers/${d0id}/results.json?limit=100`) : null,
    TTL.RESULTS, [season, effectiveId]
  )
  const { data: res1, loading: r1Loading } = useApiData(
    d1id ? `driver-results-${season}-${d1id}` : 'noop',
    d1id ? jolpicaUrl(season, `drivers/${d1id}/results.json?limit=100`) : null,
    TTL.RESULTS, [season, effectiveId]
  )

  // ── Qualifying results ──
  const { data: qual0 } = useApiData(
    d0id ? `driver-qual-${season}-${d0id}` : 'noop',
    d0id ? jolpicaUrl(season, `drivers/${d0id}/qualifying.json?limit=100`) : null,
    TTL.RESULTS, [season, effectiveId]
  )
  const { data: qual1 } = useApiData(
    d1id ? `driver-qual-${season}-${d1id}` : 'noop',
    d1id ? jolpicaUrl(season, `drivers/${d1id}/qualifying.json?limit=100`) : null,
    TTL.RESULTS, [season, effectiveId]
  )

  const races0 = res0?.MRData?.RaceTable?.Races || []
  const races1 = res1?.MRData?.RaceTable?.Races || []
  const qual0r = qual0?.MRData?.RaceTable?.Races || []
  const qual1r = qual1?.MRData?.RaceTable?.Races || []

  const stats0 = useMemo(() => calcDriverStats(races0), [races0])
  const stats1 = useMemo(() => calcDriverStats(races1), [races1])

  // ── Head to head ──
  const raceH2H = useMemo(() => {
    let a = 0, b = 0
    races0.forEach(rA => {
      const rB = races1.find(r => r.round === rA.round); if (!rB) return
      const pA = parseInt(rA.Results?.[0]?.position)
      const pB = parseInt(rB.Results?.[0]?.position)
      if (!isNaN(pA) && !isNaN(pB)) { if (pA < pB) a++; else if (pB < pA) b++ }
    })
    return { a, b }
  }, [races0, races1])

  const qualH2H = useMemo(() => {
    let a = 0, b = 0
    qual0r.forEach(qA => {
      const qB = qual1r.find(q => q.round === qA.round); if (!qB) return
      const pA = parseInt(qA.QualifyingResults?.[0]?.position)
      const pB = parseInt(qB.QualifyingResults?.[0]?.position)
      if (!isNaN(pA) && !isNaN(pB)) { if (pA < pB) a++; else if (pB < pA) b++ }
    })
    return { a, b }
  }, [qual0r, qual1r])

  // ── Chart data ──
  const sharedRounds = [...new Set([...races0.map(r => r.round), ...races1.map(r => r.round)])]
    .sort((a, b) => parseInt(a) - parseInt(b))

  let cum0 = 0, cum1 = 0
  const cumChart = sharedRounds.map(round => {
    const r0 = races0.find(r => r.round === round)
    const r1 = races1.find(r => r.round === round)
    cum0 += parseFloat(r0?.Results?.[0]?.points || 0)
    cum1 += parseFloat(r1?.Results?.[0]?.points || 0)
    return { race: `R${round}`, [d0short || 'D1']: cum0, [d1short || 'D2']: cum1 }
  })

  const ptsPerRace = sharedRounds.map(round => {
    const r0 = races0.find(r => r.round === round)
    const r1 = races1.find(r => r.round === round)
    return {
      race: `R${round}`,
      [d0short || 'D1']: parseFloat(r0?.Results?.[0]?.points || 0),
      [d1short || 'D2']: parseFloat(r1?.Results?.[0]?.points || 0),
    }
  })

  const posHistory = sharedRounds.map(round => ({
    race: `R${round}`,
    [d0short || 'D1']: parseInt(races0.find(r => r.round === round)?.Results?.[0]?.position) || null,
    [d1short || 'D2']: parseInt(races1.find(r => r.round === round)?.Results?.[0]?.position) || null,
  }))

  const qualPosHistory = sharedRounds.map(round => ({
    race: `R${round}`,
    [d0short || 'D1']: parseInt(qual0r.find(r => r.round === round)?.QualifyingResults?.[0]?.position) || null,
    [d1short || 'D2']: parseInt(qual1r.find(r => r.round === round)?.QualifyingResults?.[0]?.position) || null,
  }))

  // slight color variation for D1 vs D2
  const color0 = teamColor
  const color1 = teamColor + 'AA'

  const teamOptions = constructors.map(c => ({
    value: c.Constructor.constructorId,
    label: c.Constructor.name,
  }))

  return (
    <div>
      {/* ── Team selector ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ width: 4, height: 32, background: teamColor, borderRadius: 2 }} />
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Team Focus
          </div>
          {cLoading ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading teams…</div>
          ) : (
            <CustomSelect
              value={effectiveId}
              onChange={setSelectedId}
              options={teamOptions}
              buttonStyle={{ fontSize: 14, fontWeight: 600, minWidth: 160 }}
            />
          )}
        </div>
        {selectedCSt && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: teamColor }}>{formatPoints(selectedCSt.points)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>POINTS</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>P{selectedCSt.position}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>POSITION</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{selectedCSt.wins}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>WINS</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Driver cards ── */}
      <div className="grid-2 mb-16" style={{ gap: 16 }}>
        {[{ dst: d0st, st: stats0, name: d0name, num: d0num, short: d0short, id: d0id },
          { dst: d1st, st: stats1, name: d1name, num: d1num, short: d1short, id: d1id }]
          .map(({ dst, st, name, num, short, id }, i) => (
          <div key={i} className="card" style={{ borderLeft: `3px solid ${teamColor}` }}>
            <div className="flex-center gap-12" style={{ marginBottom: 14 }}>
              <DriverAvatar photoUrl={getPhoto(short, num)} name={name} number={num} teamColor={teamColor} size={72} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 22, color: teamColor, lineHeight: 1 }}>#{num}</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }}>{name || '—'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{teamName}</div>
                {dst && (
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                    P{dst.position} · {formatPoints(dst.points)} pts
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <StatCard label="Wins"    value={st.wins}       />
              <StatCard label="Podiums" value={st.podiums}    />
              <StatCard label="Pts"     value={formatPoints(st.pts)} />
              <StatCard label="Avg Pos" value={st.avgPos}     />
              <StatCard label="FL"      value={st.fastestLaps}/>
              <StatCard label="DNFs"    value={st.dnfs}       />
            </div>
          </div>
        ))}
      </div>

      {/* ── H2H ── */}
      <div className="card page-section">
        <div className="grid-2" style={{ gap: 24 }}>
          <div>
            <div className="card-title">Race Head-to-Head</div>
            <H2HBar a={raceH2H.a} b={raceH2H.b} colorA={teamColor} colorB={teamColor + '55'} labelA={d0short} labelB={d1short} />
          </div>
          <div>
            <div className="card-title">Qualifying Head-to-Head</div>
            <H2HBar a={qualH2H.a} b={qualH2H.b} colorA={teamColor} colorB={teamColor + '55'} labelA={d0short} labelB={d1short} />
          </div>
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="grid-2 page-section" style={{ gap: 16 }}>
        {cumChart.length > 0 && (
          <div className="card">
            <div className="card-title">Cumulative Points — {d0short} vs {d1short}</div>
            <div style={{ height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumChart} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey={d0short || 'D1'} stroke={teamColor} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                  <Line type="monotone" dataKey={d1short || 'D2'} stroke={teamColor} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" opacity={0.7} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {ptsPerRace.length > 0 && (
          <div className="card">
            <div className="card-title">Points Per Race</div>
            <div style={{ height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ptsPerRace} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey={d0short || 'D1'} fill={teamColor} fillOpacity={0.9} radius={[2, 2, 0, 0]} />
                  <Bar dataKey={d1short || 'D2'} fill={teamColor} fillOpacity={0.45} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* ── Position history ── */}
      {posHistory.length > 0 && (
        <div className="grid-2 page-section" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-title">Race Position History (lower = better)</div>
            <div style={{ height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={posHistory} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis reversed tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={24} domain={[1, 20]} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey={d0short || 'D1'} stroke={teamColor} strokeWidth={1.5} dot={{ r: 2, fill: teamColor }} connectNulls />
                  <Line type="monotone" dataKey={d1short || 'D2'} stroke={teamColor} strokeWidth={1.5} dot={{ r: 2, fill: teamColor }} connectNulls strokeDasharray="3 2" opacity={0.65} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Qualifying Position History (lower = better)</div>
            <div style={{ height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={qualPosHistory} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis reversed tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={24} domain={[1, 20]} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey={d0short || 'D1'} stroke={teamColor} strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
                  <Line type="monotone" dataKey={d1short || 'D2'} stroke={teamColor} strokeWidth={1.5} dot={{ r: 2 }} connectNulls strokeDasharray="3 2" opacity={0.65} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Race-by-race table ── */}
      <div className="section-header">
        <span className="section-title">Race by Race</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sharedRounds.length} races</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {r0Loading || r1Loading ? (
          <div className="loading">Loading…</div>
        ) : sharedRounds.length === 0 ? (
          <div className="loading">No race data for {season}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rd</th>
                <th>Race</th>
                <th style={{ textAlign: 'center' }}>Grid {d0short}</th>
                <th style={{ textAlign: 'center', color: teamColor }}>{d0short} Pos</th>
                <th style={{ textAlign: 'center', color: teamColor }}>{d0short} Pts</th>
                <th style={{ textAlign: 'center' }}>H2H</th>
                <th style={{ textAlign: 'center', color: teamColor, opacity: 0.7 }}>{d1short} Pos</th>
                <th style={{ textAlign: 'center', color: teamColor, opacity: 0.7 }}>{d1short} Pts</th>
                <th style={{ textAlign: 'center' }}>Grid {d1short}</th>
              </tr>
            </thead>
            <tbody>
              {[...sharedRounds].reverse().map((round, i) => {
                const r0 = races0.find(r => r.round === round)
                const r1 = races1.find(r => r.round === round)
                const p0 = parseInt(r0?.Results?.[0]?.position)
                const p1 = parseInt(r1?.Results?.[0]?.position)
                const a0 = !isNaN(p0) && !isNaN(p1) && p0 < p1
                const a1 = !isNaN(p0) && !isNaN(p1) && p1 < p0
                return (
                  <tr key={i}>
                    <td className="pos">{round}</td>
                    <td style={{ fontSize: 12, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(r0 || r1)?.raceName}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{r0?.Results?.[0]?.grid || '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: a0 ? 700 : 400, color: a0 ? teamColor : 'var(--text-secondary)' }}>
                      {r0?.Results?.[0]?.position ? `P${r0.Results[0].position}` : '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{r0?.Results?.[0]?.points || '—'}</td>
                    <td style={{ textAlign: 'center', fontSize: 12 }}>
                      {a0 ? <span style={{ color: teamColor }}>◀</span> : a1 ? <span style={{ color: teamColor, opacity: 0.6 }}>▶</span> : <span style={{ color: 'var(--border)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: a1 ? 700 : 400, color: a1 ? teamColor : 'var(--text-secondary)', opacity: 0.8 }}>
                      {r1?.Results?.[0]?.position ? `P${r1.Results[0].position}` : '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{r1?.Results?.[0]?.points || '—'}</td>
                    <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{r1?.Results?.[0]?.grid || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
