export default function StatCard({ label, value, sub, accent, style }) {
  return (
    <div
      className="stat-card"
      style={accent ? { borderLeft: `3px solid ${accent}`, ...style } : style}
    >
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}
