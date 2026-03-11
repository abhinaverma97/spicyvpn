import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

import { ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {
  saveSublink: (url: string) => ipcRenderer.invoke('save-sublink', url),
  connect: () => ipcRenderer.invoke('connect'),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  onStatusChange: (callback: (status: string) => void) => {
    ipcRenderer.removeAllListeners('vpn-status')
    ipcRenderer.on('vpn-status', (_event, value) => callback(value))
  },
  onCloseRequested: (callback: () => void) => {
    ipcRenderer.removeAllListeners('close-requested')
    ipcRenderer.on('close-requested', () => callback())
  },
  hideApp: () => ipcRenderer.send('hide-app'),
  quitApp: () => ipcRenderer.send('quit-app'),
  onVpnLog: (callback: (log: string) => void) => {
    // Keep adding listeners so multiple log lines can come through, 
    // but the react component should probably handle cleanup if we remount
    ipcRenderer.on('vpn-log', (_event, value) => callback(value))
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
