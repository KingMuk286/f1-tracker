import { useState, useEffect, useCallback, useRef } from 'react'
import { useLiveSession } from '../hooks/useLiveSession'
import { useNotifications } from '../context/NotificationContext'
import { getTeams } from '../constants/teams'
import TeamDot from '../components/TeamDot'
import CountdownTimer from '../components/CountdownTimer'
import TrackCanvas from '../components/TrackCanvas'
import { formatLapTime } from '../utils/lapFormatter'
import { getSessionLabel } from '../utils/sessionDetector'
import { OPENF1 } from '../constants/endpoints'
import { useDriverPhotos } from '../hooks/useDriverPhotos'

const TIRE_CLASS = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' }

const FLAG_COLORS = {
  GREEN: '#22c55e',
  YELLOW: '#ffc906',
  DOUBLE_YELLOW: '#ffc906',
  RED: '#ef4444',
  SAFETY_CAR: '#f97316',
  VIRTUAL_SAFETY_CAR: '#8b5cf6',
  CHEQUERED: '#ffffff',
}

const SECTOR_PURPLE = '#a855f7'
const SECTOR_GREEN  = '#22c55e'
const SECTOR_YELLOW = '#ffc906'

function TireBadge({ compound }) {
  const key = TIRE_CLASS[compound] || '?'
  return <span className={`tire tire-${key}`}>{key}</span>
}

function SectorBadge({ time, color }) {
  if (!time) return <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'monospace' }}>—</span>
  const bg = color === 'purple' ? SECTOR_PURPLE : color === 'green' ? SECTOR_GREEN : 'transparent'
  const fg = color === 'yellow' ? SECTOR_YELLOW : color ? '#fff' : 'var(--text-secondary)'
  const border = color === 'yellow' ? `1px solid ${SECTOR_YELLOW}` : 'none'
  return (
    <span style={{
      fontSize: 11,
      fontFamily: 'monospace',
      background: bg,
      color: fg,
      border,
      borderRadius: 3,
      padding: '1px 4px',
      display: 'inline-block',
    }}>
      {time.toFixed(3)}
    </span>
  )
}

function DrsBadge({ active }) {
  if (!active) return null
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      background: '#22c55e',
      color: '#000',
      borderRadius: 3,
      padding: '1px 4px',
      marginLeft: 4,
      letterSpacing: 0.5,
    }}>DRS</span>
  )
}

function computeSectorColors(drivers) {
  // For each sector 1/2/3, find the overall best time across all drivers (personal bests)
  const overallBest = { s1: null, s2: null, s3: null }

  drivers.forEach(d => {
    if (d.bestS1 && (overallBest.s1 === null || d.bestS1 < overallBest.s1)) overallBest.s1 = d.bestS1
    if (d.bestS2 && (overallBest.s2 === null || d.bestS2 < overallBest.s2)) overallBest.s2 = d.bestS2
    if (d.bestS3 && (overallBest.s3 === null || d.bestS3 < overallBest.s3)) overallBest.s3 = d.bestS3
  })

  return drivers.map(d => {
    const s1color = !d.lastS1 ? null
      : d.bestS1 === overallBest.s1 ? 'purple'
      : d.lastS1 === d.bestS1 ? 'green'
      : 'yellow'
    const s2color = !d.lastS2 ? null
      : d.bestS2 === overallBest.s2 ? 'purple'
      : d.lastS2 === d.bestS2 ? 'green'
      : 'yellow'
    const s3color = !d.lastS3 ? null
      : d.bestS3 === overallBest.s3 ? 'purple'
      : d.lastS3 === d.bestS3 ? 'green'
      : 'yellow'
    return { ...d, s1color, s2color, s3color }
  })
}

