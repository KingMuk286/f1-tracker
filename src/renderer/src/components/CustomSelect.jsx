import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

export default function CustomSelect({ value, onChange, options, placeholder = 'Select...', style = {}, buttonStyle = {} }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const btnRef = useRef(null)
  const dropRef = useRef(null)
  const selected = options.find(o => String(o.value) === String(value))

  const updateRect = useCallback(() => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect())
  }, [])

  const handleOpen = () => {
    updateRect()
    setOpen(o => !o)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (dropRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on scroll OUTSIDE the dropdown (not inside it — that would prevent scrolling options)
  useEffect(() => {
    if (!open) return
    const handleScroll = (e) => {
      if (dropRef.current?.contains(e.target)) return  // scrolling inside the list — keep open
      setOpen(false)
    }
    const handleResize = () => setOpen(false)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [open])

  // Reposition if open and window scrolls (for cases we didn't close)
  useEffect(() => {
    if (open) updateRect()
  }, [open])

  const dropdown = open && rect && createPortal(
    <div
      ref={dropRef}
      style={{
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: rect.width,
        maxWidth: Math.max(rect.width, 300),
        maxHeight: 300,
        overflowY: 'auto',
        zIndex: 99999,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}
    >
      {options.length === 0 ? (
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>No options</div>
      ) : options.map(opt => {
        const isSelected = String(opt.value) === String(value)
        return (
          <div
            key={String(opt.value)}
            onMouseDown={e => { e.preventDefault(); onChange(opt.value); setOpen(false) }}
            style={{
              padding: '7px 12px',
              fontSize: 12,
              cursor: 'pointer',
              color: isSelected ? 'var(--accent)' : 'var(--text)',
              fontWeight: isSelected ? 600 : 400,
              background: isSelected ? 'var(--accent-light)' : 'transparent',
              userSelect: 'none',
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--card)' }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
          >
            {opt.label}
          </div>
        )
      })}
    </div>,
    document.body
  )

  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 26px 5px 10px', fontSize: 12, fontWeight: 500,
          background: 'var(--card)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 5, cursor: 'pointer', color: 'var(--text)',
          whiteSpace: 'nowrap', minWidth: 100, width: '100%', textAlign: 'left',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
          ...buttonStyle,
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selected?.label ?? placeholder}
        </span>
      </button>
      {dropdown}
    </div>
  )
}
