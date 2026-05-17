export default function Logo({ size = 32, showText = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, userSelect: 'none' }}>
      {/* Icon mark */}
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Background pill */}
        <rect width="32" height="32" rx="8" fill="#e8002d"/>

        {/* Checkered flag motif — top left 2×2 grid */}
        <rect x="6" y="6" width="5" height="5" rx="1" fill="white" fillOpacity="0.95"/>
        <rect x="11" y="6" width="5" height="5" rx="1" fill="white" fillOpacity="0.3"/>
        <rect x="6" y="11" width="5" height="5" rx="1" fill="white" fillOpacity="0.3"/>
        <rect x="11" y="11" width="5" height="5" rx="1" fill="white" fillOpacity="0.95"/>

        {/* Speed stripe */}
        <rect x="18" y="6" width="8" height="2.5" rx="1.25" fill="white" fillOpacity="0.9"/>
        <rect x="20" y="10.5" width="6" height="2.5" rx="1.25" fill="white" fillOpacity="0.65"/>
        <rect x="18" y="15" width="8" height="2.5" rx="1.25" fill="white" fillOpacity="0.9"/>

        {/* Bottom line / track */}
        <rect x="6" y="22" width="20" height="2" rx="1" fill="white" fillOpacity="0.4"/>
        <rect x="6" y="26" width="12" height="2" rx="1" fill="white" fillOpacity="0.6"/>
      </svg>

      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span style={{
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: '-0.03em',
            color: 'var(--text)',
          }}>
            F1 <span style={{ color: '#e8002d' }}>Tracker</span>
          </span>
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            marginTop: 1,
          }}>
            Live · Stats · Compare
          </span>
        </div>
      )}
    </div>
  )
}
