import { useState, useRef, useEffect } from 'react'
import { useNotifications } from '../context/NotificationContext'

function timeAgo(date) {
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

const TYPE_COLOR = { info: 'var(--accent)', success: '#22c55e', warning: '#f59e0b', alert: '#ef4444' }

export default function NotificationBell() {
  const { notifications, clearAll, dismiss } = useNotifications()
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)
  const btnRef = useRef(null)

  const unread = notifications.length

  useEffect(() => {
    function onClickOutside(e) {
      if (!panelRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'relative', padding: '6px 9px', fontSize: 16,
          background: open ? 'var(--card)' : 'transparent',
          border: `1px solid ${open ? 'var(--border)' : 'transparent'}`,
          borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)',
          transition: 'all 0.15s',
        }}
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            width: 16, height: 16, borderRadius: '50%',
            background: '#ef4444', color: '#fff',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div ref={panelRef} className="notif-panel">
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none' }}
              >
                Clear all
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id} className="notif-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: TYPE_COLOR[n.type] || 'var(--accent)', flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, fontSize: 12 }}>{n.title}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4, paddingLeft: 12 }}>{n.body}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(n.time)}</span>
                      <button
                        onClick={() => dismiss(n.id)}
                        style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none' }}
                      >✕</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
