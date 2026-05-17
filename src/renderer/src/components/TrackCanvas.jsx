import { useRef, useEffect } from 'react'

function hexToRgb(hex = '888888') {
  const h = hex.replace('#', '').padStart(6, '0')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function buildNorm(points, W, H, pad = 20) {
  if (!points.length || W === 0 || H === 0) return null
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const rx = maxX - minX || 1, ry = maxY - minY || 1
  const scale = Math.min((W - 2 * pad) / rx, (H - 2 * pad) / ry)
  const offX = pad + ((W - 2 * pad) - rx * scale) / 2
  const offY = pad + ((H - 2 * pad) - ry * scale) / 2
  return (x, y) => ({
    px: offX + (x - minX) * scale,
    py: H - (offY + (y - minY) * scale),
  })
}

// speed color: red (slow) → yellow (mid) → green (fast)
function speedColor(t) {
  if (t < 0.5) {
    const v = t * 2
    return `rgb(220,${Math.round(40 + 160 * v)},40)`
  }
  const v = (t - 0.5) * 2
  return `rgb(${Math.round(220 - 180 * v)},200,40)`
}

// trackPoints  [{x,y}] — required for outline
// drivers      [{x,y,color,short}] — live dots
// speedTrace   [{x,y,speed}] — colored lap trace
// height       px
export default function TrackCanvas({ trackPoints = [], drivers = [], speedTrace = null, height = 180 }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const renderRef = useRef(null)

  renderRef.current = () => {
    const canvas = canvasRef.current
    if (!canvas || trackPoints.length < 10) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    if (W === 0 || H === 0) return

    const norm = buildNorm(trackPoints, W, H)
    if (!norm) return

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#080808'
    ctx.fillRect(0, 0, W, H)

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const path = () => {
      ctx.beginPath()
      let first = true
      for (const p of trackPoints) {
        const { px, py } = norm(p.x, p.y)
        if (first) { ctx.moveTo(px, py); first = false } else ctx.lineTo(px, py)
      }
    }

    path(); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 13; ctx.stroke()
    path(); ctx.strokeStyle = '#2e2e2e'; ctx.lineWidth = 8; ctx.stroke()

    if (speedTrace && speedTrace.length > 1) {
      const speeds = speedTrace.map(p => p.speed).filter(s => s != null)
      const minS = Math.min(...speeds), maxS = Math.max(...speeds)
      const range = maxS - minS || 1
      for (let i = 0; i < speedTrace.length - 1; i++) {
        const a = speedTrace[i], b = speedTrace[i + 1]
        if (a.x == null || b.x == null) continue
        const { px: ax, py: ay } = norm(a.x, a.y)
        const { px: bx, py: by } = norm(b.x, b.y)
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.strokeStyle = speedColor(((a.speed ?? minS) - minS) / range)
        ctx.lineWidth = 3
        ctx.stroke()
      }
    } else {
      path(); ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3; ctx.stroke()
    }

    // Driver dots
    for (const d of drivers) {
      if (d.x == null || d.y == null) continue
      const { px, py } = norm(d.x, d.y)
      const [r, g, b] = hexToRgb(d.color)
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, Math.PI * 2)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.font = 'bold 7px system-ui'
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText(d.short, px + 5, py)
    }
  }

  useEffect(() => { renderRef.current?.() }, [trackPoints, drivers, speedTrace])

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        canvasRef.current.width  = Math.floor(e.contentRect.width)
        canvasRef.current.height = Math.floor(e.contentRect.height)
        renderRef.current?.()
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} style={{ width: '100%', height, background: '#080808', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
