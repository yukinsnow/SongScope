// Pure parser checks. Private projects are optional inputs, never committed fixtures.
const fs=require('fs'),assert=require('assert/strict'),esbuild=require('esbuild'),JSZip=require('jszip');
const bundled=esbuild.buildSync({entryPoints:['src/lib/kontakt.ts'],bundle:true,write:false,format:'cjs'}).outputFiles[0].text;
const m={exports:{}};new Function('module','exports',bundled)(m,m.exports);
const {readKontaktState,fastLz}=m.exports;
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const sized=b=>{const n=Buffer.alloc(8);n.writeBigUInt64LE(BigInt(b.length+8));return Buffer.concat([n,b]);};
const item=(id,payload=Buffer.alloc(0),inner)=>sized(Buffer.concat([Buffer.from('DSIN'),u32(id),u32(1),...(id===1?[]:[inner||item(1,u32(1))]),payload]));
function frame(stack){const head=Buffer.alloc(40);head.writeUInt32LE(1,8);head.write('hsin',12);head.writeUInt32LE(1,16);const b=Buffer.concat([head,stack,u32(1),u32(0)]);b.writeBigUInt64LE(BigInt(b.length));return b;}
let checks=0;function check(fn){fn();checks++;}
check(()=>assert.equal(readKontaktState([Buffer.from('unstructured')]),null));
const opaque=frame(item(116,Buffer.concat([u32(1),Buffer.from([1])]),item(115,Buffer.concat([u32(1),Buffer.from([1]),u32(48),u32(1),Buffer.from([0xcd])]))));
check(()=>assert.deepEqual(readKontaktState([opaque]),{names:[],encrypted:true,empty:false,source:'files'}));
const invalidFlag=Buffer.from(opaque);invalidFlag[invalidFlag.length-9]=2;
check(()=>assert.throws(()=>readKontaktState([invalidFlag])));
const orphan=frame(item(116,Buffer.concat([u32(1),Buffer.from([1])])));
check(()=>assert.throws(()=>readKontaktState([orphan])));
const brokenLength=Buffer.from(opaque);const pattern=Buffer.concat([u32(48),u32(1)]);const field=brokenLength.indexOf(pattern);brokenLength.writeUInt32LE(2,field+4);
check(()=>assert.throws(()=>readKontaktState([brokenLength])));
const truncated=opaque.subarray(0,-1);check(()=>assert.throws(()=>readKontaktState([truncated])));
const fakeFlag=frame(item(109,Buffer.from('0100000001'+Buffer.from('Fake.nki','utf16le').toString('hex'))));
check(()=>assert.equal(readKontaktState([fakeFlag]).encrypted,false));
const object=(id,payload)=>{const h=Buffer.alloc(6);h.writeUInt16LE(id);h.writeUInt32LE(payload.length,2);return Buffer.concat([h,payload]);};
const structure=children=>Buffer.concat([Buffer.from([1,181,0]),u32(0),u32(0),u32(children.length),children]);
const bankState=bank=>{const body=object(3,bank);return frame(item(109,Buffer.concat([u32(1),u32(1),u32(1),u32(body.length),u32(0),body,u32(0),u32(0x8565620d)])));};
const emptyBank=bankState(structure(object(0x37,Buffer.alloc(8))));
check(()=>assert.deepEqual(readKontaktState([emptyBank]),{names:[],encrypted:false,empty:true,source:'files'}));
// An unrecognized/partial bank or an occupied bitmap is not an empty rack.
check(()=>assert.equal(readKontaktState([bankState(structure(Buffer.alloc(0)))]).empty,false));
const occupied=Buffer.alloc(8);occupied[0]=1;
check(()=>assert.equal(readKontaktState([bankState(structure(object(0x37,occupied)))]).empty,false));
check(()=>assert.equal(readKontaktState([bankState(structure(object(0x37,Buffer.alloc(7))))]).empty,false));
check(()=>assert.equal(readKontaktState([emptyBank,opaque]).empty,false));
check(()=>assert.equal(readKontaktState([emptyBank,fakeFlag]).empty,false));
const literal=Buffer.concat([Buffer.from([31]),Buffer.alloc(32,1),Buffer.from([15]),Buffer.alloc(16,2)]);
check(()=>assert.equal(fastLz(literal,48).length,48));
check(()=>assert.throws(()=>fastLz(literal.subarray(0,-1),48)));
check(()=>assert.throws(()=>fastLz(Buffer.from([0xcd,0,0]),48)));
check(()=>assert.throws(()=>fastLz(literal,33*1024*1024)));
check(()=>assert.throws(()=>fastLz(Buffer.from([0,0,0x20,0xff]),48)));
check(()=>assert.throws(()=>fastLz(literal,49)));
const path=process.env.SONG;
(async()=>{const real=[];if(path){const z=await JSZip.loadAsync(fs.readFileSync(path));
 const code=esbuild.buildSync({entryPoints:['src/lib/presets.ts'],bundle:true,write:false,format:'cjs'}).outputFiles[0].text;const mm={exports:{}};new Function('module','exports',code)(mm,mm.exports);
 const expect=[['1 - Kontakt 8.vstpreset',[],true],['6 - Kontakt 8 (2).vstpreset',[],false],['7 - Kontakt 8 (3).vstpreset',['YellowRiver GuZheng2.0'],false],['8 - Kontakt 8 (4).vstpreset',['Cello'],false],['9 - Kontakt 8 (5).vstpreset',[],true],['10 - Kontakt 8 (6).vstpreset',[],true]];
 for(const [name,names,encrypted]of expect){const entry=z.file('Presets/Synths/'+name);if(!entry)continue;const result=mm.exports.extractPresetNames(await entry.async('uint8array'),'Kontakt 8');check(()=>assert.deepEqual(result.names,names,name));check(()=>assert.equal(result.encrypted,encrypted,name));check(()=>assert.equal(result.empty,name==='6 - Kontakt 8 (2).vstpreset',name));if(names.length)check(()=>assert.equal(result.source,'Kontakt saved instrument name'));real.push({name,...result});}
 assert.equal(real.length,6);
 }
 console.log(JSON.stringify({checks,real},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
