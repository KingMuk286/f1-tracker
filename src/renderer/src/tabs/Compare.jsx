import { useState, useMemo } from 'react'
import { useApiData } from '../hooks/useApiData'
import { useDriverPhotos } from '../hooks/useDriverPhotos'
import { jolpicaUrl, TTL } from '../constants/endpoints'
import { constructorColor } from '../constants/teams'
import TeamDot from '../components/TeamDot'
import DriverAvatar from '../components/DriverAvatar'
import { formatPoints } from '../utils/lapFormatter'
import CustomSelect from '../components/CustomSelect'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

// ─── helpers ──────────────────────────────────────────────
function H2HBar({ a, b, colorA, colorB, labelA, labelB }) {
  const total = a + b
  if (!total) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No head-to-head data yet</div>
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontWeight: 700, color: colorA }}>{a} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)' }}>{labelA}</span></span>
        <span style={{ fontWeight: 700, color: colorB }}><span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)' }}>{labelB}</span> {b}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: colorB + '44', overflow: 'hidden' }}>
        <div style={{ width: `${(a / total) * 100}%`, height: '100%', background: colorA, borderRadius: 4 }} />
      </div>
    </div>
  )
}

function calcStats(races = [], qualRaces = []) {
  let wins = 0, podiums = 0, dnfs = 0, totalPos = 0, n = 0, pts = 0, fl = 0, qT = 0, qN = 0
  races.forEach(r => {
    const res = r.Results?.[0]; if (!res) return
    const pos = parseInt(res.position); const st = res.status || ''
    pts += parseFloat(res.points || 0)
    if (!isNaN(pos)) { totalPos += pos; n++ }
    if (pos === 1) wins++; if (pos <= 3) podiums++
    if (st !== 'Finished' && !st.startsWith('+')) dnfs++
    if (res.FastestLap?.rank === '1') fl++
  })
  qualRaces.forEach(r => {
    const p = parseInt(r.QualifyingResults?.[0]?.position)
    if (!isNaN(p)) { qT += p; qN++ }
  })
  return { wins, podiums, dnfs, pts, fastestLaps: fl, raceCount: n,
    avgPos: n ? (totalPos / n).toFixed(1) : '—',
    avgQual: qN ? (qT / qN).toFixed(1) : '—',
    ptsPerRace: n ? (pts / n).toFixed(1) : '—' }
}

function StatRow({ label, a, b, colorA, colorB, lowerBetter = false }) {
  const nA = parseFloat(a), nB = parseFloat(b)
  const aWins = !isNaN(nA) && !isNaN(nB) && (lowerBetter ? nA < nB : nA > nB)
  const bWins = !isNaN(nA) && !isNaN(nB) && (lowerBetter ? nB < nA : nB > nA)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--border-light)' }}>
      <div style={{ textAlign: 'right', fontWeight: aWins ? 700 : 400, color: aWins ? colorA : 'var(--text-secondary)', fontSize: 14 }}>
        {a ?? '—'}{aWins && <span style={{ fontSize: 10, marginLeft: 3, color: colorA }}>▲</span>}
      </div>
      <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ textAlign: 'left', fontWeight: bWins ? 700 : 400, color: bWins ? colorB : 'var(--text-secondary)', fontSize: 14 }}>
        {bWins && <span style={{ fontSize: 10, marginRight: 3, color: colorB }}>▲</span>}{b ?? '—'}
      </div>
    </div>
  )
}

// ─── Driver vs Driver ──────────────────────────────────────
function DriverCompare({ season, allDrivers, getPhoto }) {
  const [aId, setAId] = useState('norris')
  const [bId, setBId] = useState('leclerc')

  // guard: wait for driver list
  if (!allDrivers || allDrivers.length === 0) {
    return <div className="loading">Loading driver standings…</div>
  }

  const dA = allDrivers.find(d => d.id === aId) || allDrivers[0]
  const dB = allDrivers.find(d => d.id === bId) || allDrivers[Math.min(2, allDrivers.length - 1)]

  if (!dA || !dB) return <div className="loading">Loading…</div>

  return <DriverCompareInner
    season={season} allDrivers={allDrivers} getPhoto={getPhoto}
    aId={aId} bId={bId} setAId={setAId} setBId={setBId}
    dA={dA} dB={dB}
  />
}