export default function LiveTiming({ season }) {
  const { isLive, session, nextSession } = useLiveSession()
  const { addNotification } = useNotifications()
  const { getPhoto } = useDriverPhotos(season)
  const [drivers, setDrivers] = useState([])
  const [rcMessages, setRcMessages] = useState([])
  const [teamRadio, setTeamRadio] = useState([])
  const [activeFlag, setActiveFlag] = useState(null)
  const [loading, setLoading] = useState(false)
  const [trackPoints, setTrackPoints] = useState([])
  const [livePositions, setLivePositions] = useState({})
  const intervalRef = useRef(null)
  const prevLeaderRef = useRef(null)
  const prevFastestRef = useRef(null)
  const sessionNotifiedRef = useRef(null)
  const trackBuiltRef = useRef(false)

  const teams = getTeams(season)

  const findTeamColor = (teamName) => {
    if (!teamName) return '#888'
    const t = teams.find(t =>
      t.name.toLowerCase().includes(teamName.toLowerCase()) ||
      teamName.toLowerCase().includes(t.name.toLowerCase())
    )
    return t?.color || '#888'
  }

  // Build track outline once — fetch 2 laps (2.5 min) from one driver
  const buildTrackOutline = useCallback(async (key) => {
    if (trackBuiltRef.current) return
    try {
      const since = new Date(Date.now() - 2.5 * 60 * 1000).toISOString()
      // Pick driver number 1 first, fall back to any — we only need one driver's trace
      const data = await window.api.fetchLive(
        `${OPENF1}/location?session_key=${key}&date>=${encodeURIComponent(since)}`
      )
      if (!Array.isArray(data) || data.length < 50) return
      const countByDriver = {}
      data.forEach(p => { countByDriver[p.driver_number] = (countByDriver[p.driver_number] || 0) + 1 })
      const topDriver = Object.entries(countByDriver).sort((a, b) => b[1] - a[1])[0]?.[0]
      if (!topDriver) return
      const pts = data
        .filter(p => p.driver_number == topDriver)
        .sort((a, b) => (a.date > b.date ? 1 : -1))
        .map(p => ({ x: p.x, y: p.y }))
      if (pts.length > 30) {
        setTrackPoints(pts)
        trackBuiltRef.current = true
      }
    } catch {}
  }, [])

  // Fetch only the last 8 seconds of GPS for live dot positions — tiny payload
  const fetchLiveGPS = useCallback(async () => {
    if (!session?.session_key) return
    const key = session.session_key
    try {
      const since = new Date(Date.now() - 8000).toISOString()
      const data = await window.api.fetchLive(
        `${OPENF1}/location?session_key=${key}&date>=${encodeURIComponent(since)}`
      )
      if (!Array.isArray(data)) return
      const latest = {}
      data.forEach(p => {
        if (!latest[p.driver_number] || p.date > latest[p.driver_number].date)
          latest[p.driver_number] = p
      })
      if (Object.keys(latest).length > 0) setLivePositions(latest)
    } catch {}
  }, [session?.session_key])

  const fetchLiveData = useCallback(async () => {
    if (!session?.session_key) return
    const key = session.session_key

    try {
      const [posData, lapData, stintData, pitData, driverData, intervalData, rcData, radioData, carData] =
        await Promise.allSettled([
          window.api.fetchLive(`${OPENF1}/position?session_key=${key}`),
          window.api.fetchLive(`${OPENF1}/laps?session_key=${key}`),
          window.api.fetchLive(`${OPENF1}/stints?session_key=${key}`),
          window.api.fetchLive(`${OPENF1}/pit?session_key=${key}`),
          window.api.fetchLive(`${OPENF1}/drivers?session_key=${key}`),
          window.api.fetchLive(`${OPENF1}/intervals?session_key=${key}`),
          window.api.fetchLive(`${OPENF1}/race_control?session_key=${key}`),
          window.api.fetchLive(`${OPENF1}/team_radio?session_key=${key}`),
          window.api.fetchLive(`${OPENF1}/car_data?session_key=${key}`),
        ])

      const positions  = posData.status      === 'fulfilled' ? posData.value      : []
      const laps       = lapData.status       === 'fulfilled' ? lapData.value       : []
      const stints     = stintData.status     === 'fulfilled' ? stintData.value     : []
      const pits       = pitData.status       === 'fulfilled' ? pitData.value       : []
      const driverMeta = driverData.status    === 'fulfilled' ? driverData.value    : []
      const intervals  = intervalData.status  === 'fulfilled' ? intervalData.value  : []
      const rcRaw      = rcData.status        === 'fulfilled' ? rcData.value        : []
      const radioRaw   = radioData.status     === 'fulfilled' ? radioData.value     : []
      const carRaw     = carData.status       === 'fulfilled' ? carData.value       : []

      // --- Race control ---
      const sortedRc = [...rcRaw].sort((a, b) => (a.date > b.date ? 1 : -1))
      setRcMessages(sortedRc.slice(-5))

      // Determine active flag from last flag-type message
      const flagMsg = [...sortedRc].reverse().find(m => m.flag && m.flag !== 'CLEAR' && m.flag !== 'NONE')
      const clearMsg = [...sortedRc].reverse().find(m => m.flag === 'CLEAR' || m.flag === 'NONE')
      if (flagMsg && (!clearMsg || flagMsg.date > clearMsg.date)) {
        setActiveFlag({ flag: flagMsg.flag, message: flagMsg.message })
      } else {
        setActiveFlag(null)
      }

      // --- Team radio (last 5) ---
      const driverMapForRadio = {}
      driverMeta.forEach(d => { driverMapForRadio[d.driver_number] = d })
      const sortedRadio = [...radioRaw].sort((a, b) => (a.date > b.date ? 1 : -1))
      setTeamRadio(
        sortedRadio.slice(-5).map(r => ({
          date: r.date,
          driverNumber: r.driver_number,
          driverName: driverMapForRadio[r.driver_number]?.name_acronym || `#${r.driver_number}`,
        }))
      )

      // --- Latest position per driver ---
      const latestPos = {}
      positions.forEach(p => {
        if (!latestPos[p.driver_number] || p.date > latestPos[p.driver_number].date) {
          latestPos[p.driver_number] = p
        }
      })

      // --- Latest lap per driver ---
      const latestLap = {}
      laps.forEach(l => {
        if (!latestLap[l.driver_number] || l.lap_number > (latestLap[l.driver_number].lap_number || 0)) {
          latestLap[l.driver_number] = l
        }
      })

      // --- Best lap per driver ---
      const bestLap = {}
      laps.forEach(l => {
        if (l.lap_duration && (!bestLap[l.driver_number] || l.lap_duration < bestLap[l.driver_number])) {
          bestLap[l.driver_number] = l.lap_duration
        }
      })

      // --- Best sectors per driver (personal best) ---
      const bestSectors = {}
      laps.forEach(l => {
        const n = l.driver_number
        if (!bestSectors[n]) bestSectors[n] = { s1: null, s2: null, s3: null }
        if (l.duration_sector_1 && (bestSectors[n].s1 === null || l.duration_sector_1 < bestSectors[n].s1))
          bestSectors[n].s1 = l.duration_sector_1
        if (l.duration_sector_2 && (bestSectors[n].s2 === null || l.duration_sector_2 < bestSectors[n].s2))
          bestSectors[n].s2 = l.duration_sector_2
        if (l.duration_sector_3 && (bestSectors[n].s3 === null || l.duration_sector_3 < bestSectors[n].s3))
          bestSectors[n].s3 = l.duration_sector_3
      })

      // --- Current stint per driver ---
      const currentStint = {}
      stints.forEach(s => {
        if (!currentStint[s.driver_number] || s.stint_number > (currentStint[s.driver_number].stint_number || 0)) {
          currentStint[s.driver_number] = s
        }
      })

      // --- Pit count per driver ---
      const pitCount = {}
      pits.forEach(p => {
        pitCount[p.driver_number] = (pitCount[p.driver_number] || 0) + 1
      })

      // --- Latest intervals per driver ---
      const latestInterval = {}
      intervals.forEach(iv => {
        if (!latestInterval[iv.driver_number] || iv.date > latestInterval[iv.driver_number].date) {
          latestInterval[iv.driver_number] = iv
        }
      })

      // --- Latest car data per driver ---
      const latestCar = {}
      carRaw.forEach(c => {
        if (!latestCar[c.driver_number] || c.date > latestCar[c.driver_number].date) {
          latestCar[c.driver_number] = c
        }
      })

      // --- Driver meta map ---
      const driverMap = {}
      driverMeta.forEach(d => { driverMap[d.driver_number] = d })

      const rawResult = Object.values(latestPos)
        .sort((a, b) => (a.position || 99) - (b.position || 99))
        .map(p => {
          const num    = p.driver_number
          const meta   = driverMap[num] || {}
          const lap    = latestLap[num] || {}
          const stint  = currentStint[num] || {}
          const iv     = latestInterval[num] || {}
          const car    = latestCar[num] || {}
          const bs     = bestSectors[num] || {}

          const drsActive = car.drs != null && car.drs >= 10

          // Tyre age = laps in current stint
          const tyreAge = stint.lap_start != null && lap.lap_number != null
            ? lap.lap_number - stint.lap_start + 1
            : null

          // gap_to_leader from intervals (preferred) or position data
          const gapToLeader = iv.gap_to_leader != null
            ? iv.gap_to_leader
            : p.gap_to_leader

          const intervalGap = iv.interval

          return {
            number: num,
            position: p.position,
            name: meta.full_name || meta.last_name || `#${num}`,
            short: meta.name_acronym || '',
            team: meta.team_name || '',
            teamColor: findTeamColor(meta.team_name),
            lastLap: lap.lap_duration ? formatLapTime(lap.lap_duration) : '—',
            bestLap: bestLap[num] ? formatLapTime(bestLap[num]) : '—',
            compound: stint.compound || '—',
            pits: pitCount[num] || 0,
            gap: gapToLeader != null
              ? (gapToLeader === 0 ? 'LEADER' : typeof gapToLeader === 'number' ? `+${gapToLeader.toFixed(3)}` : String(gapToLeader))
              : '—',
            interval: intervalGap != null
              ? (typeof intervalGap === 'number' ? (intervalGap === 0 ? '—' : `+${intervalGap.toFixed(3)}`) : String(intervalGap))
              : '—',
            intervalRaw: typeof intervalGap === 'number' ? intervalGap : null,
            speed: car.speed != null ? car.speed : null,
            drsActive,
            tyreAge,
            // last lap sectors
            lastS1: lap.duration_sector_1 || null,
            lastS2: lap.duration_sector_2 || null,
            lastS3: lap.duration_sector_3 || null,
            // personal best sectors (for color comparison)
            bestS1: bs.s1 || null,
            bestS2: bs.s2 || null,
            bestS3: bs.s3 || null,
          }
        })

      const result = computeSectorColors(rawResult)
      setDrivers(result)
      setLoading(false)

      // Notification: session went live
      if (session?.session_key && sessionNotifiedRef.current !== session.session_key) {
        sessionNotifiedRef.current = session.session_key
        addNotification(
          'Session Live',
          `${getSessionLabel(session)} is now live at ${session.circuit_short_name || session.location || ''}`,
          'success'
        )
      }

      // Notification: lead change
      if (result.length > 0) {
        const leader = result[0]?.name
        if (prevLeaderRef.current && prevLeaderRef.current !== leader) {
          addNotification('Lead Change', `${leader} has taken the lead!`, 'alert')
        }
        prevLeaderRef.current = leader
      }

      // Notification: new fastest lap (global best lap)
      const globalBest = result.reduce((b, d) => {
        if (!d.bestLap || d.bestLap === '—') return b
        return (!b || d.bestLap < b.lap) ? { lap: d.bestLap, driver: d.name } : b
      }, null)
      if (globalBest && prevFastestRef.current !== globalBest.lap) {
        if (prevFastestRef.current !== null) {
          addNotification('Fastest Lap', `${globalBest.driver} sets fastest lap: ${globalBest.lap}`, 'info')
        }
        prevFastestRef.current = globalBest.lap
      }

    } catch (err) {
      setLoading(false)
    }
  }, [session?.session_key, addNotification])

  useEffect(() => {
    if (!isLive || !session) {
      setDrivers([])
      setTrackPoints([])
      setLivePositions({})
      trackBuiltRef.current = false
      setLoading(false)
      return
    }
    setLoading(true)
    const key = session.session_key
    fetchLiveData()
    buildTrackOutline(key)
    fetchLiveGPS()
    intervalRef.current = setInterval(() => {
      fetchLiveData()
      fetchLiveGPS()
      buildTrackOutline(key) // no-op after first success
    }, 10000)
    return () => clearInterval(intervalRef.current)
  }, [isLive, session?.session_key])

  if (!isLive) {
    return (
      <div>
        <div className="section-header">
          <span className="section-title">Live Timing</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No session active</span>
        </div>

        <div className="card" style={{ maxWidth: 480 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            No live session right now.
          </div>

          {nextSession && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Next: {nextSession.session_name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                {nextSession.circuit_short_name || nextSession.location}
                {nextSession.country_name ? `, ${nextSession.country_name}` : ''}
              </div>
              <CountdownTimer
                targetDate={nextSession.date_start}
                label="Starts in"
              />
            </div>
          )}
        </div>

        <div className="card mt-16" style={{ maxWidth: 480 }}>
          <div className="card-title">Endpoints polled when live</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {['/position', '/laps', '/stints', '/pit', '/race_control', '/drivers', '/intervals', '/team_radio', '/car_data'].map(ep => (
              <div key={ep} style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                api.openf1.org/v1{ep}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const flagColor = activeFlag ? (FLAG_COLORS[activeFlag.flag] || '#888') : null
  const flagTextColor = activeFlag?.flag === 'CHEQUERED' ? '#000' : (activeFlag?.flag === 'YELLOW' || activeFlag?.flag === 'DOUBLE_YELLOW' ? '#000' : '#fff')

  return (
    <div>
      {/* Track status banner */}
      {activeFlag && (
        <div style={{
          background: flagColor,
          color: flagTextColor,
          padding: '8px 16px',
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: 0.5,
          borderRadius: 6,
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, border: `1px solid ${flagTextColor}`, borderRadius: 3, padding: '1px 5px' }}>
            {activeFlag.flag.replace(/_/g, ' ')}
          </span>
          <span>{activeFlag.message}</span>
        </div>
      )}

      {/* Race control message ticker */}
      {rcMessages.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
          marginBottom: 10,
          scrollbarWidth: 'none',
        }}>
          {rcMessages.map((m, i) => (
            <div key={i} style={{
              flexShrink: 0,
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              padding: '4px 10px',
              fontSize: 11,
              color: 'var(--text-secondary)',
              maxWidth: 260,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>
                {m.date ? m.date.slice(11, 19) : ''}
              </span>
              {m.message}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12, alignItems: 'start', marginBottom: 12 }}>
        {/* Left: section header */}
        <div>
          <div className="section-header" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="live-dot" />
              <span className="section-title">
                {session ? `${getSessionLabel(session)} — ${session.circuit_short_name || session.location}` : 'Live Timing'}
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Every 10s</span>
          </div>
        </div>

        {/* Right: live track map */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: '#080808' }}>
          {trackPoints.length > 0 ? (
            <TrackCanvas
              trackPoints={trackPoints}
              drivers={Object.values(livePositions).map(p => {
                const d = drivers.find(dr => dr.number === p.driver_number)
                return {
                  x: p.x, y: p.y,
                  color: d?.teamColor?.replace('#', '') || '888888',
                  short: d?.short || String(p.driver_number),
                }
              })}
              height={170}
            />
          ) : (
            <div style={{ height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, color: '#333' }}>Waiting for GPS…</span>
            </div>
          )}
        </div>
      </div>

      {loading && drivers.length === 0 ? (
        <div className="loading">Fetching live data…</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>Pos</th>
                  <th>Driver</th>
                  <th>Team</th>
                  <th>Interval</th>
                  <th>Gap</th>
                  <th>Last Lap</th>
                  <th>S1</th>
                  <th>S2</th>
                  <th>S3</th>
                  <th>Tire</th>
                  <th>Age</th>
                  <th style={{ textAlign: 'right' }}>Pits</th>
                  <th style={{ textAlign: 'right' }}>Speed</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => {
                  const photoUrl = getPhoto(d.short, d.number)
                  return (
                  <tr key={d.number}>
                    <td className="pos" style={{ fontWeight: 600, color: d.position === 1 ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {d.position}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={d.short}
                            style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'var(--card)' }}
                            onError={e => { e.currentTarget.style.display = 'none' }}
                          />
                        ) : (
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                            background: d.teamColor ? `${d.teamColor}22` : 'var(--card)',
                            border: `1px solid ${d.teamColor || 'var(--border)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 8, fontWeight: 700, color: d.teamColor || 'var(--text-muted)',
                          }}>
                            {d.short?.slice(0, 2) || '??'}
                          </div>
                        )}
                        <span className="driver-name">{d.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.short}</span>
                        <DrsBadge active={d.drsActive} />
                      </div>
                    </td>
                    <td>
                      <div className="flex-center gap-6">
                        <TeamDot color={d.teamColor} />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.team}</span>
                      </div>
                    </td>
                    <td style={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      color: d.intervalRaw != null && d.intervalRaw < 1 ? '#22c55e' : 'var(--text-secondary)',
                    }}>
                      {d.interval}
                    </td>
                    <td style={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      color: d.gap === 'LEADER' ? 'var(--accent)' : 'var(--text-secondary)',
                    }}>
                      {d.gap}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{d.lastLap}</td>
                    <td><SectorBadge time={d.lastS1} color={d.s1color} /></td>
                    <td><SectorBadge time={d.lastS2} color={d.s2color} /></td>
                    <td><SectorBadge time={d.lastS3} color={d.s3color} /></td>
                    <td>
                      {d.compound !== '—' ? <TireBadge compound={d.compound} /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {d.tyreAge != null ? d.tyreAge : '—'}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>{d.pits}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {d.speed != null ? `${d.speed}` : '—'}
                    </td>
                  </tr>
                  )
                })}
                {drivers.length === 0 && (
                  <tr>
                    <td colSpan={13} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                      Waiting for data…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Team Radio section */}
      {teamRadio.length > 0 && (
        <div className="card mt-16">
          <div className="card-title" style={{ marginBottom: 10 }}>Team Radio</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {teamRadio.map((r, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 12,
                color: 'var(--text-secondary)',
                padding: '5px 0',
                borderBottom: i < teamRadio.length - 1 ? '1px solid var(--border-light)' : 'none',
              }}>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>
                  {r.date ? r.date.slice(11, 19) : ''}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', minWidth: 36 }}>
                  {r.driverName}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>Radio transmission</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
