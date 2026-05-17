import { useState, useEffect } from 'react'
import { OPENF1 } from '../constants/endpoints'

const photoCacheByYear = {}

export function useDriverPhotos(season = 2026) {
  const [photos, setPhotos] = useState(photoCacheByYear[season] || {})
  const [loading, setLoading] = useState(!photoCacheByYear[season])

  useEffect(() => {
    if (photoCacheByYear[season]) { setPhotos(photoCacheByYear[season]); setLoading(false); return }

    window.api.fetch(
      `openf1-drivers-photos-${season}`,
      `${OPENF1}/drivers?year=${season}`,
      30 * 60 * 1000
    ).then(res => {
      const drivers = res.data || []
      const map = {}
      // Deduplicate: keep the entry with a headshot_url if multiple exist for same driver
      drivers.forEach(d => {
        const key = d.name_acronym
        const numKey = String(d.driver_number)
        const url = d.headshot_url || null
        if (key && (url || !map[key])) map[key] = url
        if (numKey && (url || !map[numKey])) map[numKey] = url
      })
      photoCacheByYear[season] = map
      setPhotos(map)
      setLoading(false)
    }).catch(() => {
      photoCacheByYear[season] = {}
      setPhotos({})
      setLoading(false)
    })
  }, [season])

  const getPhoto = (acronym, number) =>
    photos[acronym] || photos[String(number)] || null

  return { photos, loading, getPhoto }
}
