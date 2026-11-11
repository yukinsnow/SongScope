const {app,BrowserWindow}=require('electron');const fs=require('fs'),path=require('path'),assert=require('assert/strict'),esbuild=require('esbuild');app.disableHardwareAcceleration();app.commandLine.appendSwitch('no-proxy-server');
app.whenReady().then(async()=>{try{
 for(const locale of ['zh-CN','en-US']){
 const win=new BrowserWindow({show:true,webPreferences:{partition:'locale-'+locale+'-'+Date.now()}});
 await win.loadURL('about:blank');console.log('Window ready',locale);win.webContents.debugger.attach('1.3');
 await win.webContents.debugger.sendCommand('Page.enable');
 await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(navigator,'languages',{get:()=>[${JSON.stringify(locale)}]});Object.defineProperty(navigator,'language',{get:()=>${JSON.stringify(locale)}});`});
 console.log('Loading',locale);await win.loadFile(path.resolve('dist/index.html'));
 console.log('Loaded',locale);let home=await win.webContents.executeJavaScript('({lang:document.documentElement.lang,text:document.body.textContent})');assert.equal(home.lang,locale==='zh-CN'?'zh-CN':'en');assert.match(home.text,locale==='zh-CN'?/不会以任何形式上传/:/never uploaded in any form/);
 let remote=[];win.webContents.session.webRequest.onBeforeRequest((details,callback)=>{if(/^https?:/.test(details.url))remote.push(details.url);callback({});});
 const bundle=esbuild.buildSync({stdin:{contents:"export {readSong} from './src/lib/song';export {default as JSZip} from 'jszip';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'AudioTest',platform:'browser'}).outputFiles[0].text;await win.webContents.executeJavaScript(bundle);
 const result=await win.webContents.executeJavaScript(`(async()=>{const z=new AudioTest.JSZip();z.file('Song/song.xml','<Song xmlns:x="x"><List x:id="Tracks"><MediaTrack name="Voice" mediaType="Audio" trackID="a"><List x:id="Events"><AudioEvent clipID="one" name="Vocal event"/><AudioEvent clipID="two" name="Missing"/></List></MediaTrack></List></Song>');z.file('Song/mediapool.xml','<MediaPool xmlns:x="x"><AudioClip mediaID="one"><Url x:id="path" url="file:///C:/Private/Vocal%20Take.wav"/></AudioClip></MediaPool>');const bytes=await z.generateAsync({type:'uint8array'}),s=await AudioTest.readSong('audio.song',bytes.buffer);const dt=new DataTransfer();dt.items.add(new File([bytes],'audio.song'));document.querySelector('.landing').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));for(let i=0;i<80&&!document.querySelector('.app');i++)await new Promise(r=>setTimeout(r,30));const channels=[...document.querySelectorAll('.toolbar button')].find(b=>b.textContent.includes('F3'));if(channels?.getAttribute('aria-expanded')!=='true')channels?.click();for(let i=0;i<80&&!document.querySelector('.channel');i++)await new Promise(r=>setTimeout(r,30));return {files:s.tracks[0].audioFiles,parts:s.tracks[0].parts.length,text:document.body.textContent,audioExport:!!document.querySelector('.channelExport'),exportDisabled:[...document.querySelectorAll('.exportBar button')].every(b=>b.disabled)};})()`);
 assert.equal(result.parts,0);assert.equal(result.files[0].name,'Vocal Take.wav');assert.equal(result.files[0].path,'file:///C:/Private/Vocal%20Take.wav');assert.equal(result.files[1].path,null);assert.match(result.text,/Vocal Take.wav/);assert.equal(result.audioExport,false);assert.deepEqual(remote,[]);console.log(locale,'UI, privacy, audio references and zero network requests: PASS');
 if(fs.existsSync('/tmp/s1real/song.zip')){
 const b64=fs.readFileSync('/tmp/s1real/song.zip').toString('base64');
 const actual=await win.webContents.executeJavaScript(`(async()=>{const bytes=Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0));const s=await AudioTest.readSong('private.song',bytes.buffer);return {tracks:s.tracks.filter(t=>t.audioFiles.length).length,sources:s.tracks.reduce((n,t)=>n+t.audioFiles.length,0),resolved:s.tracks.flatMap(t=>t.audioFiles).filter(f=>f.path).length,midi:s.tracks.reduce((n,t)=>n+t.parts.length,0)};})()`);
 assert(actual.tracks>0);assert(actual.resolved>0);assert.equal(actual.midi,70);console.log('Real project:',JSON.stringify(actual));
 }
win.hide();
 }
 app.quit();
 }catch(e){console.error(e);app.exit(1);}});
