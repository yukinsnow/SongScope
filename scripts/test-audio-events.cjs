const {app,BrowserWindow}=require('electron');
const fs=require('fs'),assert=require('node:assert/strict'),esbuild=require('esbuild');
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{try{
  const win=new BrowserWindow({show:false});await win.loadURL('about:blank');
  const bundle=esbuild.buildSync({stdin:{contents:"export {readAudioEvents,secondsAtBeat,beatAtSeconds} from './src/lib/audio';export {readSong} from './src/lib/song';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'AudioEventsTest',platform:'browser'}).outputFiles[0].text;
  await win.webContents.executeJavaScript(bundle);
  const synthetic=await win.webContents.executeJavaScript(`(()=>{
    const doc=new DOMParser().parseFromString('<Track timeFormat="2"><AudioEvent clipID="sample" name="Edited region" start="6" timeFormat="0" length="3" offset="1.5"/><AudioEvent clipID="sample" start="16" timeFormat="2" length="4"/><AudioEvent clipID="sample" start="24" timeFormat="2" length="4"/><AudioEvent name="Missing position" length="2"/><AudioEvent name="Unsupported duration" start="8" timeFormat="7" length="100"/></Track>','application/xml');
    const map=[{beat:0,bpm:120,curveType:0,raw:{}},{beat:8,bpm:60,curveType:0,raw:{}},{beat:12,bpm:240,curveType:0,raw:{}}];
    const events=AudioEventsTest.readAudioEvents(doc.documentElement,new Map([['sample','file:///C:/Private/Soft%20Clap.wav']]),map);
    const secondsTrack=new DOMParser().parseFromString('<Track timeFormat="0"><AudioEvent name="Seconds track" start="4" timeFormat="0" length="2"/><AudioEvent name="Beat duration" start="4" timeFormat="2" length="4"/></Track>','application/xml');
    const unsupported=new DOMParser().parseFromString('<Track timeFormat="9"><AudioEvent start="10" timeFormat="0" length="2"/></Track>','application/xml');
    return {events,secondsEvents:AudioEventsTest.readAudioEvents(secondsTrack.documentElement,new Map(),map),unsupported:AudioEventsTest.readAudioEvents(unsupported.documentElement,new Map(),map),roundtrip:[-2,0,6,8,10,12,20].map(beat=>[beat,AudioEventsTest.beatAtSeconds(AudioEventsTest.secondsAtBeat(beat,map),map)])};
  })()`);
  assert.equal(synthetic.events.length,5);
  assert.equal(synthetic.events[0].name,'Edited region');assert.equal(synthetic.events[0].sampleName,'Soft Clap.wav');
  assert.equal(synthetic.events[0].start,6);assert.equal(synthetic.events[0].length,4);assert.equal(synthetic.events[0].offset,1.5);
  assert.equal(synthetic.events[1].name,'Soft Clap.wav');assert.equal(synthetic.events[1].start,16);assert.equal(synthetic.events[2].start,24);
  assert.equal(synthetic.events[3].start,null);assert.equal(synthetic.events[4].length,null);
  assert.equal(synthetic.secondsEvents[0].start,8);assert.equal(synthetic.secondsEvents[0].length,2);
  assert.equal(synthetic.secondsEvents[1].start,8);assert.equal(synthetic.secondsEvents[1].length,4);
  assert.equal(synthetic.unsupported[0].start,null);assert.equal(synthetic.unsupported[0].length,null);
  for(const [actual,expected] of synthetic.roundtrip)assert(Math.abs(actual-expected)<1e-9);
  console.log('PASS: repeated samples, name fallback, source offset, independent position/duration units, tempo-crossing conversion, unknown timing, and timing roundtrips');
  const real=process.env.SONG||'/tmp/s1real/song.zip';
  if(fs.existsSync(real)){
    const b64=fs.readFileSync(real).toString('base64');
    const result=await win.webContents.executeJavaScript(`(async()=>{const bytes=Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0));const song=await AudioEventsTest.readSong('private.song',bytes.buffer);const events=song.tracks.flatMap(t=>t.audioEvents),crash=song.tracks.find(t=>t.name==='ReCrash');return {count:events.length,tracks:song.tracks.filter(t=>t.audioEvents.length).length,unpositioned:events.filter(e=>e.start===null||e.length===null).length,crash:crash?.audioEvents.map(e=>({start:e.start,length:e.length})),positionsMatch:song.tracks.every(t=>t.audioEvents.every((event,i)=>Math.abs(event.start-Number(t.element.getElementsByTagName('AudioEvent')[i].getAttribute('start')))<1e-7))};})()`);
    assert.equal(result.count,783);assert.equal(result.tracks,27);assert.equal(result.unpositioned,0);assert.equal(result.positionsMatch,true);
    assert(result.crash.some(e=>e.start===298&&Math.abs(e.length-4)<1e-7));
    console.log('PASS: real project '+JSON.stringify(result));
  }
  app.quit();
}catch(error){console.error(error);app.exit(1);}});
