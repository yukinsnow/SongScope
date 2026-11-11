// Build a display-only snapshot from an owner-supplied .song. Never copy its ZIP,
// XML, plugin states, media pool or local paths into the distributed application.
// Usage: xvfb-run -a npx electron --no-sandbox scripts/make-demo.cjs /path/to/song
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), esbuild = require('esbuild');
app.disableHardwareAcceleration();
const root = path.resolve(__dirname, '..');
app.whenReady().then(async () => {
  try {
    const source = process.argv.at(-1);
    if (!source || source.endsWith('.cjs')) throw Error('Pass an owner-supplied .song file');
    const win = new BrowserWindow({ show: false });
    await win.loadURL('about:blank');
    const bundle = esbuild.buildSync({ stdin: { contents: "export {readSong} from './src/lib/song';", resolveDir: root }, bundle: true, write: false, format: 'iife', globalName: 'DemoBuilder', platform: 'browser' }).outputFiles[0].text;
    await win.webContents.executeJavaScript(bundle);
    const b64 = fs.readFileSync(source).toString('base64');
    const result = await win.webContents.executeJavaScript(`(async()=>{
      const bytes=Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0));
      const s=await DemoBuilder.readSong('夏夜绮想演示用.song',bytes.buffer);
      const plugin=p=>({name:p.name,vendor:p.vendor,category:p.category,subCategory:p.subCategory,native:p.native,format:p.format,preset:p.preset,presetNames:p.presetNames,presetEncrypted:p.presetEncrypted,presetEmpty:p.presetEmpty,savedBeforeTransform:p.savedBeforeTransform});
      return {artwork:s.artwork,snapshot:{version:1,fileName:'夏夜绮想演示用.song',songTitle:'夏夜绮想演示用',tempo:s.tempo,timeSignature:s.timeSignature,
        tempoMap:s.tempoMap.map(({beat,bpm,curveType})=>({beat,bpm,curveType})),meterMap:s.meterMap,
        metadata:Object.fromEntries(['Media:Artist','Document:Creator','Media:Genre','Media:KeySignature'].filter(k=>s.metadata[k]).map(k=>[k,s.metadata[k]])),projectVersion:s.projectVersion,
        plugins:s.plugins.map(plugin),tracks:s.tracks.map(t=>({id:t.id,name:t.name,type:t.type,mediaType:t.mediaType,color:t.color,channelId:t.channelId,parentFolderId:t.parentFolderId,instrument:t.instrument,depth:t.depth,
          plugins:t.plugins.map(plugin),inserts:t.inserts.map(plugin),sends:t.sends.map(plugin),
          parts:t.parts.map(p=>({name:p.name,start:p.start,length:p.length,offset:p.offset,timeFormat:p.timeFormat,notes:p.notes,noteCount:p.noteCount})),
          audioEvents:t.audioEvents.map(({name,eventName,sampleName,start,length,offset,timeFormat,positionTimeFormat})=>({name,eventName,sampleName,start,length,offset,timeFormat,positionTimeFormat})),
          audioFiles:t.audioFiles.map(({eventName,name})=>({eventName,name}))
        }))}};
    })()`);
    const dir = path.join(root, 'src/data');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'demo-song.json'), JSON.stringify(result.snapshot));
    if (!result.artwork?.startsWith('data:image/png;base64,')) throw Error('Expected PNG cover');
    fs.writeFileSync(path.join(dir, 'demo-cover.png'), Buffer.from(result.artwork.split(',')[1], 'base64'));
    console.log(JSON.stringify({tracks:result.snapshot.tracks.length,parts:result.snapshot.tracks.reduce((n,t)=>n+t.parts.length,0),audioEvents:result.snapshot.tracks.reduce((n,t)=>n+t.audioEvents.length,0),jsonBytes:fs.statSync(path.join(dir,'demo-song.json')).size}));
    app.quit();
  } catch (e) { console.error(e); app.exit(1); }
});
