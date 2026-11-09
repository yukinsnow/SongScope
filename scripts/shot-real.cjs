const { app, BrowserWindow } = require("electron");
const path = require("path"), fs = require("fs");
app.disableHardwareAcceleration();
const songPath = process.env.SONG || "/tmp/s1real/song.zip";
async function load(win) {
  await win.loadFile(path.join(__dirname, "../dist/index.html"));
  const b64 = fs.readFileSync(songPath).toString("base64");
  const js = [
    "const bin=atob('" + b64 + "');const b=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);",
    "const f=new File([b],'夏夜绮想.song',{type:'application/zip'});const dt=new DataTransfer();dt.items.add(f);",
    "const t=document.querySelector('.landing')||document.body;",
    "t.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));",
    "t.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));",
    "for(let i=0;i<80&&!document.querySelector('.app');i++)await new Promise(r=>setTimeout(r,100));",
    "return document.body.innerText.slice(0,120);"
  ].join("");
  const txt = await win.webContents.executeJavaScript("(async()=>{" + js + "})()");
  console.log("LOADED: " + txt.replace(/\n/g, " | ").slice(0, 160));
}
app.whenReady().then(async () => {
  const desktop = new BrowserWindow({ width: 1280, height: 840, show: false, backgroundColor: "#14161a" });
  await load(desktop);
  await new Promise(r => setTimeout(r, 900));
  fs.mkdirSync(path.join(__dirname, "../shots"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "../shots/real-overview.png"), (await desktop.capturePage()).toPNG());
  await desktop.webContents.executeJavaScript("(async()=>{const b=[...document.querySelectorAll('.tabs button')].find(x=>x.textContent.includes('MIDI'));b&&b.click();await new Promise(r=>setTimeout(r,300));return 1})()");
  await new Promise(r => setTimeout(r, 500));
  fs.writeFileSync(path.join(__dirname, "../shots/real-midi.png"), (await desktop.capturePage()).toPNG());
  desktop.destroy();

  const mobile = new BrowserWindow({ width: 390, height: 844, show: false, backgroundColor: "#14161a", webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true } });
  await load(mobile);
  await new Promise(r => setTimeout(r, 800));
  fs.writeFileSync(path.join(__dirname, "../shots/mobile-overview.png"), (await mobile.capturePage()).toPNG());
  await mobile.webContents.executeJavaScript("(async()=>{const b=[...document.querySelectorAll('.tabs button')].find(x=>x.textContent.includes('MIDI'));b&&b.click();await new Promise(r=>setTimeout(r,300));return 1})()");
  await new Promise(r => setTimeout(r, 500));
  fs.writeFileSync(path.join(__dirname, "../shots/mobile-midi.png"), (await mobile.capturePage()).toPNG());
  console.log("SHOTS OK");
  app.quit();
});