function DriverCompareInner({ season, allDrivers, getPhoto, aId, bId, setAId, setBId, dA, dB }) {
  const { data: rA } = useApiData(`driver-results-${season}-${dA.id}`, jolpicaUrl(season, `drivers/${dA.id}/results.json?limit=100`), TTL.RESULTS, [season, dA.id])
  const { data: rB } = useApiData(`driver-results-${season}-${dB.id}`, jolpicaUrl(season, `drivers/${dB.id}/results.json?limit=100`), TTL.RESULTS, [season, dB.id])
  const { data: qA } = useApiData(`driver-qual-${season}-${dA.id}`,    jolpicaUrl(season, `drivers/${dA.id}/qualifying.json?limit=100`),    TTL.RESULTS, [season, dA.id])
  const { data: qB } = useApiData(`driver-qual-${season}-${dB.id}`,    jolpicaUrl(season, `drivers/${dB.id}/qualifying.json?limit=100`),    TTL.RESULTS, [season, dB.id])
  const { data: standData } = useApiData(`standings-drivers-${season}`, jolpicaUrl(season, 'driverStandings.json'), TTL.STANDINGS, [season])

  const standings = standData?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || []
  const stA = standings.find(s => s.Driver.driverId === dA.id)
  const stB = standings.find(s => s.Driver.driverId === dB.id)

  const racesA = rA?.MRData?.RaceTable?.Races || []
  const racesB = rB?.MRData?.RaceTable?.Races || []
  const qualA  = qA?.MRData?.RaceTable?.Races || []
  const qualB  = qB?.MRData?.RaceTable?.Races || []

  const stxA = useMemo(() => calcStats(racesA, qualA), [racesA, qualA])
  const stxB = useMemo(() => calcStats(racesB, qualB), [racesB, qualB])

  const h2hRace = useMemo(() => {
    let a = 0, b = 0
    racesA.forEach(rr => {
      const rr2 = racesB.find(x => x.round === rr.round); if (!rr2) return
      const pA = parseInt(rr.Results?.[0]?.position), pB = parseInt(rr2.Results?.[0]?.position)
      if (!isNaN(pA) && !isNaN(pB)) { if (pA < pB) a++; else if (pB < pA) b++ }
    })
    return { a, b }
  }, [racesA, racesB])

  const h2hQual = useMemo(() => {
    let a = 0, b = 0
    qualA.forEach(rr => {
      const rr2 = qualB.find(x => x.round === rr.round); if (!rr2) return
      const pA = parseInt(rr.QualifyingResults?.[0]?.position), pB = parseInt(rr2.QualifyingResults?.[0]?.position)
      if (!isNaN(pA) && !isNaN(pB)) { if (pA < pB) a++; else if (pB < pA) b++ }
    })
    return { a, b }
  }, [qualA, qualB])

  const rounds = [...new Set([...racesA.map(r => r.round), ...racesB.map(r => r.round)])].sort((a, b) => parseInt(a) - parseInt(b))
  let cA = 0, cB = 0
  const cumChart = rounds.map(rd => {
    cA += parseFloat(racesA.find(r => r.round === rd)?.Results?.[0]?.points || 0)
    cB += parseFloat(racesB.find(r => r.round === rd)?.Results?.[0]?.points || 0)
    return { race: `R${rd}`, [dA.short]: cA, [dB.short]: cB }
  })
  const ptsChart = rounds.map(rd => ({
    race: `R${rd}`,
    [dA.short]: parseFloat(racesA.find(r => r.round === rd)?.Results?.[0]?.points || 0),
    [dB.short]: parseFloat(racesB.find(r => r.round === rd)?.Results?.[0]?.points || 0),
  }))
  const posChart = rounds.map(rd => ({
    race: `R${rd}`,
    [dA.short]: parseInt(racesA.find(r => r.round === rd)?.Results?.[0]?.position) || null,
    [dB.short]: parseInt(racesB.find(r => r.round === rd)?.Results?.[0]?.position) || null,
  }))

  const opts = allDrivers.map(d => ({ value: d.id, label: `${d.name} (${d.short})` }))

  return (
    <div>
      {/* Selectors */}
      <div className="grid-2 mb-16" style={{ gap: 16 }}>
        {[{ d: dA, id: aId, setId: setAId, st: stA, stx: stxA },
          { d: dB, id: bId, setId: setBId, st: stB, stx: stxB }].map(({ d, id, setId, st, stx }, i) => (
          <div key={i}>
            <CustomSelect value={id} onChange={setId} options={opts}
              style={{ width: '100%', marginBottom: 10 }} />
            <div className="card" style={{ borderLeft: `3px solid ${d.teamColor}`, display: 'flex', gap: 14, alignItems: 'center' }}>
              <DriverAvatar photoUrl={getPhoto(d.short, d.number)} name={d.name} number={d.number} teamColor={d.teamColor} size={80} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: d.teamColor }}>#{d.number}</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{d.name}</div>
                <div className="flex-center gap-5" style={{ marginTop: 3 }}>
                  <TeamDot color={d.teamColor} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.teamName}</span>
                </div>
                {st && <div style={{ marginTop: 5, fontWeight: 600, fontSize: 13 }}>P{st.position} · {formatPoints(st.points)} pts · {st.wins}W</div>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* H2H */}
      <div className="card page-section">
        <div className="grid-2" style={{ gap: 24 }}>
          <div><div className="card-title">Race H2H</div>
            <H2HBar a={h2hRace.a} b={h2hRace.b} colorA={dA.teamColor} colorB={dB.teamColor} labelA={dA.short} labelB={dB.short} />
          </div>
          <div><div className="card-title">Qualifying H2H</div>
            <H2HBar a={h2hQual.a} b={h2hQual.b} colorA={dA.teamColor} colorB={dB.teamColor} labelA={dA.short} labelB={dB.short} />
          </div>
        </div>
      </div>

      {/* Stat table */}
      <div className="card page-section">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', marginBottom: 10 }}>
          <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: dA.teamColor }}>{dA.name.split(' ').slice(-1)[0]}</div>
          <div />
          <div style={{ fontWeight: 700, fontSize: 14, color: dB.teamColor }}>{dB.name.split(' ').slice(-1)[0]}</div>
        </div>
        <StatRow label="Points"       a={formatPoints(stA?.points)} b={formatPoints(stB?.points)} colorA={dA.teamColor} colorB={dB.teamColor} />
        <StatRow label="Position"     a={stA ? `P${stA.position}` : '—'} b={stB ? `P${stB.position}` : '—'} colorA={dA.teamColor} colorB={dB.teamColor} lowerBetter />
        <StatRow label="Wins"         a={stxA.wins}        b={stxB.wins}        colorA={dA.teamColor} colorB={dB.teamColor} />
        <StatRow label="Podiums"      a={stxA.podiums}     b={stxB.podiums}     colorA={dA.teamColor} colorB={dB.teamColor} />
        <StatRow label="Avg Race Pos" a={stxA.avgPos}      b={stxB.avgPos}      colorA={dA.teamColor} colorB={dB.teamColor} lowerBetter />
        <StatRow label="Avg Qual Pos" a={stxA.avgQual}     b={stxB.avgQual}     colorA={dA.teamColor} colorB={dB.teamColor} lowerBetter />
        <StatRow label="Pts / Race"   a={stxA.ptsPerRace}  b={stxB.ptsPerRace}  colorA={dA.teamColor} colorB={dB.teamColor} />
        <StatRow label="Fastest Laps" a={stxA.fastestLaps} b={stxB.fastestLaps} colorA={dA.teamColor} colorB={dB.teamColor} />
        <StatRow label="DNFs"         a={stxA.dnfs}        b={stxB.dnfs}        colorA={dA.teamColor} colorB={dB.teamColor} lowerBetter />
      </div>

      {/* Charts */}
      {rounds.length > 0 && (
        <div className="grid-2 page-section" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-title">Cumulative Points</div>
            <div style={{ height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumChart} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey={dA.short} stroke={dA.teamColor} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                  <Line type="monotone" dataKey={dB.short} stroke={dB.teamColor} strokeWidth={2} dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Points Per Race</div>
            <div style={{ height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ptsChart} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey={dA.short} fill={dA.teamColor} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
                  <Bar dataKey={dB.short} fill={dB.teamColor} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {posChart.length > 0 && (
        <div className="card page-section">
          <div className="card-title">Race Finish Position (lower = better)</div>
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={posChart} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis reversed tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={24} domain={[1, 20]} />
                <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey={dA.short} stroke={dA.teamColor} strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
                <Line type="monotone" dataKey={dB.short} stroke={dB.teamColor} strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Race table */}
      {rounds.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>Race by Race</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Rd</th><th>Race</th>
                <th style={{ textAlign: 'center', color: dA.teamColor }}>{dA.short} Pos</th>
                <th style={{ textAlign: 'center', color: dA.teamColor }}>{dA.short} Pts</th>
                <th style={{ textAlign: 'center' }}>H2H</th>
                <th style={{ textAlign: 'center', color: dB.teamColor }}>{dB.short} Pos</th>
                <th style={{ textAlign: 'center', color: dB.teamColor }}>{dB.short} Pts</th>
              </tr>
            </thead>
            <tbody>
              {[...rounds].reverse().map((rd, i) => {
                const rrA = racesA.find(r => r.round === rd), rrB = racesB.find(r => r.round === rd)
                const pA = parseInt(rrA?.Results?.[0]?.position), pB = parseInt(rrB?.Results?.[0]?.position)
                const aW = !isNaN(pA) && !isNaN(pB) && pA < pB, bW = !isNaN(pA) && !isNaN(pB) && pB < pA
                return (
                  <tr key={i}>
                    <td className="pos">{rd}</td>
                    <td style={{ fontSize: 12, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(rrA || rrB)?.raceName}</td>
                    <td style={{ textAlign: 'center', fontWeight: aW ? 700 : 400, color: aW ? dA.teamColor : 'var(--text-secondary)' }}>{rrA?.Results?.[0]?.position ? `P${rrA.Results[0].position}` : '—'}</td>
                    <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{rrA?.Results?.[0]?.points || '—'}</td>
                    <td style={{ textAlign: 'center', fontSize: 12 }}>{aW ? <span style={{ color: dA.teamColor }}>◀</span> : bW ? <span style={{ color: dB.teamColor }}>▶</span> : <span style={{ color: 'var(--border)' }}>—</span>}</td>
                    <td style={{ textAlign: 'center', fontWeight: bW ? 700 : 400, color: bW ? dB.teamColor : 'var(--text-secondary)' }}>{rrB?.Results?.[0]?.position ? `P${rrB.Results[0].position}` : '—'}</td>
                    <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{rrB?.Results?.[0]?.points || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Team vs Team ──────────────────────────────────────────
function TeamCompare({ season }) {
  const [aId, setAId] = useState('mclaren')
  const [bId, setBId] = useState('ferrari')

  const { data: cStData, loading } = useApiData(`standings-constructors-${season}`, jolpicaUrl(season, 'constructorStandings.json'), TTL.STANDINGS, [season])
  const { data: dStData }          = useApiData(`standings-drivers-${season}`,      jolpicaUrl(season, 'driverStandings.json'),      TTL.STANDINGS, [season])

  const constructors = cStData?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || []
  const driverSt     = dStData?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || []

  // Hooks must ALL be before any conditional return
  const { data: cResA } = useApiData(`constructor-results-${season}-${aId}`, jolpicaUrl(season, `constructors/${aId}/results.json?limit=500`), TTL.RESULTS, [season, aId])
  const { data: cResB } = useApiData(`constructor-results-${season}-${bId}`, jolpicaUrl(season, `constructors/${bId}/results.json?limit=500`), TTL.RESULTS, [season, bId])

  const ptsA = useMemo(() => {
    const map = {}
    ;(cResA?.MRData?.RaceTable?.Races || []).forEach(r => {
      ;(r.Results || []).forEach(res => {
        if (!map[r.round]) map[r.round] = { round: r.round, name: r.raceName, pts: 0 }
        map[r.round].pts += parseFloat(res.points || 0)
      })
    })
    return Object.values(map).sort((a, b) => parseInt(a.round) - parseInt(b.round))
  }, [cResA])

  const ptsB = useMemo(() => {
    const map = {}
    ;(cResB?.MRData?.RaceTable?.Races || []).forEach(r => {
      ;(r.Results || []).forEach(res => {
        if (!map[r.round]) map[r.round] = { round: r.round, name: r.raceName, pts: 0 }
        map[r.round].pts += parseFloat(res.points || 0)
      })
    })
    return Object.values(map).sort((a, b) => parseInt(a.round) - parseInt(b.round))
  }, [cResB])

  if (loading && constructors.length === 0) return <div className="loading">Loading teams…</div>

  const tA = constructors.find(c => c.Constructor.constructorId === aId)
  const tB = constructors.find(c => c.Constructor.constructorId === bId)
  const colorA = constructorColor(aId), colorB = constructorColor(bId)
  const driversA = driverSt.filter(d => d.Constructors?.some(c => c.constructorId === aId))
  const driversB = driverSt.filter(d => d.Constructors?.some(c => c.constructorId === bId))
  const rounds = [...new Set([...ptsA.map(r => r.round), ...ptsB.map(r => r.round)])].sort((a, b) => parseInt(a) - parseInt(b))

  let cA = 0, cB = 0
  const cumChart = rounds.map(rd => {
    cA += ptsA.find(r => r.round === rd)?.pts || 0
    cB += ptsB.find(r => r.round === rd)?.pts || 0
    return { race: `R${rd}`, [tA?.Constructor?.name || aId]: cA, [tB?.Constructor?.name || bId]: cB }
  })
  const ptsChart = rounds.map(rd => ({
    race: `R${rd}`,
    [tA?.Constructor?.name || aId]: ptsA.find(r => r.round === rd)?.pts || 0,
    [tB?.Constructor?.name || bId]: ptsB.find(r => r.round === rd)?.pts || 0,
  }))

  const opts = constructors.map(c => ({ value: c.Constructor.constructorId, label: c.Constructor.name }))
  const nameA = tA?.Constructor?.name || aId, nameB = tB?.Constructor?.name || bId
  const ptsATotal = parseFloat(tA?.points || 0), ptsBTotal = parseFloat(tB?.points || 0)

  return (
    <div>
      <div className="grid-2 mb-16" style={{ gap: 16 }}>
        {[{ id: aId, setId: setAId, t: tA, color: colorA, drivers: driversA },
          { id: bId, setId: setBId, t: tB, color: colorB, drivers: driversB }].map(({ id, setId, t, color, drivers }, i) => (
          <div key={i}>
            <CustomSelect value={id} onChange={setId} options={opts}
              style={{ width: '100%', marginBottom: 10 }} />
            <div className="card" style={{ borderLeft: `3px solid ${color}` }}>
              <div className="flex-center gap-10" style={{ marginBottom: 10 }}>
                <div style={{ width: 4, height: 36, background: color, borderRadius: 2 }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{t?.Constructor?.name || id}</div>
                  {t && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>P{t.position} · {formatPoints(t.points)} pts · {t.wins} wins</div>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                {drivers.map(d => (
                  <div key={d.Driver.driverId}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{d.Driver.code || d.Driver.familyName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>P{d.position} · {formatPoints(d.points)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Points race bar */}
      {(ptsATotal + ptsBTotal) > 0 && (
        <div className="card page-section">
          <div className="card-title">Constructor Points Race</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: colorA }}>{formatPoints(ptsATotal)} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>{nameA}</span></span>
            <span style={{ fontWeight: 700, color: colorB }}><span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>{nameB}</span> {formatPoints(ptsBTotal)}</span>
          </div>
          <div style={{ height: 10, borderRadius: 5, background: colorB + '44', overflow: 'hidden' }}>
            <div style={{ width: `${(ptsATotal / (ptsATotal + ptsBTotal)) * 100}%`, height: '100%', background: colorA, borderRadius: 5 }} />
          </div>
        </div>
      )}

      {tA && tB && (
        <div className="card page-section">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', marginBottom: 10 }}>
            <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: colorA }}>{nameA}</div>
            <div />
            <div style={{ fontWeight: 700, fontSize: 14, color: colorB }}>{nameB}</div>
          </div>
          <StatRow label="Points"   a={formatPoints(tA.points)}  b={formatPoints(tB.points)}  colorA={colorA} colorB={colorB} />
          <StatRow label="Position" a={`P${tA.position}`}        b={`P${tB.position}`}        colorA={colorA} colorB={colorB} lowerBetter />
          <StatRow label="Wins"     a={tA.wins}                  b={tB.wins}                  colorA={colorA} colorB={colorB} />
        </div>
      )}

      {rounds.length > 0 && (
        <div className="grid-2 page-section" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-title">Cumulative Constructor Points</div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumChart} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey={nameA} stroke={colorA} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                  <Line type="monotone" dataKey={nameB} stroke={colorB} strokeWidth={2} dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Points Per Race</div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ptsChart} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey={nameA} fill={colorA} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
                  <Bar dataKey={nameB} fill={colorB} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {rounds.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>Constructor Points Per Race</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Rd</th><th>Race</th>
                <th style={{ textAlign: 'right', color: colorA }}>{nameA}</th>
                <th style={{ textAlign: 'center' }}>Lead</th>
                <th style={{ textAlign: 'left', color: colorB }}>{nameB}</th>
              </tr>
            </thead>
            <tbody>
              {[...rounds].reverse().map((rd, i) => {
                const pA = ptsA.find(r => r.round === rd)?.pts || 0
                const pB = ptsB.find(r => r.round === rd)?.pts || 0
                const raceName = ptsA.find(r => r.round === rd)?.name || ptsB.find(r => r.round === rd)?.name || ''
                return (
                  <tr key={i}>
                    <td className="pos">{rd}</td>
                    <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{raceName}</td>
                    <td style={{ textAlign: 'right', fontWeight: pA > pB ? 700 : 400, color: pA > pB ? colorA : 'var(--text-secondary)' }}>{pA}</td>
                    <td style={{ textAlign: 'center', fontSize: 12 }}>{pA > pB ? <span style={{ color: colorA }}>◀</span> : pB > pA ? <span style={{ color: colorB }}>▶</span> : '='}</td>
                    <td style={{ textAlign: 'left', fontWeight: pB > pA ? 700 : 400, color: pB > pA ? colorB : 'var(--text-secondary)' }}>{pB}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Root Compare tab ──────────────────────────────────────
export default function Compare({ season }) {
  const [mode, setMode] = useState('driver')
  const { getPhoto } = useDriverPhotos(season)

  // Build driver list from live standings (works for any season)
  const { data: dStData, loading: dLoading } = useApiData(
    `standings-drivers-${season}`, jolpicaUrl(season, 'driverStandings.json'), TTL.STANDINGS, [season]
  )
  const driverSt = dStData?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || []

  const allDrivers = driverSt.map(d => ({
    id: d.Driver.driverId,
    name: `${d.Driver.givenName} ${d.Driver.familyName}`,
    short: d.Driver.code || d.Driver.driverId.slice(0, 3).toUpperCase(),
    number: parseInt(d.Driver.permanentNumber || 0),
    teamId: d.Constructors?.[0]?.constructorId || '',
    teamName: d.Constructors?.[0]?.name || '',
    teamColor: constructorColor(d.Constructors?.[0]?.constructorId || ''),
  }))

  const ModeBtn = ({ id, label }) => (
    <button onClick={() => setMode(id)} style={{
      padding: '7px 16px', fontSize: 13, fontWeight: mode === id ? 600 : 400,
      color: mode === id ? 'var(--text)' : 'var(--text-muted)',
      background: mode === id ? '#fff' : 'transparent',
      border: '1px solid', borderColor: mode === id ? 'var(--border)' : 'transparent',
      borderRadius: 6, cursor: 'pointer',
    }}>{label}</button>
  )

  return (
    <div>
      <div className="section-header mb-16">
        <span className="section-title">Compare — {season}</span>
        <div style={{ display: 'flex', gap: 4, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
          <ModeBtn id="driver" label="Driver vs Driver" />
          <ModeBtn id="team"   label="Team vs Team" />
        </div>
      </div>

      {mode === 'driver'
        ? <DriverCompare season={season} allDrivers={allDrivers} getPhoto={getPhoto} />
        : <TeamCompare   season={season} />
      }
    </div>
  )
}
