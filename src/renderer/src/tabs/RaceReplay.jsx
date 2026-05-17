import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { OPENF1 } from '../constants/endpoints'
import SessionSelector from '../components/SessionSelector'
import { useDriverPhotos } from '../hooks/useDriverPhotos'

// ─── Constants ────────────────────────────────────────────────────────────────
const SPEEDS = [0.5, 1, 2, 4, 8, 16, 32]
const CHUNK_MINUTES = 45
const CANVAS_PAD = 44
const MAX_FOCUSED = 3

const FLAG_COLOR = {
  GREEN: '#22c55e', YELLOW: '#ffc906', RED: '#ef4444',
  SAFETY_CAR: '#f97316', VIRTUAL_SAFETY_CAR: '#8b5cf6',
  CHEQUERED: '#ffffff', BLUE: '#3b82f6',
}

const COMPOUND_COLOR = {
  SOFT: '#e8002d', MEDIUM: '#ffc906', HARD: '#cccccc',
  INTERMEDIATE: '#39b54a', WET: '#0067ff',
}

function compoundAbbr(c) {
  return { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' }[c] || '?'
}

function hexToRgb(hex = '888888') {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function formatTime(secs) {
  if (!secs && secs !== 0) return '--:--'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function bisect(arr, t) {
  let lo = 0, hi = arr.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (arr[mid].t <= t) lo = mid; else hi = mid - 1
  }
  return lo
}

function posAtTime(arr, t) {
  if (!arr || arr.length === 0) return null
  if (t <= arr[0].t) return { x: arr[0].x, y: arr[0].y }
  if (t >= arr[arr.length - 1].t) return { x: arr[arr.length - 1].x, y: arr[arr.length - 1].y }
  const i = bisect(arr, t)
  if (i >= arr.length - 1) return { x: arr[i].x, y: arr[i].y }
  const a = arr[i], b = arr[i + 1]
  const f = (t - a.t) / (b.t - a.t)
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
}

function carAtTime(arr, t) {
  if (!arr || arr.length === 0) return null
  const i = bisect(arr, t)
  return arr[i] || null
}

function positionAtTime(posArr, t) {
  if (!posArr || posArr.length === 0) return null
  let pos = posArr[0].position
  for (const p of posArr) {
    if (p.t > t) break
    pos = p.position
  }
  return pos
}

function lapAtTimeFn(lapArr, t) {
  if (!lapArr || lapArr.length === 0) return 1
  let lap = 1
  for (const p of lapArr) {
    if (p.t > t) break
    lap = p.lap
  }
  return lap
}

function weatherAtTime(arr, t) {
  if (!arr || arr.length === 0) return null
  let w = arr[0]
  for (const p of arr) {
    if (p.t > t) break
    w = p
  }
  return w
}

// ─── Track normalizer ─────────────────────────────────────────────────────────
function buildNormalizer(allPoints, W, H, pad = CANVAS_PAD) {
  if (!allPoints.length) return null
  const xs = allPoints.map(p => p.x), ys = allPoints.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1
  const scale = Math.min((W - 2 * pad) / rangeX, (H - 2 * pad) / rangeY)
  const offX = pad + ((W - 2 * pad) - rangeX * scale) / 2
  const offY = pad + ((H - 2 * pad) - rangeY * scale) / 2
  return {
    toCanvas: (x, y) => ({
      px: offX + (x - minX) * scale,
      py: H - (offY + (y - minY) * scale),
    }),
  }
}

// ─── Canvas renderer ──────────────────────────────────────────────────────────
function renderFrame(canvas, norm, trackPoints, driverStates, focusedSet) {
  if (!canvas || !norm) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#080808'
  ctx.fillRect(0, 0, W, H)

  // ── Track — 3-layer: border → asphalt → green racing line ──
  if (trackPoints.length > 10) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const buildPath = () => {
      ctx.beginPath()
      let first = true
      for (const p of trackPoints) {
        const { px, py } = norm.toCanvas(p.x, p.y)
        if (first) { ctx.moveTo(px, py); first = false } else ctx.lineTo(px, py)
      }
    }

    buildPath()
    ctx.strokeStyle = '#1c1c1c'
    ctx.lineWidth = 22
    ctx.stroke()

    buildPath()
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 14
    ctx.stroke()

    buildPath()
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 4
    ctx.stroke()

    // Start/finish marker
    const sf = trackPoints[0]
    if (sf) {
      const { px: sfX, py: sfY } = norm.toCanvas(sf.x, sf.y)
      ctx.beginPath()
      ctx.arc(sfX, sfY, 6, 0, Math.PI * 2)
      ctx.fillStyle = '#e8002d'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 6px system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('SF', sfX, sfY)
    }
  }

  // ── Drivers — unfocused first, focused on top ──
  const sorted = [...driverStates].sort((a, b) =>
    (focusedSet.has(a.number) ? 1 : 0) - (focusedSet.has(b.number) ? 1 : 0)
  )

  for (const d of sorted) {
    if (!d.pos) continue
    const { px, py } = norm.toCanvas(d.pos.x, d.pos.y)
    const [r, g, b] = hexToRgb(d.color)
    const focused = focusedSet.has(d.number)
    const radius = focused ? 8 : 5

    if (focused) {
      ctx.shadowColor = `rgba(${r},${g},${b},0.9)`
      ctx.shadowBlur = 18
    }

    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = focused ? 2 : 1
    ctx.stroke()
    ctx.shadowBlur = 0

    // Label to the right of dot
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${focused ? 9 : 8}px system-ui`
    ctx.fillStyle = focused ? '#fff' : 'rgba(255,255,255,0.7)'
    ctx.fillText(d.short, px + radius + 3, py)
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WeatherPanel({ weather }) {
  if (!weather) return null
  const isWet = weather.rainfall > 0
  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid #1a1a1a' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>Weather</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[
          ['● Track', weather.track_temp != null ? `${weather.track_temp.toFixed(1)}°C` : '--', '#e8002d'],
          ['● Air', weather.air_temp != null ? `${weather.air_temp.toFixed(1)}°C` : '--', '#3b82f6'],
          ['● Humidity', weather.humidity != null ? `${Math.round(weather.humidity)}%` : '--', '#888'],
          ['● Wind', weather.wind_speed != null ? `${weather.wind_speed.toFixed(1)} km/h` : '--', '#888'],
          ['● Rain', isWet ? 'WET' : 'DRY', isWet ? '#3b82f6' : '#888'],
        ].map(([label, val, dotColor]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: dotColor }}>{label}</span>
            <span style={{ color: '#c0c0c0', fontWeight: 600 }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DriverPanel({ driver, carData, locationData, currentTime, leaderboard, focusedSet }) {
  if (!driver) return null
  const [r, g, b] = hexToRgb(driver.color)
  const car = carData ? carAtTime(carData, currentTime) : null

  // Speed from car_data or approximate from GPS delta
  let speed = car?.speed ?? null
  if (speed == null && locationData && locationData.length > 1) {
    const i = bisect(locationData, currentTime)
    if (i > 0) {
      const a = locationData[i - 1], b2 = locationData[i]
      const dt = b2.t - a.t
      if (dt > 0) {
        const dx = b2.x - a.x, dy = b2.y - a.y
        speed = Math.round(Math.sqrt(dx * dx + dy * dy) / dt * 3.6)
      }
    }
  }

  const gear = car?.n_gear ?? null
  const drs = car?.drs != null ? (car.drs >= 10 ? 'ON' : 'OFF') : null
  const throttle = car?.throttle ?? null
  const brake = car?.brake ?? null

  // Gap to driver ahead/behind
  const thisPos = driver.position
  const ahead = leaderboard.find(d => d.position === thisPos - 1)
  const behind = leaderboard.find(d => d.position === thisPos + 1)

  return (
    <div style={{ borderBottom: '1px solid #1a1a1a' }}>
      {/* Team-colored header — matches reference */}
      <div style={{ padding: '4px 12px', background: `rgba(${r},${g},${b},0.2)`, borderLeft: `3px solid rgb(${r},${g},${b})` }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: `rgb(${r},${g},${b})`, letterSpacing: '0.05em' }}>Driver: {driver.short}</span>
      </div>
      <div style={{ padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {[
          ['Speed', speed != null ? `${speed} km/h` : 'N/A'],
          ['Gear', gear != null ? String(gear) : 'N/A'],
          ['DRS', drs ?? 'N/A'],
        ].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: '#555' }}>{label}</span>
            <span style={{ color: label === 'DRS' && val === 'ON' ? '#22c55e' : '#d0d0d0', fontWeight: 600 }}>{val}</span>
          </div>
        ))}
        {ahead && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
            <span style={{ color: '#555' }}>Ahead ({ahead.short})</span>
            <span style={{ color: '#888' }}>N/A</span>
          </div>
        )}
        {behind && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
            <span style={{ color: '#555' }}>Behind ({behind.short})</span>
            <span style={{ color: '#888' }}>N/A</span>
          </div>
        )}
        {/* THR/BRK bars — matches reference */}
        <div style={{ marginTop: 3 }}>
          {[['THR', throttle, '#22c55e'], ['BRK', brake, '#e8002d']].map(([lbl, val, col]) => (
            <div key={lbl} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
              <span style={{ fontSize: 9, color: '#555', width: 22 }}>{lbl}</span>
              <div style={{ flex: 1, height: 5, background: '#1c1c1c', borderRadius: 2 }}>
                <div style={{ width: `${val ?? 0}%`, height: '100%', background: col, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RaceReplay({ season }) {
  const [sessionKey, setSessionKey] = useState('latest')
  const [sessionMeta, setSessionMeta] = useState(null)
  const { getPhoto } = useDriverPhotos(season)

  // Session metadata
  const [sessionDrivers, setSessionDrivers] = useState([])
  const [sessionStints, setSessionStints] = useState({})
  const [raceControl, setRaceControl] = useState([])
  const [positionHistory, setPosHistory] = useState({})
  const [lapHistory, setLapHistory] = useState({})
  const [weatherHistory, setWeatherHistory] = useState([])
  const [totalDuration, setTotalDuration] = useState(5400)
  const [totalLaps, setTotalLaps] = useState(0)
  const [sessionStart, setSessionStart] = useState(null)

  // Location + car data
  const [locationData, setLocationData] = useState({})
  const [carData, setCarData] = useState({})
  const [trackOutline, setTrackOutline] = useState([])
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [locationReady, setLocationReady] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadStage, setLoadStage] = useState('')

  // Playback
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(8)
  const [focusedDrivers, setFocusedDrivers] = useState(new Set())

  // Canvas
  const canvasRef = useRef(null)
  const normRef = useRef(null)
  const rafRef = useRef(null)
  const lastNowRef = useRef(null)
  const currentTimeRef = useRef(0)
  const isPlayingRef = useRef(false)
  const speedRef = useRef(8)
  const mapContainerRef = useRef(null)

  // Sync refs
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { speedRef.current = playbackSpeed }, [playbackSpeed])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      if (e.code === 'Space') { e.preventDefault(); setIsPlaying(p => !p) }
      if (e.code === 'KeyR') { setCurrentTime(0); setIsPlaying(false) }
      if (e.key === '+' || e.code === 'Equal') {
        setPlaybackSpeed(s => {
          const i = SPEEDS.indexOf(s)
          return SPEEDS[Math.min(i + 1, SPEEDS.length - 1)]
        })
      }
      if (e.key === '-' || e.code === 'Minus') {
        setPlaybackSpeed(s => {
          const i = SPEEDS.indexOf(s)
          return SPEEDS[Math.max(i - 1, 0)]
        })
      }
      if (e.code === 'ArrowLeft') setCurrentTime(t => Math.max(0, t - 10))
      if (e.code === 'ArrowRight') setCurrentTime(t => Math.min(totalDuration, t + 10))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [totalDuration])

  // ── Session data fetch ─────────────────────────────────────────────────────
  const fetchSessionMeta = useCallback(async (sk) => {
    setLoadingMeta(true)
    setLocationReady(false)
    setLocationData({})
    setCarData({})
    setTrackOutline([])
    setLoadProgress(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setPosHistory({})
    setLapHistory({})
    setWeatherHistory([])
    setTotalLaps(0)
    setFocusedDrivers(new Set())

    try {
      const key = sk === 'latest' ? 'latest' : sk
      const [driverRes, stintRes, rcRes, posRes, weatherRes, lapRes] = await Promise.allSettled([
        window.api.fetchLive(`${OPENF1}/drivers?session_key=${key}`),
        window.api.fetchLive(`${OPENF1}/stints?session_key=${key}`),
        window.api.fetchLive(`${OPENF1}/race_control?session_key=${key}`),
        window.api.fetchLive(`${OPENF1}/position?session_key=${key}`),
        window.api.fetchLive(`${OPENF1}/weather?session_key=${key}`),
        window.api.fetchLive(`${OPENF1}/laps?session_key=${key}`),
      ])

      // Drivers — retry once if empty (rate limit may have dropped first call)
      let drivers = driverRes.status === 'fulfilled' ? driverRes.value : []
      if (!Array.isArray(drivers) || drivers.length === 0) {
        await new Promise(r => setTimeout(r, 800))
        try { drivers = await window.api.fetchLive(`${OPENF1}/drivers?session_key=${key}`) } catch {}
      }
      if (!Array.isArray(drivers)) drivers = []
      const driverMap = {}
      drivers.forEach(d => { driverMap[d.driver_number] = d })
      setSessionDrivers(Object.values(driverMap).sort((a, b) => a.driver_number - b.driver_number))

      // Stints
      const stints = stintRes.status === 'fulfilled' ? stintRes.value : []
      const stintsByDriver = {}
      stints.forEach(s => {
        if (!stintsByDriver[s.driver_number]) stintsByDriver[s.driver_number] = []
        stintsByDriver[s.driver_number].push(s)
      })
      setSessionStints(stintsByDriver)

      // Race control
      const rc = rcRes.status === 'fulfilled' ? rcRes.value : []
      setRaceControl(rc)

      // Positions over time
      const positions = posRes.status === 'fulfilled' ? posRes.value : []
      if (positions.length > 0) {
        const firstDate = new Date(positions[0].date).getTime()
        const lastDate  = new Date(positions[positions.length - 1].date).getTime()
        setSessionStart(firstDate)
        const dur = (lastDate - firstDate) / 1000
        setTotalDuration(Math.max(dur, 60))

        const posHist = {}
        positions.forEach(p => {
          if (!posHist[p.driver_number]) posHist[p.driver_number] = []
          posHist[p.driver_number].push({ t: (new Date(p.date).getTime() - firstDate) / 1000, position: p.position })
        })
        setPosHistory(posHist)

        // Weather history
        const weather = weatherRes.status === 'fulfilled' ? weatherRes.value : []
        const weatherArr = weather.map(w => ({
          t: (new Date(w.date).getTime() - firstDate) / 1000,
          track_temp: w.track_temperature,
          air_temp: w.air_temperature,
          humidity: w.humidity,
          wind_speed: w.wind_speed,
          wind_direction: w.wind_direction,
          rainfall: w.rainfall,
        })).sort((a, b) => a.t - b.t)
        setWeatherHistory(weatherArr)

        // Lap history + total laps
        const laps = lapRes.status === 'fulfilled' ? lapRes.value : []
        if (laps.length > 0) {
          const maxLap = Math.max(...laps.map(l => l.lap_number || 0))
          setTotalLaps(maxLap)
          // Build lap timing per driver
          const lapHist = {}
          laps.forEach(l => {
            if (!lapHist[l.driver_number]) lapHist[l.driver_number] = []
            if (l.date_start) {
              lapHist[l.driver_number].push({
                t: (new Date(l.date_start).getTime() - firstDate) / 1000,
                lap: l.lap_number,
              })
            }
          })
          Object.keys(lapHist).forEach(k => lapHist[k].sort((a, b) => a.t - b.t))
          setLapHistory(lapHist)
        }
      }
    } catch (e) {
      console.error('fetchSessionMeta error', e)
    } finally {
      setLoadingMeta(false)
    }
  }, [])

  useEffect(() => {
    fetchSessionMeta(sessionKey)
  }, [sessionKey, fetchSessionMeta])

  // ── Location + car data loading ────────────────────────────────────────────
  const loadLocationData = useCallback(async () => {
    if (!sessionStart || loadingLocation) return
    setLoadingLocation(true)
    setLoadProgress(0)
    setLocationReady(false)

    const key = sessionKey === 'latest' ? 'latest' : sessionKey
    const chunkMs = CHUNK_MINUTES * 60 * 1000
    const totalChunks = Math.ceil((totalDuration * 1000) / chunkMs)
    const allLocData = {}
    const allCarData = {}

    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunkStart = new Date(sessionStart + i * chunkMs).toISOString()
        const chunkEnd   = new Date(sessionStart + (i + 1) * chunkMs).toISOString()

        setLoadStage(`Part ${i + 1}/${totalChunks}`)
        const locUrl = `${OPENF1}/location?session_key=${key}&date>=${encodeURIComponent(chunkStart)}&date<=${encodeURIComponent(chunkEnd)}`
        const carUrl = `${OPENF1}/car_data?session_key=${key}&date>=${encodeURIComponent(chunkStart)}&date<=${encodeURIComponent(chunkEnd)}`

        // Fetch location + telemetry in parallel — cuts load time in half
        const [locRaw, carRaw] = await Promise.all([
          window.api.fetchLarge(locUrl).catch(() => []),
          window.api.fetchLarge(carUrl).catch(() => []),
        ])

        if (Array.isArray(locRaw)) {
          locRaw.forEach(p => {
            if (!allLocData[p.driver_number]) allLocData[p.driver_number] = []
            allLocData[p.driver_number].push({ t: (new Date(p.date).getTime() - sessionStart) / 1000, x: p.x, y: p.y })
          })
        }

        if (Array.isArray(carRaw)) {
          carRaw.forEach(p => {
            if (!allCarData[p.driver_number]) allCarData[p.driver_number] = []
            allCarData[p.driver_number].push({
              t: (new Date(p.date).getTime() - sessionStart) / 1000,
              speed: p.speed, n_gear: p.n_gear, drs: p.drs, throttle: p.throttle, brake: p.brake,
            })
          })
        }

        setLoadProgress(Math.round(((i + 1) / totalChunks) * 100))
      }

      // Sort all
      Object.keys(allLocData).forEach(n => allLocData[n].sort((a, b) => a.t - b.t))
      Object.keys(allCarData).forEach(n => allCarData[n].sort((a, b) => a.t - b.t))

      setLocationData(allLocData)
      setCarData(allCarData)

      // If driver metadata failed to load, build minimal drivers from location keys
      setSessionDrivers(prev => {
        if (prev.length > 0) return prev
        const nums = Object.keys(allLocData).map(Number).sort((a, b) => a - b)
        return nums.map(n => ({
          driver_number: n,
          name_acronym: String(n),
          last_name: `#${n}`,
          full_name: `Driver ${n}`,
          team_colour: '888888',
          team_name: '',
        }))
      })

      // Build track outline
      const driverNums = Object.keys(allLocData).sort((a, b) => allLocData[b].length - allLocData[a].length)
      if (driverNums.length > 0) {
        const refDriver = allLocData[driverNums[0]]
        const step = Math.max(1, Math.floor(refDriver.length / 2500))
        const outline = []
        for (let j = 0; j < refDriver.length; j += step) {
          outline.push({ x: refDriver[j].x, y: refDriver[j].y })
        }
        setTrackOutline(outline)
      }

      setLoadStage('')
      setLocationReady(true)
    } catch (e) {
      console.error('loadLocationData error', e)
      setLoadStage('Error loading data')
    } finally {
      setLoadingLocation(false)
    }
  }, [sessionKey, sessionStart, totalDuration, loadingLocation])

  // ── Normalizer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || trackOutline.length === 0) return
    const W = canvasRef.current.width, H = canvasRef.current.height
    normRef.current = buildNormalizer(trackOutline, W, H)
  }, [trackOutline])

  // ── Animation loop ─────────────────────────────────────────────────────────
  const tick = useCallback((now) => {
    if (lastNowRef.current !== null && isPlayingRef.current) {
      const dt = (now - lastNowRef.current) / 1000
      const next = Math.min(currentTimeRef.current + dt * speedRef.current, totalDuration)
      currentTimeRef.current = next
      setCurrentTime(next)
      if (next >= totalDuration) {
        setIsPlaying(false)
        isPlayingRef.current = false
      }
    }
    lastNowRef.current = now
    rafRef.current = requestAnimationFrame(tick)
  }, [totalDuration])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(rafRef.current); lastNowRef.current = null }
  }, [tick])

  // ── Canvas render ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!locationReady || !normRef.current || !canvasRef.current) return
    const driverStates = sessionDrivers.map(d => {
      const loc = locationData[d.driver_number]
      const pos = loc ? posAtTime(loc, currentTime) : null
      return {
        number: d.driver_number,
        short: d.name_acronym || String(d.driver_number),
        color: d.team_colour || '888888',
        pos,
      }
    })
    renderFrame(canvasRef.current, normRef.current, trackOutline, driverStates, focusedDrivers)
  }, [currentTime, locationReady, sessionDrivers, locationData, trackOutline, focusedDrivers])

  // ── Resize canvas ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || !canvasRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect
        canvasRef.current.width  = Math.floor(width)
        canvasRef.current.height = Math.floor(height)
        if (trackOutline.length > 0) {
          normRef.current = buildNormalizer(trackOutline, canvasRef.current.width, canvasRef.current.height)
        }
      }
    })
    ro.observe(mapContainerRef.current)
    return () => ro.disconnect()
  }, [trackOutline])

  // ── Leaderboard ────────────────────────────────────────────────────────────
  const leaderboard = useMemo(() => {
    return sessionDrivers.map(d => {
      const pos = positionHistory[d.driver_number]
        ? positionAtTime(positionHistory[d.driver_number], currentTime) : 99
      const stints = sessionStints[d.driver_number] || []
      // Find active stint by lap
      const lapHist = lapHistory[d.driver_number] || []
      const curLap = lapHist.length ? lapAtTimeFn(lapHist, currentTime) : null
      let compound = null
      if (stints.length > 0) {
        for (const s of stints) {
          if (!curLap || (s.lap_start || 0) <= curLap) compound = s.compound
          else break
        }
      }
      // Detect retirement: if no position in last 10% of session
      const isOut = !pos || pos === 99
      return {
        number: d.driver_number,
        name: d.last_name || d.full_name || `#${d.driver_number}`,
        short: d.name_acronym || String(d.driver_number),
        color: d.team_colour || '888888',
        team: d.team_name || '',
        position: pos,
        compound,
        isOut,
      }
    })
    .filter(d => !d.isOut || d.position)
    .sort((a, b) => (a.position || 99) - (b.position || 99))
  }, [currentTime, sessionDrivers, positionHistory, sessionStints, lapHistory])

  // ── Current weather ────────────────────────────────────────────────────────
  const currentWeather = useMemo(() => weatherAtTime(weatherHistory, currentTime), [weatherHistory, currentTime])

  // ── Active race control ────────────────────────────────────────────────────
  const activeRcMessage = useMemo(() => {
    if (!sessionStart || !raceControl.length) return null
    let last = null
    for (const msg of raceControl) {
      const mt = (new Date(msg.date).getTime() - sessionStart) / 1000
      if (mt <= currentTime) last = msg
      else break
    }
    return last
  }, [currentTime, raceControl, sessionStart])

  // ── Race control events for timeline ──────────────────────────────────────
  const rcEvents = useMemo(() => {
    if (!sessionStart) return []
    return raceControl.map(m => ({
      t: (new Date(m.date).getTime() - sessionStart) / 1000,
      flag: m.flag,
      message: m.message,
    })).filter(e => e.flag)
  }, [raceControl, sessionStart])

  // ── Current lap ───────────────────────────────────────────────────────────
  const currentLap = useMemo(() => {
    // Use the most-data driver's lap history
    const entries = Object.values(lapHistory)
    if (!entries.length) return '--'
    const best = entries.reduce((a, b) => a.length > b.length ? a : b)
    return lapAtTimeFn(best, currentTime)
  }, [lapHistory, currentTime])

  const scrubPct = totalDuration > 0 ? currentTime / totalDuration : 0
  const sessionLabel = sessionMeta
    ? [sessionMeta.meeting_name, sessionMeta.session_name].filter(Boolean).join(' — ') || 'Session'
    : 'Latest Session'

  const handleLeaderboardClick = (driverNum) => {
    setFocusedDrivers(prev => {
      const next = new Set(prev)
      if (next.has(driverNum)) {
        next.delete(driverNum)
      } else {
        if (next.size < MAX_FOCUSED) next.add(driverNum)
        else {
          // Replace oldest (first) focused driver
          const first = next.values().next().value
          next.delete(first)
          next.add(driverNum)
        }
      }
      return next
    })
  }

  // ── Position badge color ───────────────────────────────────────────────────
  function posBadgeColor(pos) {
    if (pos === 1) return '#ffd700'
    if (pos === 2) return '#c0c0c0'
    if (pos === 3) return '#cd7f32'
    return '#3a3a3a'
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#080808', color: '#e0e0e0', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20,
        padding: '6px 14px', borderBottom: '1px solid #1a1a1a', flexShrink: 0,
        background: '#0a0a0a',
      }}>
        {/* Lap + Race Time — reference style */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e0e0', fontVariantNumeric: 'tabular-nums' }}>
            Lap: <span style={{ color: '#fff' }}>{locationReady ? currentLap : '--'}</span>
            {totalLaps > 0 && <span style={{ color: '#555', fontWeight: 400 }}>/{totalLaps}</span>}
          </span>
          <span style={{ fontSize: 12, color: '#888', fontVariantNumeric: 'tabular-nums' }}>
            Race Time: {formatTime(currentTime)}
            <span style={{ color: '#555', fontSize: 11, marginLeft: 5 }}>({playbackSpeed}x)</span>
          </span>
        </div>

        {/* Flag banner */}
        {activeRcMessage && (
          <div style={{
            padding: '3px 10px', borderRadius: 3, fontSize: 10, fontWeight: 700,
            background: FLAG_COLOR[activeRcMessage.flag] || '#e8002d',
            color: activeRcMessage.flag === 'YELLOW' ? '#111' : '#fff',
            letterSpacing: '0.05em',
          }}>
            {activeRcMessage.message}
          </div>
        )}

        {/* Session name */}
        {!activeRcMessage && sessionLabel !== 'Latest Session' && (
          <span style={{ fontSize: 11, color: '#333', fontWeight: 600, letterSpacing: '0.04em' }}>
            {sessionLabel.toUpperCase()}
          </span>
        )}

        {/* Session selector pushed right */}
        <div style={{ marginLeft: 'auto' }}>
          <SessionSelector
            season={season}
            onSelect={(sk, meta) => { setSessionKey(sk); setSessionMeta(meta) }}
          />
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* ── Left panel: weather + driver details ── */}
        <div style={{ width: 190, flexShrink: 0, borderRight: '1px solid #161616', overflowY: 'auto', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>
          <WeatherPanel weather={currentWeather} />
          {[...focusedDrivers].map(num => {
            const driver = leaderboard.find(d => d.number === num) || sessionDrivers.find(d => d.driver_number === num)
            if (!driver) return null
            const driverObj = {
              number: driver.number ?? driver.driver_number,
              short: driver.short ?? driver.name_acronym ?? String(driver.driver_number),
              color: driver.color ?? driver.team_colour ?? '888888',
              position: driver.position,
            }
            return (
              <DriverPanel
                key={num}
                driver={driverObj}
                carData={carData[num]}
                locationData={locationData[num]}
                currentTime={currentTime}
                leaderboard={leaderboard}
                focusedSet={focusedDrivers}
              />
            )
          })}
          {focusedDrivers.size === 0 && (
            <div style={{ padding: '12px', fontSize: 10, color: '#2e2e2e', textAlign: 'center', lineHeight: 1.6 }}>
              {locationReady ? 'Click a driver\nto view telemetry' : 'Load data to\nbegin replay'}
            </div>
          )}
        </div>

        {/* ── Track map ── */}
        <div ref={mapContainerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#080808' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

          {/* Loading meta overlay */}
          {loadingMeta && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)' }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Loading session…</div>
            </div>
          )}

          {/* Load data prompt */}
          {!loadingMeta && !locationReady && !loadingLocation && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>{sessionLabel}</div>
              {totalDuration > 0 && (
                <div style={{ color: '#555', fontSize: 12 }}>
                  Session ~{Math.round(totalDuration / 60)} min · {sessionDrivers.length} drivers
                </div>
              )}
              <button
                onClick={loadLocationData}
                disabled={!sessionStart}
                style={{
                  padding: '11px 32px', background: '#e8002d', color: '#fff',
                  border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 14,
                  cursor: sessionStart ? 'pointer' : 'not-allowed',
                  opacity: sessionStart ? 1 : 0.35,
                  letterSpacing: '0.02em',
                }}
              >
                Load Replay Data
              </button>
              {!sessionStart && (
                <div style={{ color: '#444', fontSize: 11 }}>Waiting for session metadata…</div>
              )}
            </div>
          )}

          {/* Loading progress */}
          {loadingLocation && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, background: 'rgba(0,0,0,0.85)' }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>Loading GPS + Telemetry</div>
              <div style={{ width: 260, height: 4, background: '#1e1e1e', borderRadius: 2 }}>
                <div style={{ width: `${loadProgress}%`, height: '100%', background: '#e8002d', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
              <div style={{ color: '#555', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{loadProgress}% — {loadStage}</div>
            </div>
          )}
        </div>

        {/* ── Leaderboard ── */}
        <div style={{ borderLeft: '1px solid #161616', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0a0a0a', width: 180 }}>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Leaderboard</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {leaderboard.length === 0 && !loadingMeta && (
              <div style={{ padding: '14px 10px', fontSize: 11, color: '#333', textAlign: 'center' }}>
                {loadingLocation ? 'Loading…' : 'Load session first'}
              </div>
            )}
            {leaderboard.map((d, idx) => {
              const [r, g, b] = hexToRgb(d.color)
              const isFocused = focusedDrivers.has(d.number)
              const pos = d.position && d.position !== 99 ? d.position : null
              const isOut = d.isOut && pos === null
              const photoUrl = getPhoto(d.short, d.number)
              return (
                <div
                  key={d.number}
                  onClick={() => handleLeaderboardClick(d.number)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 8px',
                    borderBottom: '1px solid #111',
                    cursor: 'pointer',
                    background: isFocused ? `rgba(${r},${g},${b},0.1)` : 'transparent',
                    borderLeft: isFocused ? `2px solid rgb(${r},${g},${b})` : '2px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isFocused) e.currentTarget.style.background = '#141414' }}
                  onMouseLeave={e => { if (!isFocused) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Position */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, width: 18, flexShrink: 0,
                    color: pos === 1 ? '#ffd700' : pos === 2 ? '#c0c0c0' : pos === 3 ? '#cd7f32' : '#555',
                  }}>
                    {pos ? `${pos}.` : '--'}
                  </span>

                  {/* Driver photo or colored circle fallback */}
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={d.short}
                      style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#1a1a1a' }}
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: `rgba(${r},${g},${b},0.2)`,
                      border: `1px solid rgba(${r},${g},${b},0.4)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 7, fontWeight: 700, color: `rgb(${r},${g},${b})`,
                    }}>
                      {d.short.slice(0, 2)}
                    </div>
                  )}

                  {/* Driver code colored by team */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, flex: 1,
                    color: `rgb(${r},${g},${b})`,
                    letterSpacing: '0.04em',
                  }}>
                    {d.short}
                  </span>

                  {/* Tire dot or OUT */}
                  {isOut ? (
                    <span style={{ fontSize: 9, color: '#e8002d', fontWeight: 700 }}>OUT</span>
                  ) : d.compound ? (
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: COMPOUND_COLOR[d.compound] || '#333',
                      flexShrink: 0,
                    }} />
                  ) : (
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#1e1e1e', flexShrink: 0 }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom controls ── */}
      <div style={{ borderTop: '1px solid #1a1a1a', flexShrink: 0, padding: '6px 14px 8px', background: '#0a0a0a' }}>
        {/* Timeline scrubber */}
        <div
          style={{ position: 'relative', height: 16, cursor: 'pointer', marginBottom: 6 }}
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
            setCurrentTime(pct * totalDuration)
          }}
        >
          <div style={{ position: 'absolute', top: 5, left: 0, right: 0, height: 5, background: '#1e1e1e', borderRadius: 3 }} />
          <div style={{ position: 'absolute', top: 5, left: 0, width: `${scrubPct * 100}%`, height: 5, background: '#e8002d', borderRadius: 3 }} />
          {rcEvents.map((ev, i) => (
            <div key={i} title={ev.message} style={{
              position: 'absolute', top: 3,
              left: `${(ev.t / totalDuration) * 100}%`,
              width: 2, height: 9, borderRadius: 1,
              background: FLAG_COLOR[ev.flag] || '#f97316',
              transform: 'translateX(-50%)',
            }} />
          ))}
          <div style={{
            position: 'absolute', top: 2, left: `${scrubPct * 100}%`,
            transform: 'translateX(-50%)',
            width: 11, height: 11, borderRadius: '50%',
            background: '#e8002d', border: '2px solid #fff',
          }} />
        </div>

        {/* Controls row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Time */}
          <span style={{ fontSize: 11, color: '#555', fontVariantNumeric: 'tabular-nums', minWidth: 42 }}>{formatTime(currentTime)}</span>

          {/* Transport buttons */}
          <button onClick={() => setCurrentTime(t => Math.max(0, t - 30))}
            style={{ padding: '4px 8px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 4, color: '#888', cursor: 'pointer', fontSize: 13 }}>
            ⏮
          </button>
          <button onClick={() => setIsPlaying(p => !p)}
            style={{ padding: '4px 16px', background: isPlaying ? '#2a2a2a' : '#e8002d', border: 'none', borderRadius: 5, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', minWidth: 52 }}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button onClick={() => setCurrentTime(t => Math.min(totalDuration, t + 30))}
            style={{ padding: '4px 8px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 4, color: '#888', cursor: 'pointer', fontSize: 13 }}>
            ⏭
          </button>
          <button onClick={() => { setCurrentTime(0); setIsPlaying(false) }}
            style={{ padding: '4px 8px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 4, color: '#555', cursor: 'pointer', fontSize: 11 }}>
            ↺
          </button>

          {/* Speed */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
            <button onClick={() => setPlaybackSpeed(s => { const i = SPEEDS.indexOf(s); return SPEEDS[Math.max(i - 1, 0)] })}
              style={{ padding: '3px 8px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 4, color: '#666', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>
              −
            </button>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#e0e0e0', minWidth: 36, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {playbackSpeed}x
            </span>
            <button onClick={() => setPlaybackSpeed(s => { const i = SPEEDS.indexOf(s); return SPEEDS[Math.min(i + 1, SPEEDS.length - 1)] })}
              style={{ padding: '3px 8px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 4, color: '#666', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>
              +
            </button>
          </div>

          {/* End time */}
          <span style={{ fontSize: 11, color: '#333', fontVariantNumeric: 'tabular-nums', minWidth: 42, textAlign: 'right' }}>{formatTime(totalDuration)}</span>
        </div>

        {/* Hints */}
        <div style={{ fontSize: 9, color: '#2a2a2a', marginTop: 4, display: 'flex', gap: 12 }}>
          <span>SPACE pause</span><span>+/- speed</span><span>← → ±10s</span><span>R restart</span><span>click driver to focus</span>
        </div>
      </div>
    </div>
  )
}
