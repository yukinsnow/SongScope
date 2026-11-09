const { app, BrowserWindow } = require("electron");
const path = require("path"), fs = require("fs");
app.disableHardwareAcceleration();
app.on("window-all-closed",()=>{});
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
  fs.writeFileSync(path.join(__dirname, "../shots/reader-overview.png"), (await desktop.capturePage()).toPNG());
  await desktop.webContents.executeJavaScript("(async()=>{const b=[...document.querySelectorAll('.toolbar button')].find(x=>x.textContent.includes('编排'));b&&b.click();await new Promise(r=>setTimeout(r,300));return 1})()");
  await new Promise(r => setTimeout(r, 500));
  fs.writeFileSync(path.join(__dirname, "../shots/real-midi.png"), (await desktop.capturePage()).toPNG());
  await desktop.webContents.executeJavaScript("[...document.querySelectorAll('.trackHeader')].find(e=>e.textContent.includes('Piano'))?.scrollIntoView({block:'start'});document.querySelector('.toolbar>button').click()");
  await new Promise(r=>setTimeout(r,300));
  fs.writeFileSync(path.join(__dirname, "../shots/reader-arrange.png"), (await desktop.capturePage()).toPNG());
  console.log("DESKTOP " + await desktop.webContents.executeJavaScript("JSON.stringify({clips:document.querySelectorAll('.clip').length, channels:document.querySelectorAll('.channel').length, insertNames:[...document.querySelectorAll('.pluginGroup')].filter(e=>e.textContent.includes('INSERTS')).map(e=>e.textContent).filter(s=>!s.includes('未识别')),importUI:document.body.innerText.includes('导入')})"));
  console.log("SYNC " + await desktop.webContents.executeJavaScript("(async()=>{const names=[...document.querySelectorAll('.lane .trackHeader')];const piano=names.find(n=>n.textContent.includes('Piano'));piano.click();await new Promise(r=>setTimeout(r,700));const strip=document.querySelector('.channelScroll');const node=document.querySelector('.channel.selected');const a=strip.getBoundingClientRect(),b=node.getBoundingClientRect();const first={name:node.querySelector('strong').textContent,left:strip.scrollLeft,visible:b.left>=a.left&&b.right<=a.right};strip.scrollLeft=0;piano.click();await new Promise(r=>setTimeout(r,700));first.repeatWorks=strip.scrollLeft>0;document.querySelector('.toolbar>button').click();await new Promise(r=>setTimeout(r,100));document.querySelector('.toolbar>button').click();await new Promise(r=>setTimeout(r,700));first.reopenWorks=document.querySelector('.channelScroll').scrollLeft>0;return JSON.stringify(first);})()"));
  console.log("EXPORT " + await desktop.webContents.executeJavaScript("(async()=>{const s=await window.__s1.readSong('test.song',new Uint8Array(await (await fetch('file:///tmp/s1real/song.zip')).arrayBuffer()).buffer);const refs=s.tracks.flatMap(track=>track.parts.map(part=>({track,part})));const bytes=window.__s1.exportPartsToMidi(refs,{arrange:true,tempo:s.tempo});const back=window.__s1.midiNotesFromBytes(bytes.buffer);return JSON.stringify({bytes:bytes.length,notes:back.notes.length,tracks:back.trackCount,artwork:!!s.artwork,piano:s.tracks.find(t=>t.name==='Piano')?.instrument});})()"));
  fs.writeFileSync(path.join(__dirname, "../shots/songscope-linked.png"), (await desktop.capturePage()).toPNG());
  desktop.destroy();

  const mobile = new BrowserWindow({ width: 390, height: 844, show: false, backgroundColor: "#14161a", webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true } });
  await load(mobile);
  await new Promise(r => setTimeout(r, 800));
  fs.writeFileSync(path.join(__dirname, "../shots/reader-mobile-overview.png"), (await mobile.capturePage()).toPNG());
  await mobile.webContents.executeJavaScript("(async()=>{const b=[...document.querySelectorAll('.toolbar button')].find(x=>x.textContent.includes('编排'));b&&b.click();await new Promise(r=>setTimeout(r,300));return 1})()");
  await new Promise(r => setTimeout(r, 500));
  fs.writeFileSync(path.join(__dirname, "../shots/reader-mobile-arrange.png"), (await mobile.capturePage()).toPNG());
  console.log("MOBILE " + await mobile.webContents.executeJavaScript("JSON.stringify({viewport:innerWidth,page:document.documentElement.scrollWidth,clips:document.querySelectorAll('.clip').length})"));
  console.log("SHOTS OK");
  app.quit();
});
