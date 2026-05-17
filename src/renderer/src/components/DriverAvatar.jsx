import { useState } from 'react'

export default function DriverAvatar({ photoUrl, name, number, teamColor, size = 72 }) {
  const [failed, setFailed] = useState(false)

  const initials = name
    ? name.split(' ').map(w => w[0]).slice(-2).join('')
    : `#${number}`

  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        onError={() => setFailed(true)}
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          objectPosition: 'top center',
          borderRadius: size * 0.12,
          background: '#f0f0f0',
          display: 'block',
          flexShrink: 0,
        }}
      />
    )
  }

  // Fallback: styled circle
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: size * 0.12,
      background: teamColor ? `${teamColor}18` : '#f0f0f0',
      border: `2px solid ${teamColor || '#e8e8e8'}`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{
        fontSize: size * 0.22,
        fontWeight: 700,
        color: teamColor || '#888',
        lineHeight: 1,
      }}>{number}</span>
      <span style={{
        fontSize: size * 0.14,
        fontWeight: 600,
        color: teamColor || '#888',
        marginTop: 2,
        opacity: 0.8,
      }}>{initials}</span>
    </div>
  )
}
