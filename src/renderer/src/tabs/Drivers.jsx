import { useState, useMemo } from 'react'
import { useApiData } from '../hooks/useApiData'
import { useDriverPhotos } from '../hooks/useDriverPhotos'
import { useWatchlist } from '../context/WatchlistContext'
import { jolpicaUrl, TTL } from '../constants/endpoints'
import { getTeams, CONSTRUCTOR_COLORS } from '../constants/teams'
import TeamDot from '../components/TeamDot'
import StatCard from '../components/StatCard'
import DriverAvatar from '../components/DriverAvatar'
import { formatPoints } from '../utils/lapFormatter'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts'

function deriveStats(races = []) {
  let podiums = 0, dnfs = 0, totalPos = 0, raceCount = 0, fastestLaps = 0
  races.forEach(r => {
    const res = r.Results?.[0]
    if (!res) return
    const pos = parseInt(res.position)
    const status = res.status || ''
    if (!isNaN(pos)) { totalPos += pos; raceCount++ }
    if (pos <= 3) podiums++
    if (status !== 'Finished' && !status.startsWith('+')) dnfs++
    if (res.FastestLap?.rank === '1') fastestLaps++
  })
  return { podiums, dnfs, fastestLaps, avgPos: raceCount ? (totalPos / raceCount).toFixed(1) : '—' }
}

function CareerStats({ driverId, teamColor }) {
  const { data, loading } = useApiData(
    `career-standings-${driverId}`,
    jolpicaUrl('', `drivers/${driverId}/driverStandings.json?limit=100`).replace('//', '/'),
    TTL.RESULTS, [driverId]
  )

  // Fix URL — jolpicaUrl adds season in path; for career we need no season
  const careerUrl = `https://api.jolpi.ca/ergast/f1/drivers/${driverId}/driverStandings.json?limit=100`
  const { data: cData, loading: cLoading } = useApiData(
    `career-standings-v2-${driverId}`, careerUrl, TTL.RESULTS, [driverId]
  )

  const standingsList = cData?.MRData?.StandingsTable?.StandingsLists || []
  if (cLoading) return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Loading career stats…</div>
  if (!standingsList.length) return null

  const championships = standingsList.filter(y => y.DriverStandings?.[0]?.position === '1').length
  const totalWins = standingsList.reduce((s, y) => s + parseInt(y.DriverStandings?.[0]?.wins || 0), 0)
  const totalPodiums = standingsList.reduce((s, y) => {
    return s + (y.DriverStandings?.[0] ? parseInt(y.DriverStandings[0].wins || 0) : 0)
  }, 0)
  const seasons = standingsList.length
  const firstYear = standingsList[standingsList.length - 1]?.season
  const lastYear = standingsList[0]?.season

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">Career</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <StatCard label="Championships" value={championships || '0'} accent={championships > 0 ? teamColor : undefined} />
        <StatCard label="Career Wins" value={totalWins} />
        <StatCard label="Seasons" value={seasons} />
        <StatCard label="Active" value={firstYear && lastYear ? `${firstYear}–${lastYear}` : '—'} />
      </div>
    </div>
  )
}

