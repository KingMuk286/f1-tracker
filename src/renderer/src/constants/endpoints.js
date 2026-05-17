export const JOLPICA = 'https://api.jolpi.ca/ergast/f1'
export const OPENF1  = 'https://api.openf1.org/v1'

export const TTL = {
  LIVE:         0,
  STANDINGS:    5  * 60 * 1000,   // 5 min
  RESULTS:      60 * 60 * 1000,   // 1 hour
  CALENDAR:     24 * 60 * 60 * 1000, // 24 hours
  DRIVERS:      10 * 60 * 1000,   // 10 min
  LAP_TIMES:    30 * 60 * 1000,   // 30 min
}

export function jolpicaUrl(season, path) {
  return `${JOLPICA}/${season}/${path}`
}

export function openf1Url(path) {
  return `${OPENF1}/${path}`
}
