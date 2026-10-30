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
  },
  feeds: {
    list: () => ipcRenderer.invoke(Channels.feedsList),
    add: (name, url) => ipcRenderer.invoke(Channels.feedsAdd, name, url),
    remove: (id) => ipcRenderer.invoke(Channels.feedsRemove, id),
    refresh: () => ipcRenderer.invoke(Channels.feedsRefresh),
    events: (date) => ipcRenderer.invoke(Channels.feedsEvents, date)
  },
  updates: {
    list: (force) => ipcRenderer.invoke(Channels.updatesList, force)
  },
  modules: {
    list: (courseIds, force) => ipcRenderer.invoke(Channels.modulesList, courseIds, force)
  }
}

contextBridge.exposeInMainWorld('canvas', bridge)
