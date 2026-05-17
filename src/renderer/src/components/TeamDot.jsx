export default function TeamDot({ color, size = 8, style }) {
  return (
    <span
      className="team-dot"
      style={{ width: size, height: size, background: color || '#888', ...style }}
    />
  )
}
