// Preview-only demo UI checks. Uses bundled view data and synthetic user projects;
// never opens a DAW, invokes plugins, or submits project data to a server.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-proxy-server');
app.on('window-all-closed', () => {});
const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtureTools = esbuild.buildSync({
  stdin: { contents: "export {default as JSZip} from 'jszip'; export {encodeMusicx} from './src/lib/musicx'; export {loadDemoSong} from './src/lib/demo'; export {exportPartsToMidi,importMidiInto} from './src/lib/midi'; export {analyzeCompatibility,exportCompatibleSong} from './src/lib/compatibility';", resolveDir: root },
  define: { 'import.meta.url': JSON.stringify(pathToFileURL(path.join(root, 'src/lib/demo.ts')).href) },
  bundle: true, write: false, format: 'iife', globalName: 'DemoFixture', platform: 'browser',
}).outputFiles[0].text;

async function until(win, predicate, label) {
  for (let i = 0; i < 250; i++) {
    if (await win.webContents.executeJavaScript(predicate)) return;
    await pause(40);
  }
  const text = await win.webContents.executeJavaScript('document.body.innerText');
  throw Error('Timed out waiting for ' + label + '\n' + text.slice(-1800));
}
async function key(win, name) {
  await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(name)},bubbles:true,cancelable:true}))`);
  await pause(80);
}
async function capture(win, name) {
  await win.webContents.executeJavaScript("Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))).then(()=>undefined)");
  await pause(100);
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(root, `logs/${name}.png`), (await win.capturePage()).toPNG());
}
async function openDemo(win) {
  await win.webContents.executeJavaScript("document.querySelector('.demoOpen').click()");
  await until(win, "!!document.querySelector('.songInfo')&&!document.querySelector('.busy')", 'demo overview');
}
async function home(win) {
  await win.webContents.executeJavaScript("document.querySelector('.homeButton').click()");
  await until(win, "!!document.querySelector('.demoOpen')", 'return to homepage');
}
async function loadUserFixture(win) {
  await win.webContents.executeJavaScript(`(async()=>{
    const k=DemoFixture,z=new k.JSZip();
    z.file('Song/song.xml','<Song xmlns:x="x" name="User-owned demo regression"><Attributes x:id="Root"><Attributes x:id="timeContext"><TempoMap><TempoMapSegment start="0" tempo="0.5" curveType="0"/></TempoMap><TimeSignatureMap><TimeSignatureMapSegment start="0" numerator="4" denominator="4"/></TimeSignatureMap></Attributes><List x:id="Tracks"><MediaTrack name="User Piano" mediaType="Music" trackID="user-piano" timeFormat="2"><List x:id="Events"><MusicPart clipID="melody" name="User melody" start="4" length="8" timeFormat="2"/></List></MediaTrack></List></Attributes></Song>');
    z.file('Song/mediapool.xml','<MediaPool xmlns:x="x"><MusicClip mediaID="melody"><Url x:id="dataPath" url="media:///Performances/user-melody.musicx"/></MusicClip></MediaPool>');
    z.file('Performances/user-melody.musicx',k.encodeMusicx([{pitch:60,start:0,length:2,velocity:90},{pitch:67,start:2,length:1,velocity:80}]));
    z.file('metainfo.xml','<MetaInformation><Attribute id="Document:Generator" value="Studio Pro/8.2.0.114903"/><Attribute id="Document:FormatVersion" value="9"/></MetaInformation>');
    const bytes=await z.generateAsync({type:'uint8array'}),dt=new DataTransfer();
    dt.items.add(new File([bytes],'User-owned.song',{type:'application/zip'}));
    document.querySelector('.app,.landing').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
  })()`);
  await until(win, "document.querySelector('.songInfo h1')?.textContent==='User-owned demo regression'&&!document.querySelector('.busy')", 'user-owned project');
}
function checkSnapshot() {
  const snapshotPath = path.join(root, 'src/data/demo-song.json');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const raw = fs.readFileSync(snapshotPath, 'utf8');
  assert.doesNotMatch(raw, /<Song\b|<MediaPool\b|<AudioSynthFolder\b/, 'raw source XML is not shipped');
  assert.doesNotMatch(raw, /file:\/\/\/|[A-Z]:\\\\(?:Users|Private|Projects)\\\\|\/Users\/|\/home\/ubuntu\//i, 'absolute source paths are not shipped');
  function walk(value, location) {
    if (!value || typeof value !== 'object') return;
    for (const [name, item] of Object.entries(value)) {
      assert(!['zip', 'zipEntries', 'xmlDocs', 'element', 'mediaPool'].includes(name), `raw archive/XML field is absent: ${location}.${name}`);
      if (['path', 'mediaPath', 'presetPath'].includes(name)) assert(!item, `source path is removed: ${location}.${name}`);
      walk(item, `${location}.${name}`);
    }
  }
  walk(snapshot, 'demo');
  const publicFiles = [];
  function list(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) list(file); else publicFiles.push(file);
    }
  }
  list(path.join(root, 'public'));
  assert(publicFiles.every(file => !/\.(song|zip)$/i.test(file)), 'public resources do not expose downloadable source projects');
  return fs.statSync(snapshotPath).size;
}

app.whenReady().then(async () => {
  try {
    const snapshotBytes = checkSnapshot();
    for (const locale of ['zh-CN', 'en-US']) {
      for (const width of [1280, 390]) {
        const zh = locale === 'zh-CN';
        const win = new BrowserWindow({ width, height: 920, show: true, webPreferences: { partition: `demo-${locale}-${width}-${Date.now()}`, backgroundThrottling: false } });
        await win.loadURL('about:blank');
        win.webContents.debugger.attach('1.3');
        await win.webContents.debugger.sendCommand('Page.enable');
        await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator,'languages',{get:()=>[${JSON.stringify(locale)}]});Object.defineProperty(navigator,'language',{get:()=>${JSON.stringify(locale)}});` });
        const network = [];
        win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
          if (/^https?:/.test(details.url)) network.push({ url: details.url, method: details.method, hasUpload: !!details.uploadData?.length });
          callback({});
        });
        if (process.env.WEB_URL) await win.loadURL(process.env.WEB_URL);
        else await win.loadFile(path.join(root, 'dist/index.html'));
        await until(win, "!!document.querySelector('.demoOpen')", 'homepage demo card');
        const homepage = await win.webContents.executeJavaScript('document.body.innerText');
        assert.match(homepage, /夏夜绮想演示用/);
        assert.doesNotMatch(homepage, /Studio One 与 Fender Studio Pro 是同一软件产品线|Studio One and Fender Studio Pro are the same product line/i);
        assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('.productAlias').length"), 0, 'removed description has no homepage element');
        assert.match(homepage, zh ? /查看示例工程/ : /View (?:demo|example) project/);
        await capture(win, `demo-home-${locale}-${width}`);
        await win.webContents.executeJavaScript("window.__demoSaved=[];window.s1={saveFile:async payload=>{window.__demoSaved.push({name:payload.defaultName,bytes:Array.from(payload.data)});return payload.defaultName;}};void 0;");
        await openDemo(win);
        const overview = await win.webContents.executeJavaScript(`({title:document.querySelector('.songInfo h1').textContent,badge:document.querySelector('header .readonly')?.textContent,notice:document.querySelector('.demoNotice')?.textContent,compatibility:!!document.querySelector('.compatibilityExport'),tracks:document.querySelectorAll('.overviewTracks .trackName').length,plugins:document.querySelectorAll('.overviewPlugins .pluginItem').length})`);
        assert.match(overview.title, /夏夜绮想/);
        assert.match(overview.badge, zh ? /只读示例.*不可导出/ : /(?:demo|example).*(?:no export|export disabled)/i);
        assert.match(overview.notice, zh ? /不支持 MIDI 或工程导出/ : /no MIDI or project export|MIDI (?:or|and) project export.*(?:disabled|not supported)/i);
        assert.equal(overview.compatibility, false, 'demo has no compatibility-export control');
        assert(overview.tracks > 5, 'actual supplied project tracks are shown');
        assert(overview.plugins > 0, 'actual supplied project plugins are shown');
        await capture(win, `demo-overview-${locale}-${width}`);
        await win.webContents.executeJavaScript("document.querySelector('.overviewTracks .trackName').click()");
        await until(win, "!!document.querySelector('.arrangement')", 'arrangement via track selection');
        const arrangement = await win.webContents.executeJavaScript(`({midi:document.querySelectorAll('.clip:not(.audioClip)').length,audio:document.querySelectorAll('.audioClip').length,disabled:[...document.querySelectorAll('.exportBar button')].map(b=>b.disabled)})`);
        assert(arrangement.midi > 0, 'demo MIDI blocks remain inspectable');
        assert(arrangement.audio > 0, 'demo audio placement remains inspectable');
        assert.equal(arrangement.disabled[0], true, 'selected-MIDI export disabled');
        assert.equal(arrangement.disabled[2], true, 'all-MIDI export disabled');
        await win.webContents.executeJavaScript("document.querySelector('.clip:not(.audioClip)').click()");
        await key(win, 'F2');
        await until(win, "!!document.querySelector('.inspectMeta button')&&document.querySelectorAll('.pianoNote').length>0", 'demo piano-roll inspector');
        assert.equal(await win.webContents.executeJavaScript("document.querySelector('.inspectMeta button').disabled"), true, 'single-part MIDI export disabled');
        await win.webContents.executeJavaScript("[document.querySelectorAll('.exportBar button')[0],document.querySelectorAll('.exportBar button')[2],document.querySelector('.inspectMeta button')].forEach(b=>b.click())");
        await pause(80);
        assert.equal(await win.webContents.executeJavaScript('window.__demoSaved.length'), 0, 'disabled controls cannot save the demo');
        // Handler guards must also reject export if the DOM disabled attribute is tampered with.
        await win.webContents.executeJavaScript("[document.querySelectorAll('.exportBar button')[0],document.querySelectorAll('.exportBar button')[2],document.querySelector('.inspectMeta button')].forEach(b=>{b.disabled=false;b.click()})");
        await pause(80);
        assert.equal(await win.webContents.executeJavaScript('window.__demoSaved.length'), 0, 'demo export handler remains guarded independently of disabled UI');
        await key(win, 'F3');
        await until(win, "document.querySelectorAll('.channel').length>0", 'demo plugin channels');
        assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('.midiInspector')"), false, 'F3 still closes the MIDI inspector');
        const layout = await win.webContents.executeJavaScript('({page:document.documentElement.scrollWidth,viewport:innerWidth})');
        assert(layout.page <= layout.viewport + 1, 'demo mobile page does not overflow horizontally');
        fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
        fs.writeFileSync(path.join(root, `logs/demo-${locale}-${width}.png`), (await win.capturePage()).toPNG());

        await win.webContents.executeJavaScript(fixtureTools);
        const library = await win.webContents.executeJavaScript(`(async()=>{
          const k=DemoFixture,s=k.loadDemoSong(),t=s.tracks.find(t=>t.parts.some(p=>p.notes.length)),p=t.parts.find(p=>p.notes.length);
          const guard=async(fn)=>{try{await fn();return {blocked:false}}catch(e){return {blocked:true,message:e.message}}};
          const guards={
            midi:await guard(()=>k.exportPartsToMidi([{track:t,part:p}])),
            trackMidi:await guard(()=>k.exportPartsToMidi([{track:t,part:{...p,readOnlyDemo:false}}])),
            project:await guard(()=>k.exportCompatibleSong(s,5)),
            midiImport:await guard(()=>k.importMidiInto(s,new ArrayBuffer(0),{targetTrackId:t.id})),
          };
          const report=await k.analyzeCompatibility(s,5);
          const before={pitch:p.notes[0].pitch,numerator:s.meterMap[0].numerator};
          p.notes[0].pitch=before.pitch===0?127:0;s.meterMap[0].numerator=31;s.metadata.DemoMutation='test';
          const plugin=s.tracks.flatMap(t=>t.plugins).find(p=>p.presetNames?.length);
          if(plugin)plugin.presetNames.push('Demo mutation');
          const fresh=k.loadDemoSong(),freshTrack=fresh.tracks.find(x=>x.id===t.id),freshPart=freshTrack.parts.find(x=>x.name===p.name);
          return {guards,report,independent:{notes:freshPart.notes[0].pitch===before.pitch,meter:fresh.meterMap[0].numerator===before.numerator,metadata:!fresh.metadata.DemoMutation,presets:!fresh.tracks.flatMap(t=>t.plugins).some(p=>p.presetNames?.includes('Demo mutation'))}};
        })()`);
        for (const [name, guard] of Object.entries(library.guards)) {
          assert.equal(guard.blocked, true, name + ' library rejects demo data');
          assert.match(guard.message, zh ? /此示例仅供浏览/ : /example is for viewing only/i);
        }
        assert.equal(library.report.canExport, false, 'demo compatibility analysis cannot enable export');
        assert(library.report.blockers.length > 0);
        for (const [name, independent] of Object.entries(library.independent)) assert.equal(independent, true, 'fresh demo does not share mutable ' + name);
        await loadUserFixture(win); // A normal project can replace the demo without first returning home.
        assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('.demoNotice')"), false, 'normal imports do not inherit the demo restriction notice');
        assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('.compatibilityExport')"), true, 'normal imports retain compatibility export');
        await key(win, 'F2');
        await until(win, "!!document.querySelector('.inspectMeta button')&&!document.querySelector('.inspectMeta button').disabled", 'user MIDI export restored');
        await win.webContents.executeJavaScript("document.querySelector('.inspectMeta button').click()");
        await until(win, 'window.__demoSaved.length===1&&!document.querySelector(".busy")', 'user-owned MIDI saved');
        const saved = await win.webContents.executeJavaScript('window.__demoSaved[0]');
        assert.match(saved.name, /\.mid$/i);
        assert.deepEqual(saved.bytes.slice(0, 4), [77, 84, 104, 100], 'normal export is a MIDI file');

        await home(win);
        await openDemo(win);
        // Modify search and panels, then reopen to ensure a fresh demo does not inherit them.
        await win.webContents.executeJavaScript(`(()=>{const q=document.querySelector('.overviewTracks input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(q,'no-such-track-demo');q.dispatchEvent(new Event('input',{bubbles:true}));q.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await until(win, "document.querySelectorAll('.overviewTracks .trackName').length===0", 'demo search filter');
        await key(win, 'F3');
        await home(win);
        await openDemo(win);
        const reset = await win.webContents.executeJavaScript(`({query:document.querySelector('.overviewTracks input').value,tracks:document.querySelectorAll('.overviewTracks .trackName').length,mixer:!!document.querySelector('.mixer'),editor:!!document.querySelector('.midiInspector'),notice:!!document.querySelector('.demoNotice')})`);
        assert.equal(reset.query, ''); assert.equal(reset.tracks, overview.tracks);
        assert.equal(reset.mixer, false); assert.equal(reset.editor, false); assert.equal(reset.notice, true);
        if (!process.env.WEB_URL) assert.deepEqual(network, [], 'bundled demo works fully offline, including file:// asset loading');
        else {
          const origin = new URL(process.env.WEB_URL).origin;
          assert(network.every(r => ['GET', 'HEAD'].includes(r.method) && !r.hasUpload && new URL(r.url).origin === origin), 'live demo fetches only same-origin app resources');
        }
        console.log(JSON.stringify({ locale, width, snapshotBytes, overview, arrangement, library, reset, layout, normalExport: saved.name, network: network.length }));
        win.destroy();
      }
    }
    console.log('PASS: bilingual desktop/mobile demo preview, all export guards, user-owned export restoration, homepage reset and offline data privacy');
    app.quit();
  } catch (error) { console.error(error.stack || error); app.exit(1); }
});
