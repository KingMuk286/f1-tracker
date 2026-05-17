import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  fetch: (key, url, ttlMs) =>
    ipcRenderer.invoke('api:fetch', { key, url, ttlMs }),

  fetchLive: (url) =>
    ipcRenderer.invoke('api:fetchLive', { url }),

  checkLive: (year) =>
    ipcRenderer.invoke('api:checkLive', { year }),

  onLiveStatus: (callback) => {
    const handler = (_e, status) => callback(status)
    ipcRenderer.on('live:status', handler)
    return () => ipcRenderer.removeListener('live:status', handler)
  },

  fetchLarge: (url) =>
    ipcRenderer.invoke('api:fetchLarge', { url }),

  notify: (title, body) =>
    ipcRenderer.invoke('app:notify', { title, body }),

  exportCsv: (filename, content) =>
    ipcRenderer.invoke('app:exportCsv', { filename, content }),
})
