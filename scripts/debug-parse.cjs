const { app, BrowserWindow } = require("electron");
const path = require("path"), fs = require("fs");
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show:false, webPreferences:{ preload: path.join(__dirname,"preload.cjs"), contextIsolation:true }});
  await win.loadFile(path.join(__dirname,"../dist/index.html"));
  const b64 = fs.readFileSync(process.env.SONG || "/tmp/s1real/song.zip").toString("base64");
  try {
    const r = await win.webContents.executeJavaScript(`(async()=>{
      const bin=atob("${b64}"); const b=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);
      const s=await window.__s1.readSong("real.song",b.buffer);
      const parts=s.tracks.flatMap(t=>t.parts.map(p=>({t:t.name,cl:p.clipId,path:p.mediaPath,off:p.offset,len:p.length,notes:p.noteCount})));
      return {title:s.songTitle,tempo:s.tempo,warnings:s.warnings.slice(0,6),pool:s.mediaPool.size,parts:parts.slice(0,6),tot:parts.reduce((n,p)=>n+p.notes,0),ntracks:s.tracks.length};
    })()`);
    console.log("RESULT "+JSON.stringify(r));
  } catch(e) { console.log("ERR "+e.message); }
  app.quit();
});
