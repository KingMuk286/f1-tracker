import { useEffect, useRef } from 'react'

export function useRefreshInterval(callback, intervalMs, enabled = true) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled || !intervalMs) return
    const id = setInterval(() => callbackRef.current(), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, enabled])
}
