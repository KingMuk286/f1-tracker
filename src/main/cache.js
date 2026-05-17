import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

let store = {}
let cacheFile = ''

function init() {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  cacheFile = join(dir, 'f1-cache.json')
  try {
    if (existsSync(cacheFile)) {
      store = JSON.parse(readFileSync(cacheFile, 'utf8'))
    }
  } catch {
    store = {}
  }
}

function persist() {
  try {
    writeFileSync(cacheFile, JSON.stringify(store), 'utf8')
  } catch {}
}

function get(key) {
  return store[key] || null
}

function set(key, data, ttlMs) {
  store[key] = { data, timestamp: Date.now(), ttlMs }
  persist()
}

function isStale(key, ttlMs) {
  const entry = store[key]
  if (!entry) return true
  const age = Date.now() - entry.timestamp
  return age > (ttlMs || entry.ttlMs)
}

function clear() {
  store = {}
  persist()
}

export const cache = { init, get, set, isStale, clear }
