import { t as tr } from "../i18n";
/** Read names from saved state only; never load plugins or resolve external sample paths. */
export interface PresetDetails { names:string[]; source:string|null; note?:string }
const MAX_STATE=32*1024*1024,MAX_TEXT=8*1024*1024;
const clean=(s:string)=>s.trim().replace(/\0/g,'').slice(0,180);
const unique=(names:string[])=>[...new Map(names.filter(n=>n&&!/[\u0000-\u001f\ufffd]/.test(n)).map(n=>[n.toLowerCase(),n])).values()].slice(0,64);
function decodeEntities(s:string){
  const doc=new DOMParser().parseFromString('<r>'+s+'</r>','application/xml');
  return doc.querySelector('parsererror')?s:(doc.documentElement.textContent||s);
}
/** Validate the VST3 chunk table; do not scan broken containers as if they were raw states. */
export function stateChunks(bytes:Uint8Array):Uint8Array[]{
  if(bytes.length>MAX_STATE)throw Error(tr("插件状态超过 32MB，未提取预设"));
  const ascii=(from:number,n:number)=>new TextDecoder().decode(bytes.subarray(from,from+n));
  if(ascii(0,4)!=='VST3')return [bytes];
  if(bytes.length<48)throw Error(tr("VST3 状态头不完整"));
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const offset=Number(view.getBigUint64(40,true));
  if(!Number.isSafeInteger(offset)||offset<48||offset+8>bytes.length||ascii(offset,4)!=='List')throw Error(tr("VST3 状态索引无效"));
  const count=view.getUint32(offset+4,true);if(count>256||offset+8+count*20>bytes.length)throw Error(tr("VST3 状态索引越界"));
  const out:Uint8Array[]=[];
  for(let i=0;i<count;i++){
    const pos=offset+8+i*20,id=ascii(pos,4),start=Number(view.getBigUint64(pos+4,true)),size=Number(view.getBigUint64(pos+12,true));
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(size)||start<48||size<0||start+size>offset)throw Error(tr("VST3 状态区块越界"));
    if(['Comp','Cont','Info'].includes(id))out.push(bytes.subarray(start,start+size));
  }
  return out;
}
export function extractPresetNames(bytes:Uint8Array,pluginName:string):PresetDetails{
  try{
    const chunks=stateChunks(bytes);const names:string[]=[],refs:string[]=[];
    if(new TextDecoder().decode(bytes.subarray(0,4))==='CcnK'&&bytes.length>=56){
      const magic=new TextDecoder().decode(bytes.subarray(8,12));
      if(['FxCk','FPCh'].includes(magic)){
        const name=clean(new TextDecoder().decode(bytes.subarray(28,56)).split('\0')[0]);
        if(name)return {names:[name],source:'VST2 program name'};
      }
    }
    for(const chunk of chunks){
      const slices=chunk.length>MAX_TEXT?[chunk.subarray(0,MAX_TEXT),chunk.subarray(-1024*1024)]:[chunk];
      for(const slice of slices){
        const texts=[new TextDecoder().decode(slice),new TextDecoder('utf-16le').decode(slice),new TextDecoder('utf-16le').decode(slice.subarray(1))];
        for(const text of texts){
          // Serum 2 XferJson controller metadata and other explicit JSON state fields.
          for(const m of text.matchAll(/"(?:presetName|preset_name|programName|patchName|snapshotName)"\s*:\s*("(?:\\.|[^"\\])*")/gi)){
            try{const name=clean(JSON.parse(m[1]));if(name)names.push(name);}catch{/* malformed state, no guessing */}
          }
          for(const m of text.matchAll(/\b(?:presetName|programName|patchName|snapshotName)\s*=\s*["']([^"']+)["']/gi))names.push(clean(decodeEntities(m[1])));
          // VST3/JUCE XML named metadata attributes, excluding generic host cache filenames.
          for(const m of text.matchAll(/<(?:Attribute|String)\b[^>]*\b(?:id|name)=["'](?:presetName|programName|patchName|snapshotName|Document:Title)["'][^>]*>/gi)){
            const value=m[0].match(/\b(?:value|text)=["']([^"']+)["']/i);if(value)names.push(clean(decodeEntities(value[1])));
          }
          if(/kontakt/i.test(pluginName)){
            for(const m of text.matchAll(/[^\\/\u0000-\u001f"<>|:]{1,180}\.(?:nki|nkm|nksn)(?=$|[\u0000-\u0020"'<>;,])/gi))refs.push(clean(m[0]));
          }
        }
      }
    }
    const explicit=unique(names);
    const files=unique(refs);
    if(explicit.length)return {names:unique([...explicit,...files]),source:files.length?tr("插件预设元数据 / Kontakt 文件引用"):tr("插件状态中的预设元数据"),note:files.length?tr("含保存状态中的音色/快照文件引用，未运行插件验证"):undefined};
    if(files.length)return {names:files,source:tr("Kontakt 音色文件引用"),note:tr("读取到保存状态中的音色文件名；非运行中插件状态验证")};
    return {names:[],source:null,note:tr("保存状态未暴露可识别名称（可能被压缩或使用私有格式）")};
  }catch(e){return {names:[],source:null,note:(e as Error).message};}
}
