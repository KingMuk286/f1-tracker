import { useState, useEffect } from 'react'

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('f1-theme') || 'dark' } catch { return 'dark' }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('f1-theme', theme) } catch {}
  }, [theme])

  const toggle = () => setTheme(t => t === 'light' ? 'dark' : 'light')
  return { theme, toggle }
}
