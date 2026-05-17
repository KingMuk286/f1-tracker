import { useState, useEffect } from 'react'

export function useLiveSession() {
  const [isLive, setIsLive]       = useState(false)
  const [session, setSession]     = useState(null)
  const [nextSession, setNextSession] = useState(null)

  useEffect(() => {
    // subscribe to main-process live poller events
    const unsub = window.api.onLiveStatus(({ isLive, session, next }) => {
      setIsLive(isLive)
      setSession(session)
      setNextSession(next)
    })

    // also check immediately
    const year = new Date().getFullYear()
    window.api.checkLive(year).then(({ isLive, session, next }) => {
      setIsLive(isLive)
      setSession(session)
      setNextSession(next)
    }).catch(() => {})

    return unsub
  }, [])

  return { isLive, session, nextSession }
}
