const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

function createWindow() {
  const win = new BrowserWindow({
    title: "SongScope — Studio One 工程查看器",
    icon: path.join(__dirname, "../dist/icon-512.png"),
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: "#14161a",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

ipcMain.handle("s1:open-song", async () => {
  const r = await dialog.showOpenDialog({
    title: "打开 Studio One 工程",
    filters: [{ name: "Studio One Song", extensions: ["song"] }],
    properties: ["openFile"],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  return { name: path.basename(p), data: fs.readFileSync(p) };
});

ipcMain.handle("s1:save-file", async (_e, { defaultName, data }) => {
  const r = await dialog.showSaveDialog({ defaultPath: defaultName });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(data));
  return r.filePath;
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
