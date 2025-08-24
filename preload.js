// preload.js
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("poser", {
  listAdapters: () => ipcRenderer.invoke("adapters:list"),
  setMac: (name, mac) => ipcRenderer.invoke("adapter:setMac", { name, mac }),
  restore: (name) => ipcRenderer.invoke("adapter:restore", { name }),
  getMac: (name) => ipcRenderer.invoke("adapter:getMac", { name })
});
contextBridge.exposeInMainWorld("nebula", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximizeToggle: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close")
});
contextBridge.exposeInMainWorld("profiles", {
  list:   () => ipcRenderer.invoke("profiles:list"),
  create: (name) => ipcRenderer.invoke("profiles:create", { name }),
  update: (payload) => ipcRenderer.invoke("profiles:update", payload),
  remove: (id) => ipcRenderer.invoke("profiles:delete", { id })
});
