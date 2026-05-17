import { createContext, useContext, useState, useCallback } from 'react'

const WatchlistCtx = createContext(null)

export function WatchlistProvider({ children }) {
  const [pinned, setPinned] = useState(() => {
    try { return JSON.parse(localStorage.getItem('f1-watchlist') || '[]') } catch { return [] }
  })

  const toggle = useCallback(id => {
    setPinned(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      localStorage.setItem('f1-watchlist', JSON.stringify(next))
      return next
    })
  }, [])

  const isPinned = useCallback(id => pinned.includes(id), [pinned])

  return (
    <WatchlistCtx.Provider value={{ pinned, toggle, isPinned }}>
      {children}
    </WatchlistCtx.Provider>
  )
}

export function useWatchlist() {
  return useContext(WatchlistCtx)
}
