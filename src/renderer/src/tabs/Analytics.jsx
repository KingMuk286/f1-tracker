import { useMemo } from 'react'
import { useApiData } from '../hooks/useApiData'
import { jolpicaUrl, TTL } from '../constants/endpoints'
import { getTeams, CONSTRUCTOR_COLORS } from '../constants/teams'
import { formatPoints } from '../utils/lapFormatter'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, Legend
} from 'recharts'

export default function Analytics({ season }) {
  const teams = getTeams(season)

  const dStandingsUrl = jolpicaUrl(season, 'driverStandings.json')
  const cStandingsUrl = jolpicaUrl(season, 'constructorStandings.json')

  const { data: dStandings } = useApiData(`standings-drivers-${season}`, dStandingsUrl, TTL.STANDINGS, [season])
  const { data: cStandings } = useApiData(`standings-constructors-${season}`, cStandingsUrl, TTL.STANDINGS, [season])

  const dList = dStandings?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || []
  const cList = cStandings?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || []

  // Derive top 8 dynamically from standings
  const top8 = dList.slice(0, 8)

  // Derive color from driver's constructor in standings
  function getDriverColor(driverStanding) {
    const constructorId = driverStanding?.Constructors?.[0]?.constructorId
    return CONSTRUCTOR_COLORS[constructorId] || '#888888'
  }

  // Top 2 drivers for comparison chart
  const d1 = dList[0]
  const d2 = dList[1]
  const d1Id = d1?.Driver?.driverId
  const d2Id = d2?.Driver?.driverId
  const d1Name = d1 ? `${d1.Driver.givenName[0]}. ${d1.Driver.familyName}` : 'Leader'
  const d2Name = d2 ? `${d2.Driver.givenName[0]}. ${d2.Driver.familyName}` : 'P2'
  const d1Color = d1 ? getDriverColor(d1) : '#888'
  const d2Color = d2 ? getDriverColor(d2) : '#aaa'

  const d1Url = d1Id ? jolpicaUrl(season, `drivers/${d1Id}/results.json?limit=100`) : null
  const d2Url = d2Id ? jolpicaUrl(season, `drivers/${d2Id}/results.json?limit=100`) : null

  const { data: d1Data } = useApiData(
    d1Id ? `driver1-results-${season}-${d1Id}` : null,
    d1Url,
    TTL.RESULTS,
    [season, d1Id]
  )
  const { data: d2Data } = useApiData(
    d2Id ? `driver2-results-${season}-${d2Id}` : null,
    d2Url,
    TTL.RESULTS,
    [season, d2Id]
  )

  // constructor bar chart data
  const constructorData = teams.map(t => {
    const st = cList.find(c => c.Constructor.constructorId === t.id)
    return { name: t.name.length > 8 ? t.name.slice(0, 8) : t.name, points: parseFloat(st?.points || 0), color: t.color }
  }).sort((a, b) => b.points - a.points)

  // Top 2 drivers cumulative points per race
  const d1Races = d1Data?.MRData?.RaceTable?.Races || []
  const d2Races = d2Data?.MRData?.RaceTable?.Races || []

  const comparisonData = useMemo(() => {
    const rounds = Math.max(d1Races.length, d2Races.length)
    const result = []
    let d1Cum = 0, d2Cum = 0
    for (let i = 0; i < rounds; i++) {
      const r1 = d1Races[i]
      const r2 = d2Races[i]
      if (!r1 && !r2) continue
      d1Cum += parseFloat(r1?.Results?.[0]?.points || 0)
      d2Cum += parseFloat(r2?.Results?.[0]?.points || 0)
      result.push({
        race: `R${r1?.round || r2?.round}`,
        [d1Name]: d1Cum,
        [d2Name]: d2Cum,
        gap: +(d1Cum - d2Cum).toFixed(1)
      })
    }
    return result
  }, [d1Races, d2Races, d1Name, d2Name])

  return (
    <div>
      <div className="section-header mb-16">
        <span className="section-title">Analytics — {season}</span>
      </div>

      {/* Top 8 current standings bar */}
      <div className="card page-section">
        <div className="card-title">Top Drivers — Current Standings</div>
        {top8.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {top8.map((d, i) => {
              const maxPts = parseFloat(top8[0]?.points || 1)
              const pts = parseFloat(d.points || 0)
              const driverColor = getDriverColor(d)
              const isTop2 = i < 2
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 14, textAlign: 'right' }}>
                    P{d.position}
                  </span>
                  <span style={{
                    fontSize: 12,
                    fontWeight: isTop2 ? 700 : 500,
                    width: 100,
                    color: isTop2 ? 'var(--text)' : 'var(--text-secondary)',
                  }}>
                    {d.Driver.givenName[0]}. {d.Driver.familyName}
                  </span>
                  <div style={{
                    flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${(pts / maxPts) * 100}%`,
                      height: '100%',
                      background: driverColor,
                      borderRadius: 3,
                      opacity: isTop2 ? 1 : 0.6
                    }} />
                  </div>
                  <span style={{
                    fontSize: 12,
                    fontWeight: isTop2 ? 700 : 500,
                    width: 36,
                    textAlign: 'right',
                    color: isTop2 ? 'var(--text)' : 'var(--text-secondary)'
                  }}>
                    {formatPoints(d.points)}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="loading" style={{ height: 60 }}>No standings data</div>
        )}
      </div>

      <div className="grid-2" style={{ alignItems: 'start', gap: 16, marginBottom: 20 }}>
        {/* constructor chart */}
        <div className="card">
          <div className="card-title">Constructor Points</div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={constructorData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip
                  contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }}
                />
                <Bar dataKey="points" radius={[2, 2, 0, 0]}>
                  {constructorData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 2 gap per race */}
        <div className="card">
          <div className="card-title">{d1Name} vs {d2Name} — Points Gap per Race</div>
          {comparisonData.length > 0 ? (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
                  <XAxis dataKey="race" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }}
                    formatter={(v) => [`${v > 0 ? '+' : ''}${v}`, `Gap (${d1Name} - ${d2Name})`]}
                  />
                  <Bar dataKey="gap" radius={[2, 2, 0, 0]}>
                    {comparisonData.map((entry, i) => (
                      <Cell key={i} fill={entry.gap >= 0 ? d1Color : d2Color} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="loading" style={{ height: 200 }}>No race data yet</div>
          )}
        </div>
      </div>

      {/* Top 2 cumulative points line chart */}
      {comparisonData.length > 0 && (
        <div className="card">
          <div className="card-title">{d1Name} vs {d2Name} — Cumulative Points</div>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparisonData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
                <XAxis dataKey="race" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey={d1Name} stroke={d1Color} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                <Line type="monotone" dataKey={d2Name} stroke={d2Color} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
