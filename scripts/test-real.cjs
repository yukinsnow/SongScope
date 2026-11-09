const { app, BrowserWindow } = require("electron");
const path = require("path"), fs = require("fs");
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show:false, webPreferences:{ preload: path.join(__dirname,"preload.cjs"), contextIsolation:true }});
  await win.loadFile(path.join(__dirname,"../dist/index.html"));
  const b64 = fs.readFileSync(process.env.SONG || "/tmp/s1real/song.zip").toString("base64");
  const page = [
    "(async()=>{",
    "const bin=atob('" + b64 + "');const b=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);",
    "const s=await window.__s1.readSong('real.song',b.buffer);",
    "const parts=s.tracks.flatMap(t=>t.parts.map(p=>({track:t,part:p})));",
    "const withNotes=parts.filter(r=>r.part.noteCount>0);",
    "const midi=window.__s1.exportPartsToMidi(withNotes.slice(0,3),{merge:false,tempo:s.tempo});",
    "const buf=midi.buffer.slice(midi.byteOffset,midi.byteOffset+midi.byteLength);",
    "const back=window.__s1.midiNotesFromBytes(buf);",
    "const inst=s.tracks.find(t=>t.type==='instrument'&&t.parts.length)||s.tracks.find(t=>t.type==='instrument');",
    "let imp=null,re=null,err=null;",
    "try{imp=await window.__s1.importMidiInto(s,buf,{targetTrackId:inst.id,startTick:0,partName:'ImportedTest'});",
    "re=await window.__s1.readSong(imp.fileName,imp.bytes.buffer.slice(imp.bytes.byteOffset,imp.bytes.byteOffset+imp.bytes.byteLength));}catch(e){err=e.message;}",
    "const rt=re&&re.tracks.find(t=>t.id===inst.id);",
    "const newParts=re?re.tracks.flatMap(t=>t.parts).filter(p=>p.name==='ImportedTest'):[];",
    "return {tempo:s.tempo,ts:s.timeSignature,tracks:s.tracks.length,inst:s.tracks.filter(t=>t.type==='instrument').length,audio:s.tracks.filter(t=>t.type==='audio').length,parts:parts.length,withNotes:withNotes.length,notes:parts.reduce((n,r)=>n+r.part.noteCount,0),plugins:s.plugins.length,warnings:s.warnings.slice(0,3),midiBytes:midi.length,midiNotes:back.notes.length,midiTracks:back.trackCount,err:err,impNotes:imp&&imp.noteCount,impWarn:imp&&imp.warnings,reParts:rt&&rt.parts.length,reNotes:rt&&rt.parts.reduce((n,p)=>n+p.noteCount,0),newPart:newParts[0]&&{path:newParts[0].mediaPath,notes:newParts[0].noteCount,len:newParts[0].length},importedEntries:re?re.zipEntries.filter(e=>e.indexOf('Imported')>=0):[]};",
    "})()"
  ].join("");
  try {
    const r = await win.webContents.executeJavaScript(page);
    console.log("RESULT " + JSON.stringify(r, null, 1));
  } catch(e) { console.log("ERR " + (e.stack || e.message)); }
  app.quit();
});
