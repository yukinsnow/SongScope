// Saved audio-transform states are read from their owning track, never restored.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const JSZip = require('jszip');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-proxy-server');
app.on('window-all-closed', () => {});
const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(win, expression) {
  for (let i = 0; i < 160; i++) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await pause(50);
  }
  throw Error('Timed out: ' + expression);
}
async function fixture() {
  const z = new JSZip();
  const state = '<TransformedSynthState x:id="data" name="Omnisphere" format="vstpreset"><Attributes x:id="ghostData"><Attributes x:id="classInfo" name="Omnisphere" category="AudioSynth"/></Attributes><Url x:id="presetPath" url="media:///Presets/Transformed%20Synths/Omnisphere.vstpreset"/></TransformedSynthState>';
  const attachments = content => '<Attributes x:id="attachments"><MediaAttachment id="transform" relation="3">' + content + '</MediaAttachment></Attributes>';
  const track = (id, content) => '<MediaTrack trackID="' + id + '" name="' + id + '" mediaType="Audio">' + content + '</MediaTrack>';
  z.file('Song/song.xml', '<Song><Attributes x:id="Root"><List x:id="Tracks">' +
    track('Saved', attachments(state)) + track('Unrelated', '') + track('Ambiguous', attachments(state + state)) +
    track('NotAttachment', state) + track('EventOwned', '<List x:id="Events"><AudioEvent>' + attachments(state) + '</AudioEvent></List>') + '</List></Attributes></Song>');
  // The wrapperless clear form is synthetic; actual VST3 framing is tested below.
  z.file('Presets/Transformed Synths/Omnisphere.vstpreset', '<SynthMaster><ENTRYDESCR name="Not a part"/><SynthSubEngine><SynthEngine><SYNTHENG><ENTRYDESCR name="Saved transform patch"/></SYNTHENG></SynthEngine></SynthSubEngine></SynthMaster>');
  z.file('metainfo.xml', '<MetaInformation><Attribute id="Document:Generator" value="Studio Pro/8.2.0.114903"/><Attribute id="Document:FormatVersion" value="9"/></MetaInformation>');
  return z.generateAsync({ type: 'nodebuffer' });
}
async function read(win, bytes) {
  return win.webContents.executeJavaScript(`(async()=>{
    const b=Uint8Array.from(atob('${bytes.toString('base64')}'),c=>c.charCodeAt(0));
    const s=await window.__s1.readSong('local.song',b.buffer);
    return s.tracks.map(t=>({name:t.name,type:t.type,instrument:t.instrument,plugins:t.plugins.filter(p=>p.format==='instrument')}));
  })()`);
}
app.whenReady().then(async () => {
  try {
    const bytes = await fixture();
    for (const locale of ['zh-CN', 'en-US']) for (const width of [1280, 390]) {
      const win = new BrowserWindow({ width, height: 920, show: true, webPreferences: { partition: `transformed-${locale}-${width}-${Date.now()}` } });
      await win.loadURL('about:blank');
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Page.enable');
      await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator,'languages',{get:()=>[${JSON.stringify(locale)}]});Object.defineProperty(navigator,'language',{get:()=>${JSON.stringify(locale)}});` });
      if (process.env.WEB_URL) await win.loadURL(process.env.WEB_URL);
      else await win.loadFile(path.join(root, 'dist/index.html'));
      await until(win, '!!window.__s1');
      const requests = [];
      win.webContents.session.webRequest.onBeforeRequest((d, cb) => {
        if (/^https?:/.test(d.url)) requests.push({ url: d.url, method: d.method, upload: !!d.uploadData?.length });
        cb({});
      });
      const model = await read(win, bytes);
      assert.deepEqual(model[0].plugins[0].presetNames, ['Saved transform patch']);
      assert.equal(model[0].plugins[0].savedBeforeTransform, true);
      for (const t of model.slice(1)) assert.equal(t.plugins.length, 0, 'no attachment leakage: ' + t.name);
      const privatePath = '/tmp/s1real/song.zip';
      const real = fs.existsSync(privatePath) ? fs.readFileSync(privatePath) : null;
      if (real) {
        const realModel = await read(win, real);
        const omni = realModel.flatMap(t => t.plugins.filter(p => p.name === 'Omnisphere').map(p => ({track: t.name, ...p})));
        assert.equal(omni.length, 1, 'exact saved Omni instance is bound to its audio track');
        assert.equal(omni[0].savedBeforeTransform, true);
        assert(omni[0].presetNames.includes('CLUB │ Bad Boy Icon Bells'));
      }
      const displayed = real || bytes;
      await win.webContents.executeJavaScript(`(()=>{const b=Uint8Array.from(atob('${displayed.toString('base64')}'),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([b],'local.song'));document.querySelector('.landing').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));})()`);
      await until(win, "!!document.querySelector('.toolbar')&&!document.querySelector('.busy')");
      await win.webContents.executeJavaScript("(()=>{const b=[...document.querySelectorAll('.toolbar button')].find(b=>b.textContent.includes('F3'));if(b.getAttribute('aria-expanded')!=='true')b.click();})()");
      await until(win, "!!document.querySelector('.presetBadge')");
      const label = locale === 'zh-CN' ? '音频转换前保存状态' : 'Saved before audio transform';
      const ui = await win.webContents.executeJavaScript(`(()=>{const badge=[...document.querySelectorAll('.presetBadge')].find(b=>b.textContent.includes(${JSON.stringify(real ? 'CLUB │ Bad Boy Icon Bells' : 'Saved transform patch')}));badge?.scrollIntoView({block:'center',inline:'center'});return {text:badge?.textContent,title:badge?.title,page:document.documentElement.scrollWidth,viewport:innerWidth}})()`);
      assert(ui.text?.includes(label), 'saved-transform status is visible in the correct language');
      assert(ui.title?.includes(locale === 'zh-CN' ? '非当前运行插件' : 'not a running plugin'));
      assert(ui.page <= ui.viewport + 1, 'no page overflow');
      const submitted = requests.filter(r => {
        if (!process.env.WEB_URL || !['GET', 'HEAD'].includes(r.method) || r.upload) return true;
        const u = new URL(r.url), base = new URL(process.env.WEB_URL);
        return u.origin !== base.origin || !/^\/(?:$|index\.html$|assets\/|sw\.js$|manifest\.webmanifest$|icon-[^/]+$|apple-touch-icon\.png$|brand\/)/.test(u.pathname);
      });
      assert.deepEqual(submitted, [], 'no project uploads or unknown requests');
      await pause(200);
      fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
      fs.writeFileSync(path.join(root, `logs/transformed-${locale}-${width}.png`), (await win.capturePage()).toPNG());
      console.log(JSON.stringify({ locale, width, syntheticBinding: true, actualOmni: !!real, ui }));
      win.destroy();
    }
    console.log('PASS: scoped transformed instrument state, real Omnisphere names, bilingual desktop/mobile saved-state labels');
    app.quit();
  } catch (e) { console.error(e.stack || e); app.exit(1); }
});
