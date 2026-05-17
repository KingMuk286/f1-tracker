import { useState, useEffect, useCallback } from 'react'
import { useLiveSession } from '../hooks/useLiveSession'
import { OPENF1 } from '../constants/endpoints'
import SessionSelector from '../components/SessionSelector'

const COMPOUND_COLOR = {
  SOFT:         '#e8002d',
  MEDIUM:       '#ffc906',
  HARD:         '#cccccc',
  INTERMEDIATE: '#39b54a',
  WET:          '#0067ff',
  UNKNOWN:      '#888888',
}
const COMPOUND_TEXT = {
  SOFT: '#fff', MEDIUM: '#111', HARD: '#111', INTERMEDIATE: '#fff', WET: '#fff', UNKNOWN: '#fff'
}

function compoundAbbr(c) {
  return { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' }[c] || '?'
}

// Only show Race and Sprint for pit strategy
const PIT_SESSION_TYPES = ['Race', 'Sprint']

export default function PitStrategy({ season }) {
  const { isLive } = useLiveSession()
  const [sessionKey, setSessionKey] = useState('latest')
  const [sessionMeta, setSessionMeta] = useState(null)
  const [stints, setStints] = useState([])
  const [drivers, setDrivers] = useState([])
  const [maxLap, setMaxLap] = useState(60)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async (sk) => {
    setLoading(true)
    setStints([])
    setDrivers([])
    try {
      const key = sk === 'latest' ? 'latest' : sk
      const [stintRes, driverRes, lapRes] = await Promise.allSettled([
        window.api.fetchLive(`${OPENF1}/stints?session_key=${key}`),
        window.api.fetchLive(`${OPENF1}/drivers?session_key=${key}`),
        window.api.fetchLive(`${OPENF1}/laps?session_key=${key}`),
      ])

      const raw     = stintRes.status  === 'fulfilled' ? stintRes.value  : []
      const driverMeta = driverRes.status === 'fulfilled' ? driverRes.value : []
      const laps    = lapRes.status    === 'fulfilled' ? lapRes.value    : []

      // Max lap
      const maxLapNum = laps.reduce((m, l) => Math.max(m, l.lap_number || 0), 0)
      if (maxLapNum > 0) setMaxLap(maxLapNum)
      else setMaxLap(60)

      // Build driver map
      const driverMap = {}
      driverMeta.forEach(d => { driverMap[d.driver_number] = d })

      // Group stints by driver, ordered by position (use stint number as proxy)
      const driverNums = [...new Set(raw.map(s => s.driver_number))].sort((a, b) => a - b)
      const driverList = driverNums.map(num => ({
        number: num,
        name: driverMap[num]?.last_name || driverMap[num]?.full_name || `#${num}`,
        short: driverMap[num]?.name_acronym || `${num}`,
        team: driverMap[num]?.team_name || '',
        stints: raw
          .filter(s => s.driver_number === num)
          .sort((a, b) => a.stint_number - b.stint_number),
      }))

      setStints(raw)
      setDrivers(driverList)
    } catch {
      setStints([])
      setDrivers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(sessionKey)
  }, [sessionKey, fetchData])

  // Poll only for live + latest session
  useEffect(() => {
    if (sessionKey !== 'latest' || !isLive) return
    const id = setInterval(() => fetchData('latest'), 20000)
    return () => clearInterval(id)
  }, [sessionKey, isLive, fetchData])

  function handleSessionSelect(sk, meta) {
    setSessionKey(sk)
    setSessionMeta(meta)
  }

  const usedCompounds = [...new Set(stints.map(s => s.compound))].filter(Boolean)
  const isViewingLatest = sessionKey === 'latest'
  const sessionLabel = sessionMeta
    ? `${sessionMeta.meeting_name} — ${sessionMeta.session_name}`
    : 'Latest Race Session'

  return (
    <div>
      <div className="section-header" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="flex-center gap-10">
          {isLive && isViewingLatest && <span className="live-dot" />}
          <span className="section-title">Pit Strategy — {season}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <SessionSelector
            season={season}
            onSelect={handleSessionSelect}
            filterTypes={PIT_SESSION_TYPES}
          />
          {usedCompounds.map(c => (
            <div key={c} className="flex-center gap-5">
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: COMPOUND_COLOR[c] || '#888' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c}</span>
            </div>
          ))}
          {isLive && isViewingLatest && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updates every 20s</span>
          )}
        </div>
      </div>

      {/* Session label */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        Showing: <strong style={{ color: 'var(--text)' }}>{sessionLabel}</strong>
        {maxLap > 0 && drivers.length > 0 && (
          <span style={{ marginLeft: 8 }}>· {maxLap} laps · {drivers.length} drivers</span>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading stint data…</div>
      ) : drivers.length === 0 ? (
        <div className="card" style={{ maxWidth: 420 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>
            No stint data available for this session.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Select a race from the dropdown above. Pit strategy data comes from the OpenF1 API and covers 2023–present.
          </div>
        </div>
      ) : (
        <>
          {/* Gantt chart */}
          <div className="card" style={{ padding: '16px 16px 24px', marginBottom: 16 }}>
            {/* Lap axis header */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, paddingLeft: 90 }}>
              {[0, 0.25, 0.5, 0.75, 1].map(pct => (
                <div key={pct} style={{ flex: pct === 0 ? 0 : 1, fontSize: 10, color: 'var(--text-muted)', textAlign: pct === 0 ? 'left' : 'right' }}>
                  {Math.round(pct * maxLap)}
                </div>
              ))}
            </div>

            {/* Driver rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {drivers.map(d => (
                <div key={d.number} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Label */}
                  <div style={{ width: 82, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--accent)', minWidth: 22 }}>#{d.number}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.short}</span>
                  </div>

                  {/* Stint bars */}
                  <div style={{ flex: 1, height: 20, position: 'relative', background: 'var(--border-light)', borderRadius: 3 }}>
                    {d.stints.map((s, i) => {
                      const lapStart = s.lap_start || 1
                      const lapEnd   = s.lap_end   || maxLap
                      const left  = ((lapStart - 1) / maxLap) * 100
                      const width = Math.max(((lapEnd - lapStart + 1) / maxLap) * 100, 0.5)
                      const bg    = COMPOUND_COLOR[s.compound] || COMPOUND_COLOR.UNKNOWN
                      const tc    = COMPOUND_TEXT[s.compound]  || '#fff'
                      return (
                        <div
                          key={i}
                          className="stint-bar"
                          title={`${s.compound || '?'} · Laps ${lapStart}–${lapEnd}${s.tyre_age_at_start ? ` · Age ${s.tyre_age_at_start}` : ''}`}
                          style={{ left: `${left}%`, width: `${width}%`, background: bg, color: tc, border: '1px solid rgba(0,0,0,0.15)' }}
                        >
                          {width > 4 ? compoundAbbr(s.compound) : ''}
                        </div>
                      )
                    })}
                  </div>

                  {/* Pit count */}
                  <div style={{ width: 28, textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {Math.max(0, d.stints.length - 1)}P
                  </div>
                </div>
              ))}
            </div>

            {/* Lap ticks */}
            <div style={{ marginTop: 10, paddingLeft: 90 }}>
              <div style={{ position: 'relative', height: 12 }}>
                {[0, 10, 20, 30, 40, 50, 60, 70].filter(l => l <= maxLap).map(l => (
                  <div
                    key={l}
                    style={{ position: 'absolute', left: `${(l / maxLap) * 100}%`, fontSize: 9, color: 'var(--text-muted)', transform: 'translateX(-50%)' }}
                  >
                    {l > 0 ? l : ''}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Lap</div>
            </div>
          </div>

          {/* Compound legend */}
          {usedCompounds.length > 0 && (
            <div className="flex-center gap-16 mb-16" style={{ fontSize: 12 }}>
              {usedCompounds.map(c => (
                <div key={c} className="flex-center gap-6">
                  <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: COMPOUND_COLOR[c] || '#888' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{c}</span>
                </div>
              ))}
            </div>
          )}

          {/* Stint detail table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>Stint Details</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th style={{ textAlign: 'center' }}>Stint</th>
                  <th>Compound</th>
                  <th style={{ textAlign: 'center' }}>Lap Start</th>
                  <th style={{ textAlign: 'center' }}>Lap End</th>
                  <th style={{ textAlign: 'center' }}>Laps on Tyre</th>
                  <th style={{ textAlign: 'center' }}>Tyre Age</th>
                </tr>
              </thead>
              <tbody>
                {drivers.flatMap(d =>
                  d.stints.map((s, i) => (
                    <tr key={`${d.number}-${i}`}>
                      {i === 0 ? (
                        <td rowSpan={d.stints.length} style={{ fontWeight: 600, verticalAlign: 'top', paddingTop: 11 }}>
                          #{d.number} {d.name}
                        </td>
                      ) : null}
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{s.stint_number}</td>
                      <td>
                        <div className="flex-center gap-6">
                          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: COMPOUND_COLOR[s.compound] || '#888' }} />
                          <span style={{ fontSize: 12 }}>{s.compound || '—'}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 12 }}>{s.lap_start ?? '—'}</td>
                      <td style={{ textAlign: 'center', fontSize: 12 }}>{s.lap_end ?? '—'}</td>
                      <td style={{ textAlign: 'center', fontSize: 12 }}>
                        {s.lap_end != null && s.lap_start != null ? s.lap_end - s.lap_start + 1 : '—'}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{s.tyre_age_at_start ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
