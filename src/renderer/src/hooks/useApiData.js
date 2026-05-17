import { useState, useEffect, useCallback, useRef } from 'react'

export function useApiData(key, url, ttlMs, deps = []) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [stale, setStale]     = useState(false)
  const mountedRef = useRef(true)

  const fetch = useCallback(async () => {
    if (!url) return
    try {
      const result = await window.api.fetch(key, url, ttlMs)
      if (!mountedRef.current) return
      setData(result.data)
      setStale(result.stale || false)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err.message || 'Failed to load data')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [key, url, ttlMs, ...deps])

  useEffect(() => {
    mountedRef.current = true
    setData(null)
    setError(null)
    setLoading(true)
    fetch()
    return () => { mountedRef.current = false }
  }, [fetch])

  return { data, loading, error, stale, refresh: fetch }
}

export function useLiveData(url, intervalMs = 10000, enabled = true) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const mountedRef = useRef(true)

  const fetch = useCallback(async () => {
    if (!url || !enabled) return
    try {
      const result = await window.api.fetchLive(url)
      if (!mountedRef.current) return
      setData(result)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err.message || 'Failed to load live data')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [url, enabled])

  useEffect(() => {
    mountedRef.current = true
    if (!enabled) { setLoading(false); return }
    setLoading(true)
    fetch()
    const id = setInterval(fetch, intervalMs)
    return () => {
      mountedRef.current = false
      clearInterval(id)
    }
  }, [fetch, intervalMs, enabled])

  return { data, loading, error, refresh: fetch }
}
