import { useState, useEffect, useMemo } from 'react'
import { useSessionList } from '../hooks/useSessionList'
import CustomSelect from './CustomSelect'

/**
 * Two-dropdown race/session picker.
 *
 * Props:
 *   season          – year to fetch sessions for
 *   onSelect(key, meta) – called with session_key (number) or 'latest', plus session object or null
 *   filterTypes     – optional array of session_type strings to include, e.g. ['Race','Sprint']
 *   defaultToLatest – show "Latest" as the first / default option (default true)
 */
export default function SessionSelector({ season, onSelect, filterTypes, defaultToLatest = true }) {
  const { meetings, loading } = useSessionList(season)

  // meetings filtered by session type
  const filteredMeetings = useMemo(() => {
    if (!filterTypes) return meetings
    return meetings
      .map(m => ({ ...m, sessions: m.sessions.filter(s => filterTypes.includes(s.session_type)) }))
      .filter(m => m.sessions.length > 0)
  }, [meetings, filterTypes])

  const [meetingKey, setMeetingKey] = useState('latest')
  const [sessionKey, setSessionKey] = useState('latest')

  const currentMeeting = filteredMeetings.find(m => m.meetingKey === meetingKey)

  // Auto-pick the most-recent session when switching meetings
  function pickMeeting(value) {
    if (value === 'latest') {
      setMeetingKey('latest')
      setSessionKey('latest')
      onSelect('latest', null)
      return
    }
    const mk = parseInt(value)
    const m = filteredMeetings.find(x => x.meetingKey === mk)
    setMeetingKey(mk)
    if (m?.sessions.length > 0) {
      // prefer Race, fallback to last session
      const race = m.sessions.find(s => s.session_type === 'Race') || m.sessions[m.sessions.length - 1]
      setSessionKey(race.session_key)
      onSelect(race.session_key, race)
    }
  }

  function pickSession(value) {
    const sk = parseInt(value)
    setSessionKey(sk)
    const sess = currentMeeting?.sessions.find(s => s.session_key === sk)
    onSelect(sk, sess || null)
  }

  // When season changes, reset to latest
  useEffect(() => {
    setMeetingKey('latest')
    setSessionKey('latest')
    onSelect('latest', null)
  }, [season])

  // Build options for meeting dropdown
  const meetingOptions = useMemo(() => {
    const opts = []
    if (defaultToLatest) {
      const latestLabel = filteredMeetings[0]
        ? `Latest: ${filteredMeetings[0].name || filteredMeetings[0].location || 'Session'}`
        : 'Latest Session'
      opts.push({ value: 'latest', label: latestLabel })
    }
    filteredMeetings.forEach(m => opts.push({ value: m.meetingKey, label: m.name || m.location || `Round ${m.meetingKey}` }))
    return opts
  }, [filteredMeetings, defaultToLatest])

  // Build options for session dropdown
  const sessionOptions = useMemo(() => {
    if (!currentMeeting) return []
    return currentMeeting.sessions.map(s => ({ value: s.session_key, label: s.session_name || s.session_type || `Session ${s.session_key}` }))
  }, [currentMeeting])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {loading ? (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading sessions...</span>
      ) : (
        <>
          {/* Race/meeting selector */}
          <CustomSelect
            value={meetingKey}
            onChange={pickMeeting}
            options={meetingOptions}
            placeholder="Select meeting..."
          />

          {/* Hint when no sessions have completed for this season yet */}
          {!loading && filteredMeetings.length === 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              No completed sessions for this season yet
            </span>
          )}

          {/* Session-type selector (only when a specific meeting is chosen and has >1 session) */}
          {meetingKey !== 'latest' && currentMeeting && currentMeeting.sessions.length > 1 && (
            <CustomSelect
              value={sessionKey}
              onChange={pickSession}
              options={sessionOptions}
              placeholder="Select session..."
            />
          )}

          {/* Info label when showing a specific session */}
          {meetingKey !== 'latest' && currentMeeting && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {currentMeeting.location}, {currentMeeting.country}
            </span>
          )}
        </>
      )}
    </div>
  )
}
