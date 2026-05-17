import { useState, useEffect } from 'react'
import { jolpicaUrl, TTL } from '../constants/endpoints'
import CountdownTimer from '../components/CountdownTimer'
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

const SESSION_LABELS = {
  fp1: 'FP1',
  fp2: 'FP2',
  fp3: 'FP3',
  sprintQualifying: 'Sprint Qual',
  sprint: 'Sprint',
  qualifying: 'Qualifying',
  gp: 'Race',
}

const SESSION_ORDER = ['fp1', 'fp2', 'sprintQualifying', 'fp3', 'sprint', 'qualifying', 'gp']

function isSprint(sessions) {
  return Boolean(sessions?.sprint)
}

// Merge sportstimes race with Jolpica race for winner info
function mergeRaceData(stRaces, jolRaces) {
  const jolByRound = {}
  if (Array.isArray(jolRaces)) {
    jolRaces.forEach(r => { jolByRound[parseInt(r.round, 10)] = r })
  }
  return stRaces.map(r => {
    const jol = jolByRound[r.round] || {}
    return {
      ...r,
      // winner from Jolpica Results if available
      winner: jol.Results?.[0] || null,
    }
  })
}

// Find the very next upcoming session across all races
function findNextSession(races) {
  const now = Date.now()
  let best = null
  races.forEach(race => {
    if (!race.sessions) return
    SESSION_ORDER.forEach(key => {
      const t = race.sessions[key]
      if (!t) return
      const ms = new Date(t).getTime()
      if (ms > now && (best === null || ms < best.ms)) {
        best = { ms, raceName: race.name, sessionKey: key, sessionLabel: SESSION_LABELS[key] || key, date: t }
      }
    })
  })
  return best
}

export default function Calendar({ season }) {
  const [races, setRaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [stale, setStale] = useState(false)
  const [nextUpcoming, setNextUpcoming] = useState(null)

  useEffect(() => {
    if (!season) return
    setLoading(true)
    setRaces([])

    async function load() {
      // Try sportstimes first
      const stUrl = `https://raw.githubusercontent.com/sportstimes/f1/main/_db/f1/${season}.json`
      let stRaces = null
      try {
        const stResult = await window.api.fetch(`sportstimes-calendar-${season}`, stUrl, 1000 * 60 * 60 * 24)
        const stData = stResult?.data ?? stResult
        if (Array.isArray(stData) && stData.length > 0) {
          stRaces = stData
          setStale(stResult?.stale || false)
        }
      } catch (e) {
        stRaces = null
      }

      // Fetch Jolpica for winner info (always, since it has Results)
      let jolRaces = []
      try {
        const jolUrl = jolpicaUrl(season, 'races.json')
        const jolResult = await window.api.fetch(`calendar-${season}`, jolUrl, TTL.CALENDAR)
        const jolData = jolResult?.data ?? jolResult
        jolRaces = jolData?.MRData?.RaceTable?.Races || []
      } catch (e) {
        jolRaces = []
      }

      if (stRaces) {
        const merged = mergeRaceData(stRaces, jolRaces)
        setRaces(merged)
        setNextUpcoming(findNextSession(merged))
      } else if (jolRaces.length > 0) {
        // Fallback: convert Jolpica format to similar structure
        const fallback = jolRaces.map(r => ({
          name: r.raceName,
          location: r.Circuit?.Location?.country || '',
          round: parseInt(r.round, 10),
          sessions: {
            qualifying: r.Qualifying?.date ? `${r.Qualifying.date}T${r.Qualifying.time || '12:00:00Z'}` : null,
            gp: r.date ? `${r.date}T${r.time || '14:00:00Z'}` : null,
            ...(r.Sprint ? { sprint: `${r.Sprint.date}T${r.Sprint.time || '13:00:00Z'}` } : {}),
          },
          winner: r.Results?.[0] || null,
        }))
        setRaces(fallback)
        setNextUpcoming(findNextSession(fallback))
        setStale(false)
      }

      setLoading(false)
    }

    load()
  }, [season])

  const now = Date.now()

  return (
    <div>
      {stale && <div className="stale-badge mb-12">Cached data</div>}

      <div className="section-header">
        <span className="section-title">Race Calendar — {season}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{races.length} rounds</span>
      </div>

      {/* UP NEXT highlight card */}
      {nextUpcoming && (
        <div style={{
          background: 'var(--card-bg)',
          border: `2px solid var(--accent)`,
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, marginBottom: 4 }}>
              UP NEXT
            </div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {nextUpcoming.sessionLabel} — {nextUpcoming.raceName}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {dayjs(nextUpcoming.date).format('ddd D MMM YYYY HH:mm')}
            </div>
          </div>
          <div>
            <CountdownTimer targetDate={nextUpcoming.date} label="Starts in" />
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading calendar…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {races.map((race, i) => {
            const gpTime = race.sessions?.gp
            const raceDate = gpTime ? new Date(gpTime).getTime() : null
            const isPast = raceDate != null && raceDate < now
            const sprint = isSprint(race.sessions)
            const winner = race.winner
            const winnerColor = winner
              ? (CONSTRUCTOR_COLORS[winner.Constructor?.constructorId] || '#888')
              : null
            const circuitOutline = getCircuitOutline(race.name || '', race.location || '')

            return (
              <div
                key={i}
                className={`race-card ${isPast ? 'past' : ''}`}
                style={{ opacity: isPast ? 0.5 : 1 }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span className="race-round">Round {race.round}</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {sprint && (
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        background: 'var(--accent)',
                        borderRadius: 3,
                        padding: '2px 5px',
                        color: '#fff',
                        letterSpacing: 0.4,
                      }}>SPRINT WEEKEND</span>
                    )}
                    {isPast ? (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        background: 'var(--border)',
                        borderRadius: 3,
                        padding: '2px 6px',
                        color: 'var(--text-muted)',
                      }}>DONE</span>
                    ) : (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        background: 'var(--accent-light)',
                        borderRadius: 3,
                        padding: '2px 6px',
                        color: 'var(--accent)',
                      }}>UPCOMING</span>
                    )}
                  </div>
                </div>

                <div className="race-name">{race.name}</div>
                <div className="race-circuit" style={{ marginBottom: 8 }}>
                  {race.location || race.circuit?.circuitName || ''}
                  {race.lat != null && race.lng != null && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 6 }}>
                      {race.lat.toFixed(2)}, {race.lng.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Session schedule */}
                {race.sessions && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                    {SESSION_ORDER.filter(k => race.sessions[k]).map(k => {
                      const t = race.sessions[k]
                      const isNext = nextUpcoming && nextUpcoming.sessionKey === k && nextUpcoming.raceName === race.name
                      return (
                        <div key={k} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          color: isNext ? 'var(--accent)' : 'var(--text-secondary)',
                          fontWeight: isNext ? 600 : 400,
                        }}>
                          <span>{SESSION_LABELS[k] || k}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                            {dayjs(t).format('ddd HH:mm')}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Mini track map */}
                {circuitOutline && (
                  <div style={{ borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                    <TrackCanvas trackPoints={circuitOutline} height={90} />
                  </div>
                )}

                {/* Winner for past races */}
                {isPast && winner && (
                  <div style={{
                    marginTop: 6,
                    paddingTop: 8,
                    borderTop: '1px solid var(--border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <TeamDot color={winnerColor} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>
                      {winner.Driver?.givenName?.[0]}. {winner.Driver?.familyName}
                    </span>
                  </div>
                )}

                {/* Countdown for upcoming races */}
                {!isPast && gpTime && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-light)' }}>
                    <CountdownTimer targetDate={gpTime} label="Race in" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
