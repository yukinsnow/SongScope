// Browser format tests, without invoking any DAW or sending project data off-device.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),esbuild=require('esbuild');
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{try{
 const win=new BrowserWindow({show:false});await win.loadURL('about:blank');
 const bundle=esbuild.buildSync({stdin:{contents:"export {analyzeCompatibility,exportCompatibleSong} from './src/lib/compatibility';export {default as JSZip} from 'jszip';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'CompatibilityTest',platform:'browser'}).outputFiles[0].text;
 await win.webContents.executeJavaScript(bundle);
 const result=await win.webContents.executeJavaScript(`(async()=>{
  const {JSZip,analyzeCompatibility:analyze,exportCompatibleSong:convert}=CompatibilityTest;
  const meta=(generator='Studio Pro/8.2.0.114903',format='9')=>'<MetaInformation><Attribute value="'+generator+'" id="Document:Generator"/><Attribute value="'+format+'" id="Document:FormatVersion"/></MetaInformation>';
  const fixture=async(generator,format)=>{const zip=new JSZip();zip.file('metainfo.xml',meta(generator,format));zip.file('Song/song.xml','<Song><Attributes x:id="Root" secret="keep"><Note><![CDATA[version9 Pro EQ text]]></Note></Attributes></Song>');zip.file('opaque.vstpreset',new Uint8Array([0,255,1,55]));return {zip,fileName:'private.song'};};
  const eqData=()=>({cid:'{D9AE9ACD-69B4-4B43-B8D5-983E39C559A5}',classname:'Pro EQ',parameters:{lowcut:{lcfreq:80,lcslope:1,lcactive:1},lowfrequency:{lfgain:-2,lffreq:160,lfq:1,lftype:0,lfactive:1,lfdynamic:0},lowmidfrequency:{lmfgain:0,lmffreq:500,lmfq:1,lmfactive:0},midfrequency:{mfgain:0,mffreq:2000,mfq:1,mfactive:0},highmidfrequency:{hmfgain:3,hmffreq:4000,hmfq:1,hmfactive:1},highfrequency:{hfgain:0,hffreq:10000,hfq:1,hftype:1,hfactive:0},highcut:{hcfreq:18000,hcslope:1,hcactive:0},gain:{gain:6,autogain:1,highqual:1}},component:{autogaincomponent:{legacyAutoGain:1}}});
  const withEq=async(data=eqData())=>{const song=await fixture();song.zip.file('Presets/EQ.dsppreset',JSON.stringify(data));song.zip.file('Devices/audiomixer.xml','<Mixer><Attributes name="FX01"><UID x:id="deviceClassID" uid="{D9AE9ACD-69B4-4B43-B8D5-983E39C559A5}"/><Attributes x:id="ghostData" presetType="dsppreset"><Attributes x:id="classInfo" classID="{D9AE9ACD-69B4-4B43-B8D5-983E39C559A5}" name="Pro EQ"/></Attributes><String x:id="presetPath" text="Presets/EQ.dsppreset"/></Attributes></Mixer>');return song;};
  const eqSource=await withEq(),eqOut=await convert(eqSource,7),eqZip=await JSZip.loadAsync(eqOut.data),eqLegacy=await eqZip.file('Presets/EQ.fxpreset').async('text');
  if(!eqLegacy.includes('gain="'+(10**(6/20))+'"')||!eqLegacy.includes('autogain2="1"')||!eqLegacy.includes('autogain="1"'))throw Error('nonzero gain/auto mapping');
  if(!eqSource.zip.file('Presets/EQ.dsppreset')||eqSource.zip.file('Presets/EQ.fxpreset'))throw Error('source renamed');
  const negativeEq=[];
  for(const [name,mutate] of [['active dynamic',x=>x.parameters.lowfrequency.lfdynamic=1],['unknown DSP value',x=>x.parameters.gain.futureSetting=1],['missing DSP value',x=>delete x.parameters.lowcut.lcfreq],['invalid DSP number',x=>x.parameters.gain.gain=null],['unknown component',x=>x.component.future={mode:1}]]){const data=eqData();mutate(data);if((await analyze(await withEq(data),7)).canExport)throw Error('failed to block EQ '+name);negativeEq.push(name);}
  const missing=await withEq();missing.zip.remove('Presets/EQ.dsppreset');if((await analyze(missing,7)).canExport)throw Error('missing EQ accepted');negativeEq.push('missing EQ state');
  const nameOnly=await fixture();nameOnly.zip.file('Devices/mixer.xml','<Mixer name="Clap Synth" path="Clap.wav"/>');if(!(await analyze(nameOnly,6)).canExport)throw Error('false positive CLAP');
  const xidMeta=await fixture('studioone / 7.2.0.100','8');xidMeta.zip.file('metainfo.xml',meta('studioone / 7.2.0.100','8').replaceAll(' id=',' x:id='));if(!(await analyze(xidMeta,6)).canExport)throw Error('x:id metadata / known alias rejected');
  const source=await fixture(),out=await convert(source,7),round=await JSZip.loadAsync(out.data);
  const unchanged=await source.zip.file('metainfo.xml').async('text');
  if(!unchanged.includes('value="9"'))throw Error('source changed');
  if(!(await round.file('metainfo.xml').async('text')).includes('value="8"'))throw Error('format did not change');
  if(!(await round.file('metainfo.xml').async('text')).includes('Studio Pro/8.2.0.114903'))throw Error('Generator falsified');
  const blocks=[];
  for(const [name,song,target] of [['unknown',await fixture('Unknown/8.0.0','9'),7],['mismatch',await fixture('Studio One/7.2.0','9'),6],['same',await fixture('Studio One/7.2.0','8'),7],['upgrade',await fixture('Studio One/6.2.0','7'),7],['future',await fixture('Studio Pro/9.0.0','10'),7]]){const r=await analyze(song,target);if(r.canExport)throw Error('failed to block '+name);blocks.push(name);}
  const strange=await fixture();strange.zip.file('plugin.dsppreset','{"classname":"New FX","parameters":{}}');if((await analyze(strange,7)).canExport)throw Error('unknown dsppreset allowed');blocks.push('unknown DSP');
  const compressor=await fixture();compressor.zip.file('Devices/audiomixer.xml','<Mixer cid="{36F3F4D1-CBB4-4BF7-A7E3-EBCCED53718B}"/>');if((await analyze(compressor,7)).canExport)throw Error('new compressor allowed');blocks.push('new Compressor');
  const clash=await fixture();clash.zip.file('METAINFO.xml',meta());if((await analyze(clash,7)).canExport)throw Error('case collision');blocks.push('case collision');
  const clap=await fixture();clap.zip.file('Devices/audiomixer.xml','<Mixer format="CLAP"/>');if((await analyze(clap,6)).canExport)throw Error('CLAP allowed');blocks.push('CLAP to6');
  const duplicate=await fixture();duplicate.zip.file('metainfo.xml',meta().replace('</MetaInformation>','<Attribute id="Document:FormatVersion" value="9"/></MetaInformation>'));if((await analyze(duplicate,7)).canExport)throw Error('duplicate format allowed');blocks.push('duplicate format');
  const ghostOnly=await fixture();ghostOnly.zip.file('Devices/audiomixer.xml','<Mixer><Attributes x:id="ghostData" presetType="dsppreset"><Attributes x:id="classInfo" classID="{UNKNOWN}"/></Attributes></Mixer>');if((await analyze(ghostOnly,7)).canExport)throw Error('unresolved ghost accepted');blocks.push('unresolved DSP ghost');
  const bad=await fixture();bad.zip.file('metainfo.xml','<broken>');if((await analyze(bad,7)).canExport)throw Error('broken meta allowed');blocks.push('malformed metadata');
  return {blocks,negativeEq,output:out.fileName,changed:out.report.changedEntries,warnings:out.report.warnings.length};
 })()`);
 assert(result.blocks.length>=10);assert.equal(result.warnings,5);console.log('PASS synthetic source/version/format guards: '+JSON.stringify(result));
 const real=['/tmp/s1real/song.zip',...(fs.existsSync('/home/ubuntu/.openclaw/media/inbound')?fs.readdirSync('/home/ubuntu/.openclaw/media/inbound'):[]).filter(n=>n.includes('5a018938')).map(n=>path.join('/home/ubuntu/.openclaw/media/inbound',n))].filter(n=>fs.existsSync(n));
 for(const p of real){
  const b64=fs.readFileSync(p).toString('base64');
  const checked=await win.webContents.executeJavaScript(`(async()=>{
   const {JSZip,analyzeCompatibility:analyze,exportCompatibleSong:convert}=CompatibilityTest;
   const source=await JSZip.loadAsync(Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0))),song={zip:source,fileName:'private.song'};
   const originals=new Map();for(const e of Object.values(source.files).filter(e=>!e.dir))originals.set(e.name,await e.async('uint8array'));
   const reports=[];
   for(const target of [7,6]){
    const plan=await analyze(song,target);if(!plan.canExport)throw Error(JSON.stringify(plan));
    const a=await convert(song,target),b=await convert(song,target),out=await JSZip.loadAsync(a.data),again=await JSZip.loadAsync(b.data);
    if(Object.keys(source.files).length!==Object.keys(out.files).length)throw Error('entry count changed');
    let same=0;const changes=[];
    for(const [name,raw] of originals){
     const dest=name.endsWith('.dsppreset')?name.replace(/\\.dsppreset$/,'.fxpreset'):name;
     const result=out.file(dest);if(!result)throw Error('entry lost '+name);
     const bytes=await result.async('uint8array');
     if(raw.length===bytes.length&&raw.every((v,i)=>v===bytes[i]))same++;else changes.push(name);
     if(!(await source.file(name).async('uint8array')).every((v,i)=>v===raw[i]))throw Error('source mutated');
     const againBytes=await again.file(dest).async('uint8array');if(!againBytes.every((v,i)=>v===bytes[i])||againBytes.length!==bytes.length)throw Error('nondeterministic content');
    }
    if(changes.length!==3||!changes.includes('metainfo.xml')||!changes.includes('Devices/audiomixer.xml'))throw Error('unexpected changed entries '+JSON.stringify(changes));
    const mix=await out.file('Devices/audiomixer.xml').async('text');
    if(mix.includes('D9AE9ACD-69B4-4B43-B8D5-983E39C559A5')||mix.includes('presetType="dsppreset"')||mix.includes('.dsppreset'))throw Error('stale EQ refs');
    const oldName=changes.find(n=>n.endsWith('.dsppreset')),data=JSON.parse(new TextDecoder().decode(originals.get(oldName))),legacy=await out.file(oldName.replace(/\\.dsppreset$/,'.fxpreset')).async('text');
    const doc=new DOMParser().parseFromString(legacy.replace('<AudioEffectPreset ','<AudioEffectPreset xmlns:x="x" '),'application/xml'),attrs=doc.querySelector('Attributes');
    if(!attrs)throw Error('legacy EQ XML invalid');
    for(const [section,vals] of Object.entries(data.parameters))for(const [k,v] of Object.entries(vals)){
     if(['solo','sidehold'].includes(k))continue;
     const expected=k==='gain'?10**(v/20):v,key=k==='autogain'?'autogain2':k;
     if(Number(attrs.getAttribute(key))!==expected||!attrs.hasAttribute(key))throw Error('EQ mapping lost '+section+'/'+k);
    }
    const songXml=await out.file('Song/song.xml').async('text'),audio=(songXml.match(/<AudioEvent\\b/g)||[]).length,midi=(songXml.match(/<MusicPart\\b/g)||[]).length;
    reports.push({target,entries:originals.size,unchanged:same,changes,audio,midi,legacyAutoGain:Number(attrs.getAttribute('autogain'))});
   }
   return reports;
  })()`);
  if(p.includes('/tmp/s1real')){assert.equal(checked[0].audio,783);assert.equal(checked[0].midi,70);}
  console.log('PASS real local archive '+path.basename(p)+': '+JSON.stringify(checked));
 }
 console.log('Compatibility export checks PASS; no target DAW opening/playback has been tested.');app.quit();
}catch(e){console.error(e);app.exit(1);}});
