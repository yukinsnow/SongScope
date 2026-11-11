// Synthetic UI export checks. Never opens a DAW or sends project data off-device.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-proxy-server');
app.on('window-all-closed', () => {});
const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtureTools = esbuild.buildSync({
  stdin: { contents: "export {default as JSZip} from 'jszip'; export {encodeMusicx} from './src/lib/musicx';", resolveDir: root },
  bundle: true, write: false, format: 'iife', globalName: 'CompatibilityFixture', platform: 'browser',
}).outputFiles[0].text;
async function until(win, predicate, label) {
  for (let i = 0; i < 150; i++) {
    if (await win.webContents.executeJavaScript(predicate)) return;
    await pause(40);
  }
  const text = await win.webContents.executeJavaScript('document.body.innerText');
  throw Error('Timed out waiting for ' + label + '\n' + text.slice(-2500));
}
async function loadFixture(win, generator = 'Studio Pro/8.2.0.114903', unsupportedDsp = false) {
  await win.webContents.executeJavaScript(`(async()=>{
    const k=CompatibilityFixture,z=new k.JSZip();
    const songXml='<?xml version="1.0" encoding="UTF-8"?><Song><Attributes x:id="Root"><Attributes x:id="timeContext"><TempoMap><TempoMapSegment start="0" tempo="0.5" curveType="0"/></TempoMap><TimeSignatureMap><TimeSignatureMapSegment start="0" numerator="4" denominator="4"/></TimeSignatureMap></Attributes><List x:id="Tracks"><MediaTrack name="Piano" mediaType="Music" timeFormat="2" trackID="piano"><List x:id="Events"><MusicPart clipID="melody" name="Version test" start="8" length="8" timeFormat="2"/></List></MediaTrack></List></Attributes></Song>';
    z.file('Song/song.xml',songXml);
    z.file('Song/mediapool.xml','<MediaPool xmlns:x="x"><MusicClip mediaID="melody"><Url x:id="dataPath" url="media:///Performances/melody.musicx"/></MusicClip></MediaPool>');
    z.file('Performances/melody.musicx',k.encodeMusicx([{pitch:60,start:0,length:2,velocity:90},{pitch:67,start:2,length:1,velocity:80}]));
    z.file('Extra/opaque.bin',Uint8Array.from([0,255,128,64,0,1,18,83,254]));
    const generator=${JSON.stringify(generator)},title=${JSON.stringify(unsupportedDsp ? 'Blocked same-version reload' : 'Compatibility UI')};
    if(${unsupportedDsp})z.file('Presets/Unknown.dsppreset','{"classname":"Unrecognized new native DSP","parameters":{"unknown":1}}');
    z.file('metainfo.xml','<MetaInformation><Attribute id="Document:Generator" value="'+generator+'"/><Attribute id="Document:FormatVersion" value="9"/><Attribute id="Document:Title" value="'+title+'"/><Attribute id="Document:MimeType" value="application/x.presonus-song"/></MetaInformation>');
    const bytes=await z.generateAsync({type:'uint8array'});
    window.__compatOriginal=bytes;
    window.__compatOriginalCopy=Array.from(bytes);
    window.__compatSaved=[];
    window.s1={saveFile:async payload=>{window.__compatSaved.push({name:payload.defaultName,bytes:Uint8Array.from(payload.data)});return payload.defaultName;}};
    const dt=new DataTransfer();dt.items.add(new File([bytes],'Compatibility UI.song',{type:'application/zip'}));
    document.querySelector('.landing,.app').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
  })()`);
  await until(win, "!!document.querySelector('.songInfo')&&!document.querySelector('.busy')", 'overview');
  await until(win, `document.querySelector('.songInfo h1').textContent===${JSON.stringify(unsupportedDsp ? 'Blocked same-version reload' : 'Compatibility UI')}`, 'new source content displayed');
  await until(win, generator === 'Studio Pro/8.2.0.114903'
    ? "document.querySelector('.songInfo dl').innerText.includes('8.2.0.114903')"
    : "!document.querySelector('.songInfo dl').innerText.includes('8.2.0.114903')", 'new source version displayed');
}
async function exported(win, index, expectedFormat, target) {
  await win.webContents.executeJavaScript("document.querySelector('.compatibilityDownload').click()");
  await until(win, `window.__compatSaved.length===${index + 1}&&!document.querySelector('.busy')`, 'saved compatibility copy');
  const result = await win.webContents.executeJavaScript(`(async()=>{
    const saved=window.__compatSaved[${index}],out=await CompatibilityFixture.JSZip.loadAsync(saved.bytes),original=await CompatibilityFixture.JSZip.loadAsync(window.__compatOriginal);
    const meta=new DOMParser().parseFromString(await out.file('metainfo.xml').async('text'),'application/xml');
    const attributes=Object.fromEntries([...meta.getElementsByTagName('Attribute')].map(e=>[e.getAttribute('id')||e.getAttribute('x:id'),e.getAttribute('value')]));
    const unchanged={};
    for(const name of ['Song/song.xml','Song/mediapool.xml','Performances/melody.musicx','Extra/opaque.bin']) {
      const before=await original.file(name).async('uint8array'),after=await out.file(name).async('uint8array');
      unchanged[name]=before.length===after.length&&before.every((b,i)=>b===after[i]);
    }
    const inputStillSame=window.__compatOriginal.length===window.__compatOriginalCopy.length&&window.__compatOriginal.every((b,i)=>b===window.__compatOriginalCopy[i]);
    return {name:saved.name,attributes,unchanged,inputStillSame,overview:document.querySelector('.songInfo dl').innerText};
  })()`);
  assert.equal(result.attributes['Document:FormatVersion'], String(expectedFormat));
  assert.equal(result.attributes['Document:Generator'], 'Studio Pro/8.2.0.114903', 'do not claim the older application saved this copy');
  assert.equal(result.inputStillSame, true, 'input archive bytes unchanged');
  for (const [name, same] of Object.entries(result.unchanged)) assert.equal(same, true, name + ' bytes preserved');
  assert.match(result.name, new RegExp(target + '[^/]*\\.song$', 'i'), 'target is in the exported filename');
  assert.match(result.overview, /8\.2\.0\.114903/, 'open song stays at its original saved version');
  return result;
}
app.whenReady().then(async () => {
  try {
    for (const locale of ['zh-CN', 'en-US']) {
      for (const width of [1280, 390]) {
        const win = new BrowserWindow({ width, height: 920, show: true, webPreferences: { partition: `compatibility-${locale}-${width}-${Date.now()}`, backgroundThrottling: false } });
        win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) console.error('RENDERER:', message); });
        await win.loadURL('about:blank');
        win.webContents.debugger.attach('1.3');
        await win.webContents.debugger.sendCommand('Page.enable');
        await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator,'languages',{get:()=>[${JSON.stringify(locale)}]});Object.defineProperty(navigator,'language',{get:()=>${JSON.stringify(locale)}});` });
        if (process.env.WEB_URL) await win.loadURL(process.env.WEB_URL);
        else await win.loadFile(path.join(root, 'dist/index.html'));
        await until(win, "!!document.querySelector('.welcome')", 'homepage');
        const homepage = await win.webContents.executeJavaScript('document.body.innerText');
        assert.match(homepage, /Studio One/); assert.match(homepage, /Fender Studio Pro/);
        const network = [];
        win.webContents.session.webRequest.onBeforeRequest((details, callback) => { if (/^https?:/.test(details.url)) network.push(details.url); callback({}); });
        await win.webContents.executeJavaScript(fixtureTools);
        await loadFixture(win);
        const info = await win.webContents.executeJavaScript("[...document.querySelectorAll('.songInfo dl>div')].map(e=>({label:e.querySelector('dt').textContent,value:e.querySelector('dd').textContent}))");
        assert(info.some(row => row.value === '8.2.0.114903'), 'saved application build displayed separately');
        assert(info.some(row => row.value === '9'), 'document format is not confused with application version');
        assert(info.some(row => row.value === 'Studio One / Fender Studio Pro'));
        assert.equal(await win.webContents.executeJavaScript("document.querySelector('.compatibilityToggle').getAttribute('aria-expanded')"), 'false');
        await win.webContents.executeJavaScript("document.querySelector('.compatibilityToggle').click()");
        await until(win, "!!document.querySelector('.compatibilityDownload')&&!document.querySelector('.compatibilityDownload').disabled", 'target 7 export allowed');
        assert.equal(await win.webContents.executeJavaScript("document.querySelector('.compatibilityExport select').value"), '7');
        const seven = await exported(win, 0, 8, 7);
        await win.webContents.executeJavaScript("(()=>{const select=document.querySelector('.compatibilityExport select');select.value='6';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
        await until(win, "document.querySelector('.compatibilityExport select').value==='6'&&!document.querySelector('.compatibilityDownload').disabled", 'target 6 export allowed');
        const six = await exported(win, 1, 7, 6);
        await win.webContents.executeJavaScript("document.querySelector('.compatibilityExport').scrollIntoView({block:'center'})");
        const layout = await win.webContents.executeJavaScript('({page:document.documentElement.scrollWidth,viewport:innerWidth})');
        assert(layout.page <= layout.viewport + 1, 'version/compatibility UI does not overflow the page');
        fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
        fs.writeFileSync(path.join(root, `logs/compatibility-${locale}-${width}.png`), (await win.capturePage()).toPNG());

        // Same filename AND generating version must not reuse a previous successful plan.
        await win.webContents.executeJavaScript(`(()=>{
          window.__reloadExportStates=[];
          window.__reloadObserver=new MutationObserver(()=>{
            if(document.querySelector('.songInfo h1')?.textContent==='Blocked same-version reload') {
              const button=document.querySelector('.compatibilityDownload');
              if(button)window.__reloadExportStates.push(button.disabled);
            }
          });
          window.__reloadObserver.observe(document.querySelector('.app'),{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
        })()`);
        await loadFixture(win, 'Studio Pro/8.2.0.114903', true);
        if (await win.webContents.executeJavaScript("document.querySelector('.compatibilityToggle').getAttribute('aria-expanded')==='false'")) {
          await win.webContents.executeJavaScript("document.querySelector('.compatibilityToggle').click()");
        }
        await until(win, "!!document.querySelector('.compatibilityBlocker')", 'unsupported DSP after same-version reload');
        const reloadStates=await win.webContents.executeJavaScript('window.__reloadObserver.disconnect();window.__reloadExportStates');
        assert(reloadStates.length > 0, 'observed same-version reload button states');
        assert(reloadStates.every(disabled => disabled), 'stale successful plan never enables export for new blocked content');
        assert.equal(await win.webContents.executeJavaScript("document.querySelector('.compatibilityDownload').disabled"), true);
        assert.equal(await win.webContents.executeJavaScript('window.__compatSaved.length'), 0);

        // Unknown generating application cannot be silently treated as a known converter source.
        await loadFixture(win, 'UnknownApplication/42.0');
        await win.webContents.executeJavaScript("document.querySelector('.compatibilityToggle').click()");
        await until(win, "!!document.querySelector('.compatibilityBlocker')", 'unknown saved application blocker');
        assert.equal(await win.webContents.executeJavaScript("document.querySelector('.compatibilityDownload').disabled"), true);
        assert.equal(await win.webContents.executeJavaScript('window.__compatSaved.length'), 0);
        const submitted = network.filter(url => !/\/(?:assets\/|sw\.js|manifest\.webmanifest|icon-|brand\/)/.test(url));
        assert.deepEqual(submitted, [], 'project import/export makes no remote requests');
        if (!process.env.WEB_URL) assert.deepEqual(network, [], 'offline UI processing has no network requests');
        console.log(JSON.stringify({ locale, width, seven: seven.name, six: six.name, unchanged: seven.unchanged, inputStillSame: seven.inputStillSame && six.inputStillSame, sameVersionReloadBlocked: true, unknownBlocked: true, layout, network: network.length }));
        win.destroy();
      }
    }
    console.log('PASS: bilingual mobile/desktop product naming, saved/format version distinction, actual UI 7/6 compatibility downloads, original generator/data preservation and unknown-source blocker');
    app.quit();
  } catch (error) { console.error(error.stack || error); app.exit(1); }
});
