import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLiveSession } from '../hooks/useLiveSession'
import { OPENF1 } from '../constants/endpoints'
import SessionSelector from '../components/SessionSelector'
import CustomSelect from '../components/CustomSelect'
import TrackCanvas from '../components/TrackCanvas'
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

function formatLapTime(s) {
  if (!s || s <= 0) return '—'
  const mins = Math.floor(s / 60)
  const secs = (s % 60).toFixed(3).padStart(6, '0')
  return `${mins}:${secs}`
}

function downsample(arr, maxPts) {
  if (arr.length <= maxPts) return arr
  const step = arr.length / maxPts
  return Array.from({ length: maxPts }, (_, i) => arr[Math.floor(i * step)])
}

const MAX_MULTI_DRIVERS = 6

export default function Telemetry({ season }) {
  const { isLive } = useLiveSession()

  // ── Session ────────────────────────────────────────────────
  const [sessionKey, setSessionKey] = useState('latest')
  const [sessionMeta, setSessionMeta] = useState(null)

  // ── Mode ───────────────────────────────────────────────────
  const [compareMode, setCompareMode] = useState(false)

  // ── Single driver mode state ───────────────────────────────
  const [drivers, setDrivers]             = useState([])
  const [selectedDriver, setSelectedDriver] = useState(null)
  const [loadingDrivers, setLoadingDrivers] = useState(false)
  const [laps, setLaps]           = useState([])
  const [selectedLap, setSelectedLap] = useState(null)
  const [loadingLaps, setLoadingLaps] = useState(false)
  const [paceData, setPaceData]   = useState([])
  const [lapData, setLapData]         = useState([])
  const [lapSpeedTrace, setLapSpeedTrace] = useState(null)
  const [trackPoints, setTrackPoints] = useState([])
  const [loadingTelemetry, setLoadingTelemetry] = useState(false)

  // ── Multi driver mode state ────────────────────────────────
  const [selectedDrivers, setSelectedDrivers] = useState([])  // array of driver_number
  const [multiTelemetry, setMultiTelemetry]   = useState({})  // { driver_number: { data, color, acronym } }
  const [loadingMulti, setLoadingMulti]       = useState(false)

  // ── Fetch drivers for a session ───────────────────────────
  const fetchDrivers = useCallback(async (sk) => {
    setLoadingDrivers(true)
    setDrivers([])
    setSelectedDriver(null)
    setLaps([])
    setSelectedLap(null)
    setLapData([])
    setPaceData([])
    setSelectedDrivers([])
    setMultiTelemetry({})
    try {
      const key = sk === 'latest' ? 'latest' : sk
      const data = await window.api.fetchLive(`${OPENF1}/drivers?session_key=${key}`)
      if (!Array.isArray(data) || data.length === 0) return
      const unique = {}
      data.forEach(d => { unique[d.driver_number] = d })
      const list = Object.values(unique).sort((a, b) => {
        const na = a.name_acronym || ''
        const nb = b.name_acronym || ''
        return na.localeCompare(nb)
      })
      setDrivers(list)
      setSelectedDriver(list[0]?.driver_number ?? null)
    } catch {
      setDrivers([])
    } finally {
      setLoadingDrivers(false)
    }
  }, [])

  // ── Fetch laps for selected driver/session ─────────────────
  const fetchLaps = useCallback(async (sk, driverNum) => {
    if (!driverNum) return
    setLoadingLaps(true)
    setLaps([])
    setSelectedLap(null)
    setLapData([])
    setPaceData([])
    try {
      const key = sk === 'latest' ? 'latest' : sk
      const data = await window.api.fetchLive(
        `${OPENF1}/laps?session_key=${key}&driver_number=${driverNum}`
      )
      if (!Array.isArray(data)) return
      const valid = data
        .filter(l => l.lap_duration && l.lap_duration > 10)
        .sort((a, b) => a.lap_number - b.lap_number)
      setLaps(valid)
      setPaceData(valid.map(l => ({
        lap: l.lap_number,
        time: parseFloat(l.lap_duration?.toFixed(3)),
        label: formatLapTime(l.lap_duration),
        isPit: !!l.is_pit_out_lap,
      })))
      if (valid.length > 0) {
        setSelectedLap(valid[valid.length - 1].lap_number)
      }
    } catch {
      setLaps([])
      setPaceData([])
    } finally {
      setLoadingLaps(false)
    }
  }, [])

  // ── Fetch car telemetry for selected lap ───────────────────
  const fetchLapTelemetry = useCallback(async (sk, driverNum, lapNum, lapList) => {
    if (!driverNum || !lapNum || !lapList.length) return
    setLoadingTelemetry(true)
    setLapData([])
    setLapSpeedTrace(null)
    try {
      const key = sk === 'latest' ? 'latest' : sk
      const lapInfo = lapList.find(l => l.lap_number === lapNum)
      if (!lapInfo?.date_start) return
      const startDate = lapInfo.date_start
      const endDate = new Date(new Date(startDate).getTime() + 150000).toISOString()

      // Fetch car_data and GPS location in parallel
      const [raw, gpsRaw] = await Promise.all([
        window.api.fetchLive(
          `${OPENF1}/car_data?session_key=${key}&driver_number=${driverNum}&date>=${encodeURIComponent(startDate)}&date<=${encodeURIComponent(endDate)}`
        ).catch(() => []),
        window.api.fetchLive(
          `${OPENF1}/location?session_key=${key}&driver_number=${driverNum}&date>=${encodeURIComponent(startDate)}&date<=${encodeURIComponent(endDate)}`
        ).catch(() => []),
      ])

      if (Array.isArray(raw) && raw.length > 0) {
        const sorted = raw.sort((a, b) => new Date(a.date) - new Date(b.date))
        const sampled = downsample(sorted, 400)
        const t0 = new Date(sampled[0].date).getTime()
        setLapData(sampled.map(p => ({
          t:        parseFloat(((new Date(p.date).getTime() - t0) / 1000).toFixed(2)),
          speed:    p.speed,
          throttle: p.throttle,
          brake:    p.brake ? 100 : 0,
          rpm:      p.rpm,
          gear:     p.n_gear,
        })))
      }

      // Build speed trace: match GPS points with nearest car_data speed
      if (Array.isArray(gpsRaw) && gpsRaw.length > 10 && Array.isArray(raw) && raw.length > 0) {
        const sortedGPS = gpsRaw.sort((a, b) => new Date(a.date) - new Date(b.date))
        const sortedCar = raw.sort((a, b) => new Date(a.date) - new Date(b.date))
        let carIdx = 0
        const trace = downsample(sortedGPS, 600).map(p => {
          const pt = new Date(p.date).getTime()
          while (carIdx < sortedCar.length - 1 && new Date(sortedCar[carIdx + 1].date).getTime() <= pt) carIdx++
          return { x: p.x, y: p.y, speed: sortedCar[carIdx]?.speed ?? 200 }
        })
        setLapSpeedTrace(trace)
        // Build track outline from all GPS (for normalizer bounds)
        setTrackPoints(sortedGPS.map(p => ({ x: p.x, y: p.y })))
      }
    } catch {
      setLapData([])
    } finally {
      setLoadingTelemetry(false)
    }
  }, [])

  // ── Fetch multi-driver telemetry (best lap each) ───────────
  const fetchMultiTelemetry = useCallback(async (sk, driverNums, driverList) => {
    if (!driverNums.length) { setMultiTelemetry({}); return }
    setLoadingMulti(true)
    const key = sk === 'latest' ? 'latest' : sk
    const results = {}
    await Promise.all(driverNums.map(async (num) => {
      const driverMeta = driverList.find(d => d.driver_number === num)
      const color = driverMeta?.team_colour ? `#${driverMeta.team_colour}` : '#888888'
      const acronym = driverMeta?.name_acronym || String(num)
      try {
        // Fetch laps to find best
        const lapsRaw = await window.api.fetchLive(`${OPENF1}/laps?session_key=${key}&driver_number=${num}`)
        if (!Array.isArray(lapsRaw) || lapsRaw.length === 0) return
        const validLaps = lapsRaw.filter(l => l.lap_duration && l.lap_duration > 10)
        if (!validLaps.length) return
        const bestLap = validLaps.reduce((b, l) => l.lap_duration < b.lap_duration ? l : b, validLaps[0])
        if (!bestLap?.date_start) return
        const startDate = bestLap.date_start
        const endDate = new Date(new Date(startDate).getTime() + 150000).toISOString()
        const url = `${OPENF1}/car_data?session_key=${key}&driver_number=${num}&date>=${encodeURIComponent(startDate)}&date<=${encodeURIComponent(endDate)}`
        const raw = await window.api.fetchLive(url)
        if (!Array.isArray(raw) || raw.length === 0) return
        const sorted = raw.sort((a, b) => new Date(a.date) - new Date(b.date))
        const sampled = downsample(sorted, 300)
        const t0 = new Date(sampled[0].date).getTime()
        results[num] = {
          color,
          acronym,
          lapNum: bestLap.lap_number,
          lapTime: formatLapTime(bestLap.lap_duration),
          data: sampled.map(p => ({
            t:        parseFloat(((new Date(p.date).getTime() - t0) / 1000).toFixed(2)),
            [`speed_${num}`]:    p.speed,
            [`throttle_${num}`]: p.throttle,
            [`brake_${num}`]:    p.brake ? 100 : 0,
            [`gear_${num}`]:     p.n_gear,
          }))
        }
      } catch { /* skip this driver */ }
    }))
    setMultiTelemetry(results)
    setLoadingMulti(false)
  }, [])

  // ── Merge multi-driver data into unified time series ───────
  const mergedMultiData = useMemo(() => {
    const entries = Object.entries(multiTelemetry)
    if (entries.length === 0) return []
    // Use the longest dataset as the time index base
    let longest = entries[0]
    for (const e of entries) {
      if (e[1].data.length > longest[1].data.length) longest = e
    }
    return longest[1].data.map((point, i) => {
      const merged = { t: point.t }
      for (const [num, info] of entries) {
        const p = info.data[i]
        if (p) {
          merged[`speed_${num}`]    = p[`speed_${num}`]
          merged[`throttle_${num}`] = p[`throttle_${num}`]
          merged[`brake_${num}`]    = p[`brake_${num}`]
          merged[`gear_${num}`]     = p[`gear_${num}`]
        }
      }
      return merged
    })
  }, [multiTelemetry])

  // ── Effects ────────────────────────────────────────────────
  useEffect(() => { fetchDrivers(sessionKey) }, [sessionKey, fetchDrivers])

  useEffect(() => {
    if (!compareMode && selectedDriver) fetchLaps(sessionKey, selectedDriver)
  }, [selectedDriver, sessionKey, fetchLaps, compareMode])

  useEffect(() => {
    if (!compareMode && selectedDriver && selectedLap) {
      fetchLapTelemetry(sessionKey, selectedDriver, selectedLap, laps)
    }
  }, [selectedLap, selectedDriver, sessionKey, fetchLapTelemetry, laps, compareMode])

  useEffect(() => {
    if (compareMode && selectedDrivers.length > 0) {
      fetchMultiTelemetry(sessionKey, selectedDrivers, drivers)
    }
  }, [compareMode, selectedDrivers, sessionKey, drivers, fetchMultiTelemetry])

  useEffect(() => {
    if (sessionKey !== 'latest' || !isLive) return
    const id = setInterval(() => fetchDrivers('latest'), 60000)
    return () => clearInterval(id)
  }, [sessionKey, isLive, fetchDrivers])

  // ── Derived ────────────────────────────────────────────────
  const selectedDriverMeta = drivers.find(d => d.driver_number === selectedDriver)
  const bestLap = laps.length > 0
    ? laps.reduce((b, l) => l.lap_duration < b.lap_duration ? l : b, laps[0])
    : null

  const isViewingLatest = sessionKey === 'latest'
  const sessionLabel = sessionMeta
    ? `${sessionMeta.meeting_name} — ${sessionMeta.session_name}`
    : 'Latest Session'

  // Driver options for single-mode select
  const driverOptions = drivers.map(d => ({
    value: d.driver_number,
    label: `#${d.driver_number} ${d.name_acronym || d.last_name || d.full_name}`
  }))

  // Lap options for single-mode select
  const lapOptions = [...laps].reverse().map(l => ({
    value: l.lap_number,
    label: `Lap ${l.lap_number} — ${formatLapTime(l.lap_duration)}${l.lap_number === bestLap?.lap_number ? ' (Best)' : ''}${l.is_pit_out_lap ? ' (Pit out)' : ''}`
  }))

  function toggleMultiDriver(num) {
    setSelectedDrivers(prev => {
      if (prev.includes(num)) return prev.filter(n => n !== num)
      if (prev.length >= MAX_MULTI_DRIVERS) return prev
      return [...prev, num]
    })
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div>
      {/* ── Header ── */}
      <div className="section-header" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="flex-center gap-10">
          {isLive && isViewingLatest && <span className="live-dot" />}
          <span className="section-title">Telemetry &amp; Race Pace — {season}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Session picker */}
          <SessionSelector season={season} onSelect={(sk, meta) => { setSessionKey(sk); setSessionMeta(meta) }} />

          {/* Mode toggle */}
          <button
            onClick={() => setCompareMode(m => !m)}
            style={{
              padding: '5px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
              background: compareMode ? 'var(--accent)' : 'var(--card)',
              border: `1px solid ${compareMode ? 'var(--accent)' : 'var(--border)'}`,
              color: compareMode ? '#fff' : 'var(--text-muted)', fontWeight: 600,
            }}
          >
            Compare Mode
          </button>

          {/* Single mode: driver + lap pickers */}
          {!compareMode && drivers.length > 0 && (
            <CustomSelect
              value={selectedDriver ?? ''}
              onChange={v => setSelectedDriver(Number(v))}
              options={driverOptions}
              placeholder="Select driver..."
            />
          )}
          {!compareMode && laps.length > 0 && (
            <CustomSelect
              value={selectedLap ?? ''}
              onChange={v => setSelectedLap(Number(v))}
              options={lapOptions}
              placeholder="Select lap..."
              style={{ minWidth: 200 }}
            />
          )}
        </div>
      </div>

      {/* Session label */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Showing: <strong style={{ color: 'var(--text)' }}>{sessionLabel}</strong>
        {!compareMode && selectedDriverMeta && (
          <span style={{ marginLeft: 8 }}>
            · <strong style={{ color: 'var(--text)' }}>
              #{selectedDriverMeta.driver_number} {selectedDriverMeta.full_name || selectedDriverMeta.last_name}
            </strong>
            {selectedDriverMeta.team_name && (
              <span style={{ color: 'var(--text-muted)' }}> ({selectedDriverMeta.team_name})</span>
            )}
          </span>
        )}
        {!compareMode && bestLap && (
          <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
            · Best lap: <strong style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{formatLapTime(bestLap.lap_duration)}</strong> (Lap {bestLap.lap_number})
          </span>
        )}
        {compareMode && (
          <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
            · Compare Mode — select up to {MAX_MULTI_DRIVERS} drivers below
          </span>
        )}
      </div>

      {/* ── Loading states ── */}
      {loadingDrivers && <div className="loading">Loading session data...</div>}

      {!loadingDrivers && drivers.length === 0 && (
        <div className="card" style={{ maxWidth: 420 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>No telemetry data available for this session.</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Select a race from the dropdown. OpenF1 telemetry covers 2023-present.
          </div>
        </div>
      )}

      {/* ── COMPARE MODE ── */}
      {compareMode && drivers.length > 0 && (
        <div>
          {/* Driver chip selector */}
          <div className="card mb-16" style={{ marginBottom: 12 }}>
            <div className="card-title">Select Drivers (up to {MAX_MULTI_DRIVERS})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {drivers.map(d => {
                const isSelected = selectedDrivers.includes(d.driver_number)
                const color = d.team_colour ? `#${d.team_colour}` : '#888'
                const atMax = selectedDrivers.length >= MAX_MULTI_DRIVERS && !isSelected
                return (
                  <button
                    key={d.driver_number}
                    onClick={() => !atMax && toggleMultiDriver(d.driver_number)}
                    style={{
                      padding: '4px 10px', fontSize: 11, borderRadius: 4,
                      cursor: atMax ? 'not-allowed' : 'pointer',
                      border: `2px solid ${isSelected ? color : 'var(--border)'}`,
                      background: isSelected ? color + '22' : 'var(--card)',
                      color: isSelected ? color : 'var(--text-muted)',
                      fontWeight: isSelected ? 700 : 500,
                      opacity: atMax ? 0.4 : 1,
                    }}
                  >
                    {d.name_acronym || d.last_name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Load telemetry button */}
          {selectedDrivers.length > 0 && (
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => fetchMultiTelemetry(sessionKey, selectedDrivers, drivers)}
                disabled={loadingMulti}
                style={{
                  padding: '5px 14px', fontSize: 12, borderRadius: 5, cursor: 'pointer',
                  background: 'var(--accent)', border: 'none', color: '#fff', fontWeight: 600,
                  opacity: loadingMulti ? 0.6 : 1,
                }}
              >
                {loadingMulti ? 'Loading...' : 'Load Fastest Laps'}
              </button>
              {Object.keys(multiTelemetry).length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Loaded {Object.keys(multiTelemetry).length} driver(s)
                </span>
              )}
            </div>
          )}

          {/* Legend for loaded drivers */}
          {Object.keys(multiTelemetry).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12, fontSize: 11, color: 'var(--text-muted)' }}>
              {Object.entries(multiTelemetry).map(([num, info]) => (
                <span key={num} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ display: 'inline-block', width: 20, height: 3, background: info.color, borderRadius: 2 }} />
                  {info.acronym} — Best Lap {info.lapNum} ({info.lapTime})
                </span>
              ))}
            </div>
          )}

          {/* Multi-driver charts */}
          {mergedMultiData.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Speed */}
              <div className="card">
                <div className="card-title">Speed (km/h) — All Selected Drivers</div>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mergedMultiData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="s" />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={36} unit=" km/h" />
                      <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {Object.entries(multiTelemetry).map(([num, info]) => (
                        <Line
                          key={num}
                          type="monotone"
                          dataKey={`speed_${num}`}
                          name={info.acronym}
                          stroke={info.color}
                          strokeWidth={1.5}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Throttle */}
              <div className="card">
                <div className="card-title">Throttle (%)</div>
                <div style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mergedMultiData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="s" />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                      {Object.entries(multiTelemetry).map(([num, info]) => (
                        <Line key={num} type="monotone" dataKey={`throttle_${num}`} name={info.acronym} stroke={info.color} strokeWidth={1} dot={false} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Brake */}
              <div className="card">
                <div className="card-title">Brake (%)</div>
                <div style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mergedMultiData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="s" />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                      {Object.entries(multiTelemetry).map(([num, info]) => (
                        <Line key={num} type="monotone" dataKey={`brake_${num}`} name={info.acronym} stroke={info.color} strokeWidth={1} dot={false} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Gear */}
              <div className="card">
                <div className="card-title">Gear</div>
                <div style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mergedMultiData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="s" />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={20} domain={[1, 8]} ticks={[1,2,3,4,5,6,7,8]} />
                      <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                      {Object.entries(multiTelemetry).map(([num, info]) => (
                        <Line key={num} type="stepAfter" dataKey={`gear_${num}`} name={info.acronym} stroke={info.color} strokeWidth={1.5} dot={false} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {selectedDrivers.length === 0 && (
            <div className="card" style={{ maxWidth: 420 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Select drivers above then click Load Fastest Laps to compare telemetry.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SINGLE DRIVER MODE ── */}
      {!compareMode && (
        <>
          {/* Race Pace Chart */}
          {!loadingDrivers && paceData.length > 1 && (
            <div className="card mb-16">
              <div className="card-title">
                Race Pace — Lap Times
                {selectedLap && (
                  <span style={{ marginLeft: 8, color: 'var(--accent)', textTransform: 'none', letterSpacing: 0 }}>
                    (Lap {selectedLap} selected)
                  </span>
                )}
              </div>
              {loadingLaps ? (
                <div className="loading" style={{ height: 120 }}>Loading laps...</div>
              ) : (
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={paceData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="lap" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                        label={{ value: 'Lap', position: 'insideBottomRight', offset: 0, fontSize: 9, fill: 'var(--text-muted)' }} />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={44}
                        tickFormatter={v => formatLapTime(v)} />
                      <Tooltip
                        contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }}
                        formatter={(v) => [formatLapTime(v), 'Lap Time']}
                        labelFormatter={l => `Lap ${l}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="time"
                        stroke="var(--accent)"
                        strokeWidth={1.5}
                        connectNulls
                        dot={(props) => {
                          const { cx, cy, payload } = props
                          if (payload.lap === selectedLap)
                            return <circle key={cy} cx={cx} cy={cy} r={5} fill="var(--accent)" stroke="#fff" strokeWidth={1.5} />
                          if (payload.lap === bestLap?.lap_number)
                            return <circle key={cy} cx={cx} cy={cy} r={4} fill="#22c55e" stroke="none" />
                          if (payload.isPit)
                            return <circle key={cy} cx={cx} cy={cy} r={4} fill="#3b82f6" stroke="none" />
                          return <circle key={cy} cx={cx} cy={cy} r={2} fill="var(--accent)" stroke="none" />
                        }}
                        onClick={(_, idx) => {
                          if (paceData[idx]) setSelectedLap(paceData[idx].lap)
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="flex-center gap-16 mt-8" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                <span className="flex-center gap-5"><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} /> Best lap</span>
                <span className="flex-center gap-5"><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} /> Pit out lap</span>
                <span className="flex-center gap-5"><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} /> Selected lap</span>
                <span style={{ color: 'var(--text-muted)' }}>Click a point on the chart to view its telemetry</span>
              </div>
            </div>
          )}

          {/* Track Map — speed-colored lap trace */}
          {lapSpeedTrace && trackPoints.length > 0 && (
            <div className="mb-16" style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--card)' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>Lap {selectedLap} — Speed Map</span>
                <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-muted)' }}>
                  <span style={{ color: '#dc2828' }}>● Slow</span>
                  <span style={{ color: '#dcba28' }}>● Mid</span>
                  <span style={{ color: '#22c55e' }}>● Fast</span>
                </div>
              </div>
              <TrackCanvas trackPoints={trackPoints} speedTrace={lapSpeedTrace} height={200} />
            </div>
          )}

          {/* Speed Trace */}
          {!loadingDrivers && drivers.length > 0 && (
            <div className="card mb-16">
              <div className="card-title">
                Speed Trace — {selectedLap ? `Lap ${selectedLap}` : 'Select a lap above'}
              </div>
              {loadingTelemetry ? (
                <div className="loading" style={{ height: 150 }}>Loading telemetry...</div>
              ) : lapData.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '28px 0', textAlign: 'center' }}>
                  {selectedLap ? 'No car data for this lap — try another' : 'Select a lap to view telemetry'}
                </div>
              ) : (
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lapData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="s" />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={36} unit=" km/h" />
                      <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                      <Line type="monotone" dataKey="speed" name="Speed (km/h)" stroke="var(--accent)" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Throttle + Brake */}
          {lapData.length > 0 && (
            <div className="grid-2" style={{ gap: 16 }}>
              <div className="card">
                <div className="card-title">Throttle (%)</div>
                <div style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={lapData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="s" />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                      <Area type="monotone" dataKey="throttle" name="Throttle" stroke="#22c55e" fill="#22c55e44" strokeWidth={1} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card">
                <div className="card-title">Brake</div>
                <div style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={lapData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="s" />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                      <Area type="monotone" dataKey="brake" name="Brake" stroke="#ef4444" fill="#ef444444" strokeWidth={1} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* RPM + Gear */}
          {lapData.length > 0 && (
            <div className="grid-2 mt-16" style={{ gap: 16 }}>
              <div className="card">
                <div className="card-title">RPM</div>
                <div style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lapData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="s" />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                      <Line type="monotone" dataKey="rpm" name="RPM" stroke="#8b5cf6" strokeWidth={1} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card">
                <div className="card-title">Gear</div>
                <div style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lapData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} unit="s" />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={20} domain={[1, 8]} ticks={[1,2,3,4,5,6,7,8]} />
                      <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                      <Line type="stepAfter" dataKey="gear" name="Gear" stroke="#f97316" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
