const {app,BrowserWindow}=require('electron');const fs=require('fs'),path=require('path'),assert=require('assert/strict'),esbuild=require('esbuild');app.disableHardwareAcceleration();
function vst3(chunks){const header=Buffer.alloc(48);header.write('VST3');header.writeUInt32LE(1,4);header.fill(65,8,40);let cursor=48;const table=Buffer.alloc(8+20*chunks.length);table.write('List');table.writeUInt32LE(chunks.length,4);chunks.forEach(([id,buf],i)=>{table.write(id,8+20*i);table.writeBigUInt64LE(BigInt(cursor),12+20*i);table.writeBigUInt64LE(BigInt(buf.length),20+20*i);cursor+=buf.length;});header.writeBigUInt64LE(BigInt(cursor),40);return Buffer.concat([header,...chunks.map(e=>e[1]),table]);}
app.whenReady().then(async()=>{try{
 const win=new BrowserWindow({show:false,webPreferences:{partition:'presets-'+Date.now()}});if(process.env.WEB_URL)await win.loadURL(process.env.WEB_URL);else await win.loadFile(path.join(__dirname,'../dist/index.html'));
 const code=esbuild.buildSync({stdin:{contents:`export {extractPresetNames} from './src/lib/presets';`,resolveDir:path.join(__dirname,'..')},bundle:true,write:false,format:'iife',globalName:'PresetTest'}).outputFiles[0].text;await win.webContents.executeJavaScript(code);
 const cases=[
  ['Serum 2',vst3([['Comp',Buffer.from('XferJson\0'+JSON.stringify({product:'Serum2'}))],['Cont',Buffer.from('XferJson\0'+JSON.stringify({presetName:'LD "Blue" Signal',presetAuthor:'Not a patch'}))]]),['LD "Blue" Signal']],
  ['Kontakt 8',vst3([['Comp',Buffer.from('C:\\Samples\\Soft Piano.nki\0D:\\Library\\Warm Strings.nki\0','utf16le')]]),['Soft Piano.nki','Warm Strings.nki']],
  ['Kontakt 7',Buffer.from('D:\\Library\\Bright Piano.nksn\0'),['Bright Piano.nksn']],
  ['Vital',vst3([['Comp',Buffer.from(JSON.stringify({synth_version:'1.0.6',preset_name:'Root Patch',settings:{sample:{name:'Not a preset'}}})+'\0')]]),['Root Patch']],
  ['Vital',Buffer.from('{"sample":{"presetName":"Decoy"}}'),[]],
  ['Nexus',vst3([['Comp',Buffer.from('NEXUS5 Bank\0\0\0\0\0presetName="Decoy"')]]),[]],
  ['UVI Falcon',Buffer.from('<UVI4><Program DisplayName="Falcon Patch"><Layer DisplayName="Wrong"/></Program></UVI4>'),['Falcon Patch']],
  ['Generic Synth',vst3([['Info',Buffer.from('<MetaInfo><Attribute id="presetName" value="A &amp; B"/></MetaInfo>')]]),['A & B']],
  ['Serum 2',Buffer.from('VST3'),[]],
  ['Serum 2',Buffer.from('opaque state: Presets/Synths/3 - Serum 2.vstpreset'),[]],
 ];
 const results=[];for(const [name,bytes,expected] of cases){const value=await win.webContents.executeJavaScript(`PresetTest.extractPresetNames(Uint8Array.from(atob('${bytes.toString('base64')}'),c=>c.charCodeAt(0)),${JSON.stringify(name)})`);assert.deepEqual(value.names,expected,name);results.push({plugin:name,...value});}
 const fxp=Buffer.alloc(80);fxp.write('CcnK');fxp.write('FPCh',8);fxp.write('LD Vintage Lead',28);const legacy=await win.webContents.executeJavaScript(`PresetTest.extractPresetNames(Uint8Array.from(atob('${fxp.toString('base64')}'),c=>c.charCodeAt(0)),'Serum')`);assert.deepEqual(legacy.names,['LD Vintage Lead']);results.push(legacy);
 let real=null;if(fs.existsSync('/tmp/s1real/song.zip')){
 const b64=fs.readFileSync('/tmp/s1real/song.zip').toString('base64');real=await win.webContents.executeJavaScript(`(async()=>{const b=Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0));const s=await window.__s1.readSong('real.song',b.buffer);return s.tracks.flatMap(t=>t.plugins.filter(p=>p.format==='instrument'&&/Serum/i.test(p.name)).map(p=>({track:t.name,names:p.presetNames,source:p.presetSource})));})()`);assert.equal(real.length,2);assert.deepEqual(real.flatMap(p=>p.names).sort(),['MO_HA_SY_Chord_Edm_Saw','NW_CP_Pad_italian_circuitry'].sort());
 }
 console.log(JSON.stringify({synthetic:results,realSerum:real},null,2));app.quit();
 }catch(e){console.error(e.stack||e);app.exit(1);}});
