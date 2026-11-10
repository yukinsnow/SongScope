const {app,BrowserWindow}=require('electron');const fs=require('fs'),path=require('path'),assert=require('assert/strict');
app.on('window-all-closed',()=>{});
app.disableHardwareAcceleration();app.commandLine.appendSwitch('no-proxy-server');
const song=process.env.SONG;if(!song)throw Error('Set SONG to a local comparison project');
app.whenReady().then(async()=>{try{
 for(const locale of ['zh-CN','en-US']){
  const win=new BrowserWindow({width:390,height:844,show:true,webPreferences:{partition:'kontakt-'+locale+'-'+Date.now()}});
  await win.loadURL('about:blank');win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Page.enable');
  await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(navigator,'languages',{get:()=>[${JSON.stringify(locale)}]});Object.defineProperty(navigator,'language',{get:()=>${JSON.stringify(locale)}});`});
  if(process.env.WEB_URL)await win.loadURL(process.env.WEB_URL);else await win.loadFile(path.resolve('dist/index.html'));
  let remote=[];win.webContents.session.webRequest.onBeforeRequest((d,cb)=>{if(/^https?:/.test(d.url))remote.push(d.url);cb({});});
  const b64=fs.readFileSync(song).toString('base64');
  const model=await win.webContents.executeJavaScript(`(async()=>{window.__kontaktBytes=Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0));const song=await window.__s1.readSong('comparison.song',window.__kontaktBytes.buffer);return {parts:song.tracks.reduce((n,t)=>n+t.parts.length,0),plugins:song.tracks.flatMap(t=>t.plugins.filter(p=>p.format==='instrument'&&/Kontakt/.test(p.name)).map(p=>({track:t.name,names:p.presetNames,encrypted:p.presetEncrypted,empty:p.presetEmpty,source:p.presetSource,note:p.presetNote})))}})()`);
  assert.equal(model.parts,34);assert.equal(model.plugins.length,6);assert.equal(model.plugins.filter(p=>p.encrypted).length,3);assert.equal(model.plugins.filter(p=>p.empty).length,1);
  assert.deepEqual(model.plugins.flatMap(p=>p.names),['YellowRiver GuZheng2.0','Cello']);
  const label=locale==='zh-CN'?'加密音源无法读取':'Encrypted instrument cannot be read';
  for(const p of model.plugins.filter(p=>p.encrypted))assert.equal(p.note,label);
  await win.webContents.executeJavaScript(`(()=>{const dt=new DataTransfer();dt.items.add(new File([window.__kontaktBytes],'comparison.song'));document.querySelector('.landing').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));})()`);
  let loaded=false;for(let n=0;n<160;n++){await new Promise(r=>setTimeout(r,50));loaded=await win.webContents.executeJavaScript("!!document.querySelector('.toolbar')");if(loaded)break;}assert(loaded,'project renders');
  await win.webContents.executeJavaScript("(()=>{const b=[...document.querySelectorAll('.toolbar button')].find(x=>x.textContent.includes('F3'));if(b.getAttribute('aria-expanded')!=='true')b.click();})()");
  await new Promise(r=>setTimeout(r,100));
  const ui=await win.webContents.executeJavaScript(`({badges:[...document.querySelectorAll('.presetBadge')].map(e=>e.textContent),page:document.documentElement.scrollWidth,viewport:innerWidth})`);
  assert.equal(ui.badges.filter(t=>t.includes(label)).length,3);assert.equal(ui.badges.filter(t=>t.includes(locale==='zh-CN'?'未加载音源':'No instrument loaded')).length,1);assert(ui.badges.some(t=>t.includes('YellowRiver GuZheng2.0')));assert(ui.badges.some(t=>t.includes('Cello')));assert(!ui.badges.some(t=>t.includes('New (default)')));assert(ui.page<=ui.viewport+1);
  // Local builds must never contact a network while opening project data.
  if(!process.env.WEB_URL)assert.deepEqual(remote,[]);
  fs.mkdirSync('logs/kontakt-comparison',{recursive:true});fs.writeFileSync(`logs/kontakt-comparison/ui-${locale}.png`,(await win.capturePage()).toPNG());
  console.log(JSON.stringify({locale,model,ui,networkRequests:remote.length}));win.destroy();
 }
 app.quit();
}catch(e){console.error(e.stack||e);app.exit(1)}});
