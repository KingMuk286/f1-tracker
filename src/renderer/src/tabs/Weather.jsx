import { useState, useEffect, useCallback, useRef } from 'react'
import { useLiveSession } from '../hooks/useLiveSession'
import { OPENF1 } from '../constants/endpoints'
import SessionSelector from '../components/SessionSelector'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'
import StatCard from '../components/StatCard'

const WIND_DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
function windDir(deg) {
  if (deg == null) return '—'
  return WIND_DIRS[Math.round(deg / 22.5) % 16]
}

function WeatherIcon({ rainfall }) {
  if (rainfall > 0) return <span style={{ fontSize: 28 }}>🌧</span>
  return <span style={{ fontSize: 28 }}>☀️</span>
}

function conditionLabel(rainfall, humidity) {
  if (rainfall > 0) return { label: 'WET', color: '#3b82f6' }
  if (humidity > 80) return { label: 'HUMID', color: '#8b5cf6' }
  return { label: 'DRY', color: '#22c55e' }
}

export default function Weather({ season }) {
  const { isLive } = useLiveSession()
  const [sessionKey, setSessionKey] = useState('latest')
  const [sessionMeta, setSessionMeta] = useState(null)
  const [history, setHistory] = useState([])
  const [latest, setLatest] = useState(null)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef(null)

  const fetchWeather = useCallback(async (sk) => {
    setLoading(true)
    try {
      const key = sk === 'latest' ? 'latest' : sk
      const url = `${OPENF1}/weather?session_key=${key}`
      const data = await window.api.fetchLive(url)
      if (!Array.isArray(data) || data.length === 0) {
        setLatest(null)
        setHistory([])
        return
      }
      const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date))
      setLatest(sorted[sorted.length - 1])
      setHistory(sorted.map((w, i) => ({
        t: i + 1,
        label: new Date(w.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        air: w.air_temperature,
        track: w.track_temperature,
        humidity: w.humidity,
        wind: w.wind_speed,
      })))
    } catch {
      setLatest(null)
      setHistory([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Refetch when session selection changes
  useEffect(() => {
    clearInterval(intervalRef.current)
    fetchWeather(sessionKey)
    // Only poll for latest session when live
    if (sessionKey === 'latest' && isLive) {
      intervalRef.current = setInterval(() => fetchWeather('latest'), 30000)
    }
    return () => clearInterval(intervalRef.current)
  }, [sessionKey, isLive, fetchWeather])

  function handleSessionSelect(sk, meta) {
    setSessionKey(sk)
    setSessionMeta(meta)
    setLatest(null)
    setHistory([])
  }

  const cond = latest ? conditionLabel(latest.rainfall, latest.humidity) : null
  const isViewingLatest = sessionKey === 'latest'
  const sessionLabel = sessionMeta
    ? `${sessionMeta.meeting_name} — ${sessionMeta.session_name}`
    : 'Latest Session'

  return (
    <div>
      <div className="section-header" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="flex-center gap-10">
          {isLive && isViewingLatest && <span className="live-dot" />}
          <span className="section-title">Track Weather — {season}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <SessionSelector season={season} onSelect={handleSessionSelect} />
          {cond && (
            <span style={{ fontSize: 11, fontWeight: 700, color: cond.color, background: cond.color + '22', padding: '3px 9px', borderRadius: 5 }}>
              {cond.label}
            </span>
          )}
          {isLive && isViewingLatest && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updates every 30s</span>
          )}
          <button
            onClick={() => fetchWeather(sessionKey)}
            style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Session label */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        Showing: <strong style={{ color: 'var(--text)' }}>{sessionLabel}</strong>
      </div>

      {loading ? (
        <div className="loading">Loading weather data…</div>
      ) : !latest ? (
        <div className="card" style={{ maxWidth: 400 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            No weather data available for this session.
          </div>
        </div>
      ) : (
        <>
          {/* Current / final conditions */}
          <div className="card mb-16" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <WeatherIcon rainfall={latest.rainfall} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isViewingLatest ? 'Current Conditions' : 'Final Conditions'}
                {latest.date && (
                  <span style={{ marginLeft: 8, fontWeight: 400 }}>
                    · {new Date(latest.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                {[
                  { label: 'Air Temp',   value: `${latest.air_temperature?.toFixed(1)}°C`,  accent: '#f97316' },
                  { label: 'Track Temp', value: `${latest.track_temperature?.toFixed(1)}°C`, accent: '#ef4444' },
                  { label: 'Humidity',   value: `${latest.humidity}%`,                       accent: '#3b82f6' },
                  { label: 'Wind Speed', value: `${latest.wind_speed?.toFixed(1)} m/s`,      accent: '#8b5cf6' },
                  { label: 'Wind Dir',   value: `${windDir(latest.wind_direction)} (${latest.wind_direction}°)`, accent: '#8b5cf6' },
                  { label: 'Rainfall',   value: latest.rainfall > 0 ? `${latest.rainfall} mm` : 'None', accent: '#3b82f6' },
                ].map(item => (
                  <StatCard key={item.label} label={item.label} value={item.value} accent={item.accent} />
                ))}
              </div>
            </div>
          </div>

          {/* Temperature chart */}
          {history.length > 1 && (
            <div className="card mb-16">
              <div className="card-title">Temperature Through Session</div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} unit="°" />
                    <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="air"   name="Air (°C)"   stroke="#f97316" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                    <Line type="monotone" dataKey="track" name="Track (°C)" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 3 }} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Wind + Humidity */}
          {history.length > 1 && (
            <div className="grid-2" style={{ gap: 16 }}>
              <div className="card">
                <div className="card-title">Wind Speed (m/s)</div>
                <div style={{ height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                      <Line type="monotone" dataKey="wind" name="Wind" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card">
                <div className="card-title">Humidity (%)</div>
                <div style={{ height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={28} unit="%" domain={[0, 100]} />
                      <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--tooltip-bg)' }} />
                      <Line type="monotone" dataKey="humidity" name="Humidity" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
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
