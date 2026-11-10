// Schema tests are synthetic. Optional downloaded authored examples and private
// Nexus states are kept in ignored logs/, never redistributed in fixtures.
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),esbuild=require('esbuild'),zlib=require('zlib');
app.disableHardwareAcceleration();
const bank=(names,current=0)=>{const fields=243,record=fields*4+36,b=Buffer.alloc(20+names.length*record);b.write('1lys');b.writeUInt32LE(2211,4);b.writeUInt32LE(names.length,8);b.writeUInt32LE(fields,12);b.writeUInt32LE(current,16);names.forEach((n,i)=>b.write(n,20+i*record+fields*4,36,'latin1'));return b;};
app.whenReady().then(async()=>{try{
 const win=new BrowserWindow({show:false,webPreferences:{partition:'vendor-presets-'+Date.now()}});await win.loadURL('about:blank');
 const code=esbuild.buildSync({entryPoints:['src/lib/vendor-presets.ts'],bundle:true,write:false,format:'iife',globalName:'VendorTest'}).outputFiles[0].text;await win.webContents.executeJavaScript(code);
 let checks=0;const run=async(plugin,bytes,expected)=>{const actual=await win.webContents.executeJavaScript(`VendorTest.extractVendorPresetNames([Uint8Array.from(atob('${bytes.toString('base64')}'),c=>c.charCodeAt(0))],${JSON.stringify(plugin)})`);assert.deepEqual(actual?.names??null,expected,plugin);checks++;return actual;};
 const xml=(s)=>Buffer.from(s);
 await run('Sylenth1',bank(['Wrong bank slot','Selected Lead'],1),['Selected Lead']);
 const bad=bank(['Not selected'],1);await run('Sylenth1',bad,[]);
 const unknownVersion=bank(['Do not guess']);unknownVersion.writeUInt32LE(9999,4);await run('Sylenth1',unknownVersion,[]);
 const newer=bank(['Compressed Pad']);newer.writeUInt32LE(3045,4);
 await run('Sylenth1',Buffer.concat([newer.subarray(0,8),zlib.deflateSync(newer)]),['Compressed Pad']);
 await run('Sylenth1',Buffer.from('1lysINVALID presetName="Decoy"'),[]);
 const bomb=Buffer.alloc(9*1024*1024);bomb.write('1lys');bomb.writeUInt32LE(3045,4);
 await run('Sylenth1',Buffer.concat([bomb.subarray(0,8),zlib.deflateSync(bomb)]),[]);
 const omni=xml('<SynthMaster><ENTRYDESCR name="Rack, not patch"/><SynthSubEngine><SynthEngine><ENTRYDESCR name="Warm &amp; Clear"/><Layer name="Decoy"/></SynthEngine></SynthSubEngine></SynthMaster>');
 await run('Omnisphere',omni,['Warm & Clear']);
 const prefix=Buffer.alloc(24);prefix.writeUInt32LE(omni.length+1,16);
 await run('Omnisphere',Buffer.concat([prefix,omni,Buffer.from([0])]),['Warm & Clear']);
 await run('Omnisphere',xml('<SynthMaster><ENTRYDESCR name="Only Rack"/></SynthMaster>'),[]);
 await run('Omnisphere',xml('<SynthMaster><SynthSubEngine><ENTRYDESCR name="Decoy"/>'),[]);
 await run('StylusRMX',xml('<StylusRMXMaster><Part Loop="Loop 1"/><Part Loop="Loop 2"/><Effect name="Decoy"/></StylusRMXMaster>'),['Loop 1','Loop 2']);
 await run('UVI Falcon',xml('<UVI4><Program Name="Program" DisplayName="Actual patch"><Layers><Layer DisplayName="Wrong layer"/></Layers></Program></UVI4>'),['Actual patch']);
 await run('UVI Falcon',xml('<UVI4><Program Name="Internal Program"/></UVI4>'),[]);
 await run('UVI Falcon',xml('<!DOCTYPE UVI4 [<!ENTITY x "No">]><UVI4><Program DisplayName="&x;"/></UVI4>'),[]);
 await run('Nexus',Buffer.from('NEXUS5 Bank\0\0\0\0\0presetName="Not metadata"'),[]);
 await run('Unrelated Plugin',omni,null);
 const real={};
 const authored='logs/vendor-preset-research/sylenth-authored-example.fxp';if(fs.existsSync(authored)){real.authoredSylenth=await run('Sylenth1',fs.readFileSync(authored),['Init']);}
 const uvi='logs/vendor-preset-research/uvi-FXControls.uvip';if(fs.existsSync(uvi)){real.officialUvi=await run('UVI Falcon',fs.readFileSync(uvi),['FX Controls']);}
 const dir='/tmp/s1real/unpacked/Presets/Synths';real.nexus=[];
 if(fs.existsSync(dir))for(const file of fs.readdirSync(dir).filter(n=>/Nexus.*\.vstpreset$/.test(n))){const b=fs.readFileSync(path.join(dir,file)),o=Number(b.readBigUInt64LE(40));const s=Number(b.readBigUInt64LE(o+12)),l=Number(b.readBigUInt64LE(o+20));await run('Nexus',b.subarray(s,s+l),[]);real.nexus.push(file);}
 console.log(JSON.stringify({checks,real,coverage:'Schema tests; Nexus actual host states verified unsupported. Other vendor host states not verified.'},null,2));app.quit();
}catch(e){console.error(e.stack||e);app.exit(1)}});
