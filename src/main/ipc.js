import { ipcMain, Notification, dialog } from 'electron'
import { writeFileSync } from 'fs'
import axios from 'axios'
import { cache } from './cache.js'

// ── Rate limiter: max 3 requests/second to OpenF1 ────────────────────────────
const OPENF1_HOST = 'api.openf1.org'
const MIN_INTERVAL_MS = 360   // ~2.8 req/s — stay safely under the 3/s limit
let lastOpenF1Request = 0
const pendingRequests = new Map()  // url → Promise (deduplication)

async function rateLimitedGet(url, axiosConfig = {}) {
  const isOpenF1 = url.includes(OPENF1_HOST)

  // Deduplication: if same URL is already in-flight, reuse the promise
  if (isOpenF1 && pendingRequests.has(url)) {
    return pendingRequests.get(url)
  }

  const doRequest = async () => {
    if (isOpenF1) {
      const now = Date.now()
      const wait = MIN_INTERVAL_MS - (now - lastOpenF1Request)
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      lastOpenF1Request = Date.now()
    }

    try {
      const res = await ax.get(url, axiosConfig)
      return res
    } catch (err) {
      // Retry once on 429 after the retry-after header (default 1s)
      if (err?.response?.status === 429 && isOpenF1) {
        const retryAfter = parseInt(err.response.headers['retry-after'] || '1') * 1000
        await new Promise(r => setTimeout(r, retryAfter + 200))
        lastOpenF1Request = Date.now()
        return ax.get(url, axiosConfig)
      }
      throw err
    } finally {
      if (isOpenF1) pendingRequests.delete(url)
    }
  }

  const promise = doRequest()
  if (isOpenF1) pendingRequests.set(url, promise)
  return promise
}

const ax = axios.create({ timeout: 10000 })

cache.init()

export function registerIpcHandlers(win) {
  // Generic cached fetch
  ipcMain.handle('api:fetch', async (_e, { key, url, ttlMs }) => {
    const entry = cache.get(key)
    if (entry && !cache.isStale(key, ttlMs)) {
      return { data: entry.data, fromCache: true, stale: false }
    }
    try {
      const res = await rateLimitedGet(url)
      cache.set(key, res.data, ttlMs)
      return { data: res.data, fromCache: false, stale: false }
    } catch (err) {
      if (entry) return { data: entry.data, fromCache: true, stale: true }
      throw new Error(err.message)
    }
  })

  // Live fetch — no cache
  ipcMain.handle('api:fetchLive', async (_e, { url }) => {
    const res = await rateLimitedGet(url)
    return res.data
  })

  // Large fetch — for location/telemetry data (2-min timeout, no cache)
  ipcMain.handle('api:fetchLarge', async (_e, { url }) => {
    const res = await rateLimitedGet(url, { timeout: 120000 })
    return res.data
  })

  // Desktop notification
  ipcMain.handle('app:notify', async (_e, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body, silent: false }).show()
    }
  })

  // Export CSV via save dialog
  ipcMain.handle('app:exportCsv', async (_e, { filename, content }) => {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: filename,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    })
    if (filePath) {
      writeFileSync(filePath, content, 'utf-8')
      return { success: true, filePath }
    }
    return { success: false }
  })

  // Check if a session is currently live
  ipcMain.handle('api:checkLive', async (_e, { year }) => {
    try {
      const url = `https://api.openf1.org/v1/sessions?year=${year}`
      const res = await rateLimitedGet(url)
      const sessions = res.data || []
      const now = Date.now()
      const active = sessions.find(s => {
        const start = new Date(s.date_start).getTime()
        const end = new Date(s.date_end).getTime()
        return start <= now && now <= end
      })
      const upcoming = sessions
        .filter(s => new Date(s.date_start).getTime() > now)
        .sort((a, b) => new Date(a.date_start) - new Date(b.date_start))[0]
      return { isLive: !!active, session: active || null, next: upcoming || null }
    } catch {
      return { isLive: false, session: null, next: null }
    }
  })
}

let liveInterval = null

export function startLivePoller(win) {
  let currentYear = new Date().getFullYear()

  async function poll() {
    try {
      const url = `https://api.openf1.org/v1/sessions?year=${currentYear}`
      const res = await rateLimitedGet(url)
      const sessions = res.data || []
      const now = Date.now()
      const active = sessions.find(s => {
        const start = new Date(s.date_start).getTime()
        const end = new Date(s.date_end).getTime()
        return start <= now && now <= end
      })
      const upcoming = sessions
        .filter(s => new Date(s.date_start).getTime() > now)
        .sort((a, b) => new Date(a.date_start) - new Date(b.date_start))[0]

      if (!win.isDestroyed()) {
        win.webContents.send('live:status', {
          isLive: !!active,
          session: active || null,
          next: upcoming || null
        })
      }
    } catch {}
  }

  poll()
  liveInterval = setInterval(poll, 60000)
}
