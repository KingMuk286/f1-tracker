import { createContext, useContext, useState, useCallback } from 'react'

const NotificationCtx = createContext(null)

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])

  const addNotification = useCallback((title, body, type = 'info') => {
    const n = { id: Date.now() + Math.random(), title, body, type, time: new Date() }
    setNotifications(prev => [n, ...prev].slice(0, 100))
    if (window.api?.notify) {
      window.api.notify(title, body).catch(() => {})
    }
  }, [])

  const clearAll = useCallback(() => setNotifications([]), [])
  const dismiss = useCallback(id => setNotifications(prev => prev.filter(n => n.id !== id)), [])

  return (
    <NotificationCtx.Provider value={{ notifications, addNotification, clearAll, dismiss }}>
      {children}
    </NotificationCtx.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationCtx)
}
