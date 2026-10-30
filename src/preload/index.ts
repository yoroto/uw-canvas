import { contextBridge, ipcRenderer } from 'electron'
import { Channels, type CanvasBridge } from '../shared/types'

const bridge: CanvasBridge = {
  auth: {
    status: () => ipcRenderer.invoke(Channels.authStatus),
    login: () => ipcRenderer.invoke(Channels.authLogin),
    logout: () => ipcRenderer.invoke(Channels.authLogout)
  },
  courses: {
    list: () => ipcRenderer.invoke(Channels.coursesList)
  },
  assignments: {
    list: () => ipcRenderer.invoke(Channels.assignmentsList)
  },
  seen: {
    mark: (keys) => ipcRenderer.invoke(Channels.seenMark, keys)
  }
}

contextBridge.exposeInMainWorld('canvas', bridge)
