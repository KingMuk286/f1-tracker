import { useMemo } from 'react'
import { useApiData } from './useApiData'
import { OPENF1, TTL } from '../constants/endpoints'

export function useSessionList(year) {
  const { data, loading } = useApiData(
    `openf1-sessions-${year}`,
    `${OPENF1}/sessions?year=${year}`,
    TTL.RESULTS,   // 1 hour cache
    [year]
  )

  const now = Date.now()

  // All past sessions, newest first
  const sessions = useMemo(() => {
    if (!Array.isArray(data)) return []
    return [...data]
      .filter(s => new Date(s.date_end).getTime() < now + 60000)  // include sessions ending within 1 min
      .sort((a, b) => new Date(b.date_start) - new Date(a.date_start))
  }, [data])

  // Grouped by meeting, newest meeting first, sessions within each meeting chronologically
  const meetings = useMemo(() => {
    const map = {}
    sessions.forEach(s => {
      if (!map[s.meeting_key]) {
        map[s.meeting_key] = {
          meetingKey: s.meeting_key,
          name: s.meeting_name || s.circuit_short_name || s.location || s.country_name || `Round ${s.meeting_key}`,
          location: s.location,
          country: s.country_name,
          dateStart: s.date_start,
          sessions: [],
        }
      }
      map[s.meeting_key].sessions.push(s)
    })
    return Object.values(map)
      .sort((a, b) => new Date(b.dateStart) - new Date(a.dateStart))
      .map(m => ({
        ...m,
        sessions: m.sessions.sort((a, b) => new Date(a.date_start) - new Date(b.date_start))
      }))
  }, [sessions])

  return { sessions, meetings, loading }
}