export default function Drivers({ season }) {
  const [selected, setSelected] = useState(null)
  const teams = getTeams(season)
  const { getPhoto } = useDriverPhotos(season)
  const { isPinned, toggle } = useWatchlist()

  // For 2023/2024 use Jolpica API data; for 2025/2026 use hardcoded teams
  const useApiDrivers = season < 2025
  const { data: apiDriversData } = useApiData(
    useApiDrivers ? `jolpica-drivers-${season}` : 'noop',
    useApiDrivers ? jolpicaUrl(season, 'drivers.json?limit=200') : null,
    TTL.CALENDAR, [season]
  )
  const { data: apiConstructorsData } = useApiData(
    useApiDrivers ? `jolpica-constructors-${season}` : 'noop',
    useApiDrivers ? jolpicaUrl(season, 'constructors.json?limit=50') : null,
    TTL.CALENDAR, [season]
  )

  const { data: dStandData } = useApiData(
    `standings-drivers-${season}`, jolpicaUrl(season, 'driverStandings.json'), TTL.STANDINGS, [season]
  )
  const standings = dStandData?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || []
  const getStanding = id => standings.find(s => s.Driver.driverId === id)

  const allDrivers = useMemo(() => {
    if (!useApiDrivers) {
      // 2025/2026: use hardcoded team data
      return teams.flatMap(t =>
        t.drivers.map(d => ({ ...d, teamId: t.id, teamName: t.name, teamColor: t.color }))
      )
    }
    // 2023/2024: build from Jolpica API data, enrich with team colors from standings
    const apiDrivers = apiDriversData?.MRData?.DriverTable?.Drivers || []
    return apiDrivers.map(d => {
      const standing = standings.find(s => s.Driver.driverId === d.driverId)
      const constructorId = standing?.Constructors?.[0]?.constructorId || ''
      const teamColor = CONSTRUCTOR_COLORS[constructorId] || '#888888'
      const teamName = standing?.Constructors?.[0]?.name || ''
      return {
        id: d.driverId,
        name: `${d.givenName} ${d.familyName}`,
        short: d.code || d.driverId.slice(0, 3).toUpperCase(),
        number: parseInt(d.permanentNumber) || 0,
        teamId: constructorId || 'unknown',
        teamName,
        teamColor,
      }
    })
  }, [useApiDrivers, teams, apiDriversData, standings])

  const selectedDriver = selected ? allDrivers.find(d => d.id === selected) : null
  const selectedStanding = selectedDriver ? getStanding(selectedDriver.id) : null

  const { data: resultsData, loading: rLoading } = useApiData(
    selectedDriver ? `driver-results-${season}-${selectedDriver.id}` : 'noop',
    selectedDriver ? jolpicaUrl(season, `drivers/${selectedDriver.id}/results.json?limit=100`) : null,
    TTL.RESULTS, [season, selected]
  )
  const { data: qualData } = useApiData(
    selectedDriver ? `driver-qual-${season}-${selectedDriver.id}` : 'noop',
    selectedDriver ? jolpicaUrl(season, `drivers/${selectedDriver.id}/qualifying.json?limit=100`) : null,
    TTL.RESULTS, [season, selected]
  )

  const races = resultsData?.MRData?.RaceTable?.Races || []
  const qualRaces = qualData?.MRData?.RaceTable?.Races || []
  const stats = useMemo(() => deriveStats(races), [races])

  let cumPts = 0
  const ptsChart = races.map(r => {
    cumPts += parseFloat(r.Results?.[0]?.points || 0)
    return { race: `R${r.round}`, points: cumPts }
  })

  const ptsPerRace = races.map(r => ({
    race: `R${r.round}`,
    pts: parseFloat(r.Results?.[0]?.points || 0)
  }))

  const posChart = races.map(r => ({
    race: `R${r.round}`,
    Race: parseInt(r.Results?.[0]?.position) || null,
    Qualifying: parseInt(qualRaces.find(q => q.round === r.round)?.QualifyingResults?.[0]?.position) || null
  }))

  let qTotal = 0, qCount = 0
  qualRaces.forEach(r => {
    const p = parseInt(r.QualifyingResults?.[0]?.position)
    if (!isNaN(p)) { qTotal += p; qCount++ }
  })
  const avgQual = qCount ? (qTotal / qCount).toFixed(1) : '—'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '260px 1fr' : '1fr', gap: 16, alignItems: 'start' }}>

      {/* Driver grid */}
      <div>
        <div className="section-header">
          <span className="section-title">Drivers — {season}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{allDrivers.length} drivers</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 8 }}>
          {allDrivers.map(d => {
            const st = getStanding(d.id)
            const photo = getPhoto(d.short, d.number)
            const pinned = isPinned(d.id)
            return (
              <div
                key={d.id}
                className={`driver-card ${selected === d.id ? 'selected' : ''}`}
                onClick={() => setSelected(selected === d.id ? null : d.id)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 12, gap: 7, textAlign: 'center', position: 'relative' }}
              >
                {/* Pin button */}
                <button
                  onClick={e => { e.stopPropagation(); toggle(d.id) }}
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    fontSize: 12, color: pinned ? '#FF8700' : 'var(--border)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                    transition: 'color 0.15s',
                  }}
                  title={pinned ? 'Remove from watchlist' : 'Add to watchlist'}
                >
                  {pinned ? '★' : '☆'}
                </button>

                <DriverAvatar photoUrl={photo} name={d.name} number={d.number} teamColor={d.teamColor} size={62} />
                <div style={{ fontWeight: 700, fontSize: 14, color: d.teamColor }}>#{d.number}</div>
                <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.2 }}>{d.name.split(' ').slice(-1)[0]}</div>
                <div className="flex-center gap-5" style={{ justifyContent: 'center' }}>
                  <TeamDot color={d.teamColor} size={6} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.teamName}</span>
                </div>
                {st && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    {formatPoints(st.points)} <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-muted)' }}>pts</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedDriver && (
        <div>
          <div className="section-header">
            <div className="flex-center gap-10">
              <DriverAvatar photoUrl={getPhoto(selectedDriver.short, selectedDriver.number)} name={selectedDriver.name} number={selectedDriver.number} teamColor={selectedDriver.teamColor} size={52} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedDriver.name}</div>
                <div className="flex-center gap-6">
                  <TeamDot color={selectedDriver.teamColor} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedDriver.teamName} · #{selectedDriver.number}</span>
                </div>
              </div>
            </div>
            <div className="flex-center gap-8">
              <button
                onClick={() => toggle(selectedDriver.id)}
                style={{
                  fontSize: 13, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
                  background: isPinned(selectedDriver.id) ? '#FF870022' : 'var(--card)',
                  border: `1px solid ${isPinned(selectedDriver.id) ? '#FF8700' : 'var(--border)'}`,
                  color: isPinned(selectedDriver.id) ? '#FF8700' : 'var(--text-muted)',
                }}
              >
                {isPinned(selectedDriver.id) ? '★ Watching' : '☆ Watch'}
              </button>
              <button onClick={() => setSelected(null)} style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>✕ Close</button>
            </div>
          </div>

          {/* Career stats */}
          <CareerStats driverId={selectedDriver.id} teamColor={selectedDriver.teamColor} />

          {selectedStanding && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 16 }}>
              <StatCard label="Pos" value={`P${selectedStanding.position}`} accent={selectedDriver.teamColor} />
              <StatCard label="Points" value={formatPoints(selectedStanding.points)} />
              <StatCard label="Wins" value={selectedStanding.wins} />
              <StatCard label="Podiums" value={stats.podiums} />
              <StatCard label="Avg Race" value={stats.avgPos} />
              <StatCard label="Avg Qual" value={avgQual} />
              <StatCard label="DNFs" value={stats.dnfs} />
            </div>
          )}

          <div className="grid-2" style={{ marginBottom: 16 }}>
            {ptsChart.length > 0 && (
              <div className="card">
                <div className="card-title">Cumulative Points</div>
                <div style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ptsChart} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                      <Line type="monotone" dataKey="points" stroke={selectedDriver.teamColor} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {ptsPerRace.length > 0 && (
              <div className="card">
                <div className="card-title">Points Per Race</div>
                <div style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ptsPerRace} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                      <Bar dataKey="pts" fill={selectedDriver.teamColor} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {posChart.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">Race vs Qualifying Position (lower = better)</div>
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={posChart} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis reversed tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={24} domain={[1, 20]} />
                    <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                    <Line type="monotone" dataKey="Race" stroke={selectedDriver.teamColor} strokeWidth={1.5} dot={{ r: 2, fill: selectedDriver.teamColor }} connectNulls />
                    <Line type="monotone" dataKey="Qualifying" stroke={selectedDriver.teamColor} strokeWidth={1} strokeDasharray="3 2" dot={false} connectNulls opacity={0.55} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-center gap-16 mt-8" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                <span className="flex-center gap-5"><span style={{ display: 'inline-block', width: 14, height: 2, background: selectedDriver.teamColor, borderRadius: 1 }} /> Race</span>
                <span className="flex-center gap-5"><span style={{ display: 'inline-block', width: 14, height: 2, background: selectedDriver.teamColor, opacity: 0.5, borderRadius: 1 }} /> Qualifying</span>
              </div>
            </div>
          )}

          {/* Race table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>Race Results</span>
              <div className="flex-center gap-8">
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{races.length} races</span>
                {races.length > 0 && (
                  <button
                    onClick={async () => {
                      const header = 'Round,Race,Grid,Finish,Points,Status'
                      const rows = races.map(r => {
                        const res = r.Results?.[0]
                        return `${r.round},"${r.raceName}",${res?.grid || ''},${res?.position || ''},${res?.points || 0},"${res?.status || ''}"`
                      })
                      const csv = [header, ...rows].join('\n')
                      await window.api.exportCsv(`${selectedDriver.name.replace(/ /g, '_')}_${season}.csv`, csv)
                    }}
                    style={{ fontSize: 11, padding: '3px 9px', borderRadius: 4, cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                  >
                    Export CSV
                  </button>
                )}
              </div>
            </div>
            {rLoading ? <div className="loading">Loading…</div> : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rd</th><th>Race</th>
                    <th style={{ textAlign: 'center' }}>Grid</th>
                    <th style={{ textAlign: 'center' }}>Finish</th>
                    <th style={{ textAlign: 'right' }}>Pts</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...races].reverse().map((r, i) => {
                    const res = r.Results?.[0]
                    const pos = parseInt(res?.position)
                    const ok = res?.status === 'Finished' || res?.status?.startsWith('+')
                    return (
                      <tr key={i}>
                        <td className="pos">{r.round}</td>
                        <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.raceName}</td>
                        <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{res?.grid || '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: pos <= 3 ? 700 : 500, color: pos <= 3 ? selectedDriver.teamColor : 'var(--text)' }}>
                          {res?.position ? `P${res.position}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }} className="points">{res?.points || '0'}</td>
                        <td style={{ fontSize: 11, color: ok ? 'var(--text-muted)' : 'var(--red)' }}>{res?.status || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
