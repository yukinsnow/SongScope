// Synthetic projects only. No external audio is opened or uploaded by these checks.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');
const esbuild = require('esbuild');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-proxy-server');
app.on('window-all-closed', () => {});
const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const bundle = esbuild.buildSync({
  stdin: { contents: "export {encodeMusicx} from './src/lib/musicx'; export {default as JSZip} from 'jszip';", resolveDir: root },
  bundle: true, write: false, format: 'iife', globalName: 'ArrangementFixture', platform: 'browser',
}).outputFiles[0].text;
async function until(win, predicate, name) {
  for (let i = 0; i < 100; i++) {
    if (await win.webContents.executeJavaScript(predicate)) return;
    await pause(40);
  }
  throw Error('Timed out waiting for ' + name);
}
async function key(win, name) {
  await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(name)},bubbles:true,cancelable:true}))`);
  await pause(100);
}
async function panels(win) {
  return win.webContents.executeJavaScript(`({midi:!!document.querySelector('.midiInspector'),plugins:!!document.querySelector('.mixer')})`);
}
async function toolbar(win, text) {
  await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('.toolbar button')].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('Toolbar button missing: '+${JSON.stringify(text)});b.click()})()`);
  await pause(100);
}
app.whenReady().then(async () => {
  try {
    for (const locale of ['zh-CN', 'en-US']) {
      for (const width of [1280, 390]) {
        const win = new BrowserWindow({ width, height: 920, show: true, webPreferences: { partition: `arrangement-${locale}-${width}-${Date.now()}`, backgroundThrottling: false } });
        await win.loadURL('about:blank');
        win.webContents.debugger.attach('1.3');
        await win.webContents.debugger.sendCommand('Page.enable');
        await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator,'languages',{get:()=>[${JSON.stringify(locale)}]});Object.defineProperty(navigator,'language',{get:()=>${JSON.stringify(locale)}});` });
        if (process.env.WEB_URL) await win.loadURL(process.env.WEB_URL);
        else await win.loadFile(path.join(root, 'dist/index.html'));
        const network = [];
        win.webContents.session.webRequest.onBeforeRequest((details, callback) => { if (/^https?:/.test(details.url)) network.push(details.url); callback({}); });
        await win.webContents.executeJavaScript(bundle);
        const model = await win.webContents.executeJavaScript(`(async()=>{
          const k=ArrangementFixture,z=new k.JSZip();
          z.file('Song/song.xml', '<Song xmlns:x="x" name="Arrangement Inspector"><Attributes x:id="Root"><Attributes x:id="timeContext"><TempoMap><TempoMapSegment start="0" tempo="0.5" curveType="0"/></TempoMap><TimeSignatureMap><TimeSignatureMapSegment start="0" numerator="4" denominator="4"/><TimeSignatureMapSegment start="8" numerator="3" denominator="4"/></TimeSignatureMap></Attributes><List x:id="Tracks"><MediaTrack name="Piano" mediaType="Music" trackID="piano" color="FF59BCAA"><List x:id="Events"><MusicPart clipID="melody" name="Pitch study" start="5" length="16" timeFormat="2"/></List></MediaTrack><MediaTrack name="Audio" mediaType="Audio" trackID="audio" color="FF619BD0"><List x:id="Events"><AudioEvent clipID="sample" name="Named take" start="8" length="4" offset="1" timeFormat="2"/><AudioEvent clipID="sample" start="16" length="2" timeFormat="2"/><AudioEvent clipID="sample" start="80" length="8" timeFormat="2"/></List></MediaTrack></List></Attributes></Song>');
          z.file('Song/mediapool.xml','<MediaPool xmlns:x="x"><MusicClip mediaID="melody"><Url x:id="dataPath" url="media:///Performances/pitches.musicx"/></MusicClip><AudioClip mediaID="sample"><Url x:id="path" url="file:///Private/Sample%20Name.wav"/></AudioClip></MediaPool>');
          z.file('Performances/pitches.musicx',k.encodeMusicx([{pitch:60,start:0,length:2,velocity:90},{pitch:61,start:2,length:.5,velocity:100},{pitch:67,start:4,length:1,velocity:80},{pitch:84,start:8,length:2,velocity:70}]));
          const bytes=await z.generateAsync({type:'uint8array'}),s=await window.__s1.readSong('arrangement.song',bytes.buffer);
          const dt=new DataTransfer();dt.items.add(new File([bytes],'arrangement.song'));document.querySelector('.landing').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
          return {midi:s.tracks[0].parts[0].notes,audio:s.tracks[1].audioEvents};
        })()`);
        assert.equal(model.midi.length, 4);
        assert.equal(model.audio.length, 3, 'all occurrences of a shared sample remain present');
        await until(win, "!!document.querySelector('.toolbar')", 'project');
        await key(win, 'F2');
        assert.deepEqual(await panels(win), { midi: true, plugins: false });
        await until(win, "document.querySelectorAll('.audioClip').length===3", 'positioned audio events');
        const audio = await win.webContents.executeJavaScript(`(()=>{const zoom=Number(document.querySelector('.arrangeTools input[type=range]').value);return {zoom,clips:[...document.querySelectorAll('.audioClip')].map(e=>({text:e.textContent,title:e.title,left:parseFloat(e.style.left),width:parseFloat(e.style.width),right:e.getBoundingClientRect().right})),laneWidth:parseFloat(document.querySelector('#track-audio .laneContent').style.width)}})()`);
        assert.deepEqual(audio.clips.map(e => e.left), [8, 16, 80].map(n => n * audio.zoom));
        assert.deepEqual(audio.clips.map(e => e.width), [4, 2, 8].map(n => n * audio.zoom));
        assert.match(audio.clips[0].text, /Named take/);
        assert.match(audio.clips[1].text, /Sample Name\.wav/);
        assert(audio.laneWidth >= 88 * audio.zoom, 'audio beyond the last MIDI clip extends the timeline');
        await win.webContents.executeJavaScript("document.querySelector('.audioClip').click()");
        await until(win, "!!document.querySelector('.audioInspector')", 'audio clip details');
        const audioInfo = await win.webContents.executeJavaScript("document.querySelector('.audioInspector').textContent");
        assert.match(audioInfo, /Named take/); assert.match(audioInfo, /Sample Name\.wav/);
        await win.webContents.executeJavaScript("document.querySelector('#track-piano .clip').click()");
        await until(win, "document.querySelectorAll('.pianoNote').length===4", 'piano notes');
        const piano = await win.webContents.executeJavaScript(`({keys:[...document.querySelectorAll('.pianoKey')].map(e=>e.textContent),notes:[...document.querySelectorAll('.pianoNote')].map(e=>({label:e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent,title:e.querySelector('title')?.textContent})),ruler:document.querySelector('.pianoRuler')?.textContent})`);
        assert(piano.keys.some(k => /C4/.test(k)), 'keyboard labels show C4');
        assert(piano.keys.some(k => /C6/.test(k)), 'keyboard range includes highest note');
        assert.equal(piano.notes.length, 4);
        assert.match(piano.notes[0].label + piano.notes[0].title, /C4/);
        assert(piano.ruler?.trim().length, 'piano beat/bar ruler is visible');
        // ResizeObserver updates label density after the inspector first mounts.
        await until(win, "['3','4'].every(label=>[...document.querySelectorAll('.pianoRuler span')].some(e=>e.textContent===label))", 'responsive ruler layout');
        const initialView=await win.webContents.executeJavaScript(`(()=>{const view=document.querySelector('.pianoRollViewport').getBoundingClientRect(),note=document.querySelector('.pianoNote').getBoundingClientRect();return {note:note.toJSON(),view:view.toJSON(),marks:[...document.querySelectorAll('.pianoRuler span')].map(e=>({text:e.textContent,left:parseFloat(e.style.left)}))}})()`);
        assert(initialView.note.bottom>initialView.view.top+25&&initialView.note.top<initialView.view.bottom,'initial piano viewport shows a note, not just an empty midpoint');
        assert.equal(initialView.marks[0].text,'2.2','partial-bar clip starts with its true arrangement beat');
        assert.equal(initialView.marks[0].left,0);
        assert(initialView.marks.some(m=>m.text==='3'),'ruler includes meter-change bar');
        assert(initialView.marks.some(m=>m.text==='4'),'ruler follows changed meter');
        await win.webContents.executeJavaScript("document.querySelector('.pianoNote').dispatchEvent(new MouseEvent('click',{bubbles:true}))");
        await until(win, "!!document.querySelector('.noteDetails')", 'selected note details');
        const noteDetails = await win.webContents.executeJavaScript("document.querySelector('.noteDetails').textContent");
        assert.match(noteDetails, /C4/); assert.match(noteDetails, /60/);
        const zoom = await win.webContents.executeJavaScript(`(async()=>{
          const settle=()=>new Promise(r=>setTimeout(r,100));
          const size=()=>({width:document.querySelector('.pianoNote').getBoundingClientRect().width,height:document.querySelector('.pianoKey').getBoundingClientRect().height});
          const set=(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
          await settle();await settle();
          const inputs=document.querySelectorAll('.pianoControls input[type=range]'),before=size();
          set(inputs[0],2);await settle();const time=size();
          set(inputs[1],28);await settle();const pitch=size();
          const fitted=document.querySelectorAll('.pianoKey').length;
          document.querySelector('.pianoControls button').click();await settle();
          const full={count:document.querySelectorAll('.pianoKey').length,pressed:document.querySelector('.pianoControls button').getAttribute('aria-pressed'),lowest:document.querySelector('.pianoKey[data-pitch="0"]')?.textContent,highest:document.querySelector('.pianoKey[data-pitch="127"]')?.textContent};
          document.querySelector('.pianoControls button').click();set(inputs[0],1);set(inputs[1],20);await settle();
          return {before,time,pitch,fitted,full,restored:document.querySelectorAll('.pianoKey').length};
        })()`);
        assert(Math.abs(zoom.time.width-zoom.before.width*2)<1, 'time zoom changes note width: '+JSON.stringify({locale,width,zoom}));
        assert.equal(zoom.pitch.height,28, 'pitch zoom changes semitone row height');
        assert.equal(zoom.full.count,128);assert.equal(zoom.full.pressed,'true');
        assert.match(zoom.full.lowest,/C-1/);assert.match(zoom.full.highest,/G9/);
        assert.equal(zoom.restored,zoom.fitted);

        // User-requested mutual exclusion, exercised in both directions by hotkeys and toolbar buttons.
        await key(win, 'F3'); assert.deepEqual(await panels(win), { midi: false, plugins: true });
        assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('.channelExport').length"),0,'plugin rack has no MIDI export buttons');
        await key(win, 'F2'); assert.deepEqual(await panels(win), { midi: true, plugins: false });
        await toolbar(win, 'F3'); assert.deepEqual(await panels(win), { midi: false, plugins: true });
        await toolbar(win, 'F2'); assert.deepEqual(await panels(win), { midi: true, plugins: false });
        await toolbar(win, 'F2'); assert.deepEqual(await panels(win), { midi: false, plugins: false });
        await toolbar(win, 'F3'); assert.deepEqual(await panels(win), { midi: false, plugins: true });
        await toolbar(win, 'F3'); assert.deepEqual(await panels(win), { midi: false, plugins: false });
        await key(win, 'F2');
        const layout = await win.webContents.executeJavaScript(`({page:document.documentElement.scrollWidth,viewport:innerWidth,piano:document.querySelector('.pianoRoll').getBoundingClientRect().toJSON(),inspector:document.querySelector('.midiInspector').getBoundingClientRect().toJSON()})`);
        assert(layout.page <= layout.viewport + 1, 'mobile page does not overflow horizontally');
        assert(layout.piano.height >= 80, 'piano grid remains usable');
        if (!process.env.WEB_URL) assert.deepEqual(network, [], 'local project loading performs no network requests');
        await win.webContents.executeJavaScript(`(()=>{const note=document.querySelector('.pianoNote[data-pitch="60"]');note.click();const view=document.querySelector('.pianoRollViewport');view.scrollTop=Math.max(0,parseFloat(note.style.top)-60);})()`);
        await pause(100);
        fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
        fs.writeFileSync(path.join(root, `shots/arrangement-${locale}-${width}.png`), (await win.capturePage()).toPNG());
        console.log(JSON.stringify({ locale, width, audio: audio.clips, notes: piano.notes.length, zoom, layout, network: network.length }));
        win.destroy();
      }
    }
    console.log('Arrangement audio positions, pitch inspector, responsive layout and mutually exclusive F2/F3: PASS');
    app.quit();
  } catch (error) { console.error(error.stack || error); app.exit(1); }
});
