import { useApiData } from '../hooks/useApiData'
import { jolpicaUrl, TTL } from '../constants/endpoints'
import { getTeamColor } from '../constants/teams'
import TeamDot from '../components/TeamDot'
import TrackCanvas from '../components/TrackCanvas'
import { getCircuitOutline } from '../constants/circuitOutlines'
import dayjs from 'dayjs'

const CONSTRUCTOR_COLORS = {
  mclaren: '#FF8700', ferrari: '#E8002D', mercedes: '#00D2BE',
  red_bull: '#3671C6', aston_martin: '#358C75', alpine: '#FF87BC',
  williams: '#37BEDD', haas: '#B6BABD', sauber: '#52E252', rb: '#5E8FAA',
  audi: '#BB0A21', racing_bulls: '#5E8FAA', cadillac: '#CC0000'
}

function color(id) { return CONSTRUCTOR_COLORS[id] || '#888' }

export default function Results({ season }) {
  const url = jolpicaUrl(season, 'results.json?limit=500')
  const { data, loading, stale } = useApiData(
    `results-${season}`, url, TTL.RESULTS, [season]
  )

  const races = (data?.MRData?.RaceTable?.Races || [])
    .filter(r => r.Results?.length > 0)
    .sort((a, b) => parseInt(b.round) - parseInt(a.round))

  return (
    <div>
      {stale && <div className="stale-badge mb-12">Cached data</div>}

      <div className="section-header">
        <span className="section-title">Race Results — {season}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{races.length} races</span>
      </div>

      {loading ? (
        <div className="loading">Loading results…</div>
      ) : races.length === 0 ? (
        <div className="loading">No results available yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {races.map((race, i) => {
            const top3 = race.Results?.slice(0, 3) || []
            const fl = race.Results?.find(r => r.FastestLap?.rank === '1')
            const circuitOutline = getCircuitOutline(race.raceName || '', race.Circuit?.Location?.country || '')
            return (
              <div key={i} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  {/* race info */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span className="race-pill">R{race.round}</span>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{race.raceName}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {dayjs(race.date).format('D MMM YYYY')}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                      {race.Circuit?.circuitName}, {race.Circuit?.Location?.country}
                    </div>

                    {/* podium */}
                    <div style={{ display: 'flex', gap: 20 }}>
                      {top3.map((r, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className={['p1','p2','p3'][j]}>{['1st','2nd','3rd'][j]}</span>
                          <TeamDot color={color(r.Constructor?.constructorId)} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>
                            {r.Driver?.givenName?.[0]}. {r.Driver?.familyName}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* fastest lap + mini track */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                    {circuitOutline && (
                      <div style={{ width: 120, borderRadius: 4, overflow: 'hidden' }}>
                        <TrackCanvas trackPoints={circuitOutline} height={70} />
                      </div>
                    )}
                    {fl && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 2 }}>
                          FASTEST LAP
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                          <TeamDot color={color(fl.Constructor?.constructorId)} />
                          <span style={{ fontSize: 12, fontWeight: 600 }}>
                            {fl.Driver?.givenName?.[0]}. {fl.Driver?.familyName}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                          {fl.FastestLap?.Time?.time}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
