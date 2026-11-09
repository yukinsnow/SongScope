const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("s1", {
  openSong: () => ipcRenderer.invoke("s1:open-song"),
  saveFile: (payload) => ipcRenderer.invoke("s1:save-file", payload),
  isDesktop: true,
});
