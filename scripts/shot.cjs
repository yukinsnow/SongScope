const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 840, show: false, backgroundColor: "#14161a" });
  await win.loadFile(path.join(__dirname, "../dist/index.html"));
  const b64 = fs.readFileSync(path.join(__dirname, "../fixtures/smoke.song")).toString("base64");
  await win.webContents.executeJavaScript(`(async () => {
    const bin = atob("${b64}");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], "smoke.song", { type: "application/octet-stream" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const target = document.querySelector(".landing") || document.body;
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    for (let i = 0; i < 40 && !document.querySelector(".app"); i++) await new Promise(r => setTimeout(r, 150));
    return document.body.innerText.slice(0, 200);
  })()`).then(t => console.log("TEXT:", t.replace(/\n/g, " | ").slice(0, 300)));
  await new Promise(r => setTimeout(r, 800));
  fs.mkdirSync(path.join(__dirname, "../shots"), { recursive: true });
  let img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, "../shots/overview.png"), img.toPNG());
  // switch tabs by clicking
  await win.webContents.executeJavaScript(`(async()=>{const b=[...document.querySelectorAll(".tabs button")].find(x=>x.textContent.includes("插件")); b&&b.click(); await new Promise(r=>setTimeout(r,300)); return true})()`);
  await new Promise(r => setTimeout(r, 400));
  img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, "../shots/plugins.png"), img.toPNG());
  await win.webContents.executeJavaScript(`(async()=>{const b=[...document.querySelectorAll(".tabs button")].find(x=>x.textContent.includes("MIDI")); b&&b.click(); await new Promise(r=>setTimeout(r,300)); return true})()`);
  await new Promise(r => setTimeout(r, 400));
  img = await win.capturePage();
  fs.writeFileSync(path.join(__dirname, "../shots/midi.png"), img.toPNG());
  console.log("shots written");
  app.quit();
});
