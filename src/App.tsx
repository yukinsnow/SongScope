import { useRef, useState, useMemo, useLayoutEffect } from "react";
import type { S1Song, S1Track, S1Part } from "./lib/types";
import { readSong } from "./lib/song";
import { exportPartsToMidi, partRelativeNotes, type PartRef } from "./lib/midi";

function bytesToBlob(data: Uint8Array | ArrayBuffer, type: string) {
  return new Blob([data as BlobPart], { type });
}

async function saveFile(defaultName: string, data: Uint8Array, mime = "application/octet-stream") {
  if (window.s1?.saveFile) {
    const p = await window.s1.saveFile({ defaultName, data });
    return p ?? null;
  }
  // Mobile: hand the file to the system share sheet (Files / AirDrop / WeChat …)
  try {
    const file = new File([data as BlobPart], defaultName, { type: mime });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: defaultName });
      return defaultName;
    }
  } catch {
    /* user cancelled the share sheet, fall through to download */
  }
  const url = URL.createObjectURL(bytesToBlob(data, mime));
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.rel = "noopener";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return defaultName;
}

export default function App() {
  const [song,setSong]=useState<S1Song|null>(null);
  const [view,setView]=useState<'overview'|'arrange'>('overview');
  const [mixer,setMixer]=useState(false);
  const [selected,setSelected]=useState('');
  const [picked,setPicked]=useState<Set<string>>(new Set());
  const [zoom,setZoom]=useState(6);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const channelStrip=useRef<HTMLDivElement>(null);
  const channelNodes=useRef(new Map<string, HTMLElement>());
  const focusChannel=(id:string)=>{
    const strip=channelStrip.current, node=channelNodes.current.get(id);
    if(!strip||!node)return;
    const frame=strip.getBoundingClientRect(), target=node.getBoundingClientRect();
    strip.scrollTo({left:strip.scrollLeft+target.left-frame.left-(strip.clientWidth-target.width)/2,behavior:'auto'});
  };
  const selectTrack=(id:string)=>{setSelected(id);focusChannel(id);};
  useLayoutEffect(()=>{if(mixer&&selected)focusChannel(selected);},[selected,mixer]);
  const input=useRef<HTMLInputElement>(null);
  const load=async(name:string,data:ArrayBuffer)=>{
    setBusy(true);setStatus('正在读取歌曲…');
    try {const s=await readSong(name,data);setSong(s);setView('overview');setPicked(new Set());setSelected('');setStatus('');}
    catch(e){setStatus((e as Error).message);}finally{setBusy(false);}
  };
  const file=async(f:File)=>{if(!/\.song$/i.test(f.name)){setStatus('请选择 .song 工程');return;}await load(f.name,await f.arrayBuffer());};
  const open=async()=>{if(window.s1?.openSong){const r=await window.s1.openSong();if(r)await load(r.name,new Uint8Array(r.data).buffer);}else input.current?.click();};
  const all=useMemo(()=>song?.tracks.flatMap(t=>t.parts.map((p,i)=>({track:t,part:p,key:t.id+':'+i})))??[],[song]);
  const tracks=song?.tracks.filter(t=>t.name.toLowerCase().includes(query.toLowerCase()))??[];
  const refs=all.filter(r=>picked.has(r.key));
  const end=Math.max(64,...all.map(r=>(r.part.start??0)+(r.part.length??0)));
  const numerator=Number(song?.timeSignature?.split('/')[0])||4;
  const denominator=Number(song?.timeSignature?.split('/')[1])||4;
  const barBeats=numerator*4/denominator;
  const bars=Math.ceil(end/barBeats)+2;
  const width=bars*barBeats*zoom;
  const exportMidi=async(parts:PartRef[],label:string,arrange=false)=>{
    if(!song||!parts.length)return;
    try{setBusy(true);const data=exportPartsToMidi(parts,{tempo:song.tempo,arrange});const saved=await saveFile(label.replace(/[\\/:*?"<>|]/g,'_')+'.mid',data,'audio/midi');setStatus(saved?'已导出 MIDI':'已取消导出');}catch(e){setStatus('导出失败：'+(e as Error).message);}finally{setBusy(false);}
  };
  const toggle=(key:string)=>setPicked(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n;});
  const trackClick=(t:S1Track)=>{selectTrack(t.id);setView('arrange');requestAnimationFrame(()=>document.getElementById('track-'+t.id)?.scrollIntoView({block:'nearest'}));};
  return <div className={song?'app':'landing'} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)file(f);}}>
    <input hidden type="file" accept=".song,application/zip" ref={input} onChange={e=>{const f=e.target.files?.[0];if(f)file(f);e.target.value='';}}/>
    {!song?<div className="welcome"><div className="eyebrow">SONGSCOPE / 曲镜</div><div className="record">♫</div><h1>每一首歌，都有自己的结构。</h1><p>打开 Studio One 工程，浏览轨道、MIDI 与插件。</p><button className="primary" disabled={busy} onClick={open}>打开 .song 文件</button><p className="muted">也可拖放文件 · 本地解析 · 只读浏览</p></div>:<>
      <header><div className="brand"><img src="./icon.svg" alt=""/>曲镜<span>SongScope</span></div><div className="headerTitle">{song.songTitle||song.fileName}</div><span className="readonly">只读工程</span><button onClick={open} disabled={busy}>打开歌曲</button></header>
      <nav className="toolbar"><div className="switch"><button className={view==='overview'?'active':''} onClick={()=>setView('overview')}>歌曲信息</button><button className={view==='arrange'?'active':''} onClick={()=>setView('arrange')}>编排 / 走带</button></div><span className="muted desktop">{song.tempo?.toFixed(0)} BPM · {song.timeSignature} · {song.tracks.filter(t=>t.type!=='folder').length} 轨</span><button className={mixer?'active':''} onClick={()=>setMixer(!mixer)} aria-expanded={mixer}>通道 / 插件 {mixer?'▾':'▴'}</button></nav>
      <div className="workspace">
        {view==='overview'?<div className="overview">
          <aside className="overviewTracks"><div className="sectionLabel">TRACKS <span>{song.tracks.filter(t=>t.type!=='folder').length}</span></div><input placeholder="搜索轨道" value={query} onChange={e=>setQuery(e.target.value)}/>{tracks.map((t,i)=><button className="trackName" key={t.id} onClick={()=>trackClick(t)} style={{borderLeftColor:t.color||'#6bafaa',paddingLeft:12+t.depth*10}}><small>{String(i+1).padStart(2,'0')}</small><span>{t.name}</span></button>)}</aside>
          <main className="songInfo"><div className="eyebrow">SONG OVERVIEW</div>{song.artwork?<img className="artwork" src={song.artwork} alt="歌曲封面"/>:<div className="artwork noArtwork">♫<small>暂无工程封面</small></div>}<h1>{song.songTitle||song.fileName.replace(/\.song$/i,'')}</h1><p className="artist">{song.metadata['Media:Artist']||song.metadata['Document:Creator']||'未知创作者'}</p><div className="songStats"><div><b>{song.tempo?.toFixed(0)||'—'}</b><small>BPM</small></div><div><b>{song.timeSignature||'—'}</b><small>拍号</small></div><div><b>{song.tracks.filter(t=>t.type!=='folder').length}</b><small>轨道</small></div></div><dl>{[['风格',song.metadata['Media:Genre']],['创作者',song.metadata['Document:Creator']],['调性',song.metadata['Media:KeySignature']],['制作软件',song.metadata['Document:Generator']]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'未填写'}</dd></div>)}</dl><button className="primary" onClick={()=>setView('arrange')}>浏览歌曲编排 →</button></main>
          <aside className="overviewPlugins"><div className="sectionLabel">INSTRUMENTS & EFFECTS</div>{song.plugins.map((p,i)=><div className="pluginItem" key={i}><span>{p.name}</span><small>{p.format==='instrument'?'乐器':'效果'} · {p.subCategory||p.vendor||'插件'}</small></div>)}</aside>
        </div>:<main className="arrangement"><div className="arrangeTools"><span>编排视图 <small className="muted"> · 点击片段选择，不可编辑</small></span><label>缩放 <input aria-label="时间线缩放" type="range" min="2" max="24" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label></div>
          <div className="timelineScroll"><div className="timeline" style={{width:width+200}}><div className="ruler"><div className="trackHeader">轨道 / 小节</div><div className="rulerBars" style={{width}}>{Array.from({length:bars},(_,i)=>i).filter(i=>i%Math.max(1,Math.ceil(48/(barBeats*zoom)))===0).map(i=><span key={i} style={{left:i*barBeats*zoom}}>{i+1}</span>)}</div></div>
          {tracks.map((t,i)=><div className={'lane '+(selected===t.id?'selected':'')} key={t.id} id={'track-'+t.id}><button className="trackHeader" style={{borderLeftColor:t.color||'#6bafaa'}} onClick={()=>selectTrack(t.id)}><small>{i+1}</small><div><strong>{t.name}</strong><small>{t.instrument||(t.type==='folder'?'文件夹':t.type==='audio'?'音频轨道':'轨道')}</small></div></button><div className="laneContent" style={{width,backgroundSize:barBeats*zoom+'px 100%'}}>{t.parts.map((p,j)=>{const key=t.id+':'+j;return <button key={key} aria-pressed={picked.has(key)} title={`${p.name} · 第 ${((p.start??0)/barBeats+1).toFixed(2)} 小节 · ${p.noteCount} 音符`} className={'clip '+(picked.has(key)?'picked':'')} style={{left:(p.start??0)*zoom,width:Math.max(3,(p.length??0)*zoom),backgroundColor:t.color||'#51b5ad'}} onClick={()=>{toggle(key);selectTrack(t.id);}}><span>{p.name}</span><NotePreview part={p}/></button>;})}{!t.parts.length&&<span className="laneEmpty">{t.type==='audio'?'音频轨道 · 无 MIDI 片段':'无 MIDI 片段'}</span>}</div></div>)}
          </div></div><div className="exportBar"><span>{refs.length?'已选 '+refs.length+' 个片段':'点击 MIDI 块以选择'}</span><button disabled={!refs.length||busy} onClick={()=>exportMidi(refs,'selected-parts')}>导出所选</button><button disabled={!picked.size} onClick={()=>setPicked(new Set())}>清除</button><button disabled={!all.length||busy} onClick={()=>exportMidi(all,(song.songTitle||'song')+'-arrangement',true)}>导出全部（保留位置）</button></div></main>}
      </div>
      {mixer&&<section className="mixer"><div className="mixerHeading"><span>CHANNELS <small>通道与插件 · 只读</small></span><button onClick={()=>setMixer(false)} aria-label="收起通道">×</button></div><div className="channelScroll" ref={channelStrip}>{song.tracks.filter(t=>t.type!=='folder').map((t,i)=><article ref={node=>{if(node)channelNodes.current.set(t.id,node);else channelNodes.current.delete(t.id);}} className={'channel '+(selected===t.id?'selected':'')} key={t.id} style={{borderBottomColor:t.color||'#51b5ad'}}><button className="channelTop" onClick={()=>selectTrack(t.id)}><small>{String(i+1).padStart(2,'0')}</small><strong>{t.name}</strong></button><PluginGroup title="VSTi / 乐器" names={t.instrument?[t.instrument]:[]}/><PluginGroup title="插入 / INSERTS" names={t.inserts.map(p=>p.name)}/><PluginGroup title="发送 / SENDS" names={t.sends.map(p=>p.name)}/><button className="channelExport" disabled={!t.parts.length||busy} onClick={()=>exportMidi(t.parts.map(part=>({track:t,part})),t.name,true)}>导出轨道 MIDI</button></article>)}</div></section>}
    </>}{status&&<div role="status" className="status" onClick={()=>setStatus('')}>{status}</div>}{busy&&<div className="busy">处理中…</div>}
  </div>;
}
function PluginGroup({title,names}:{title:string;names:string[]}) {return <div className="pluginGroup"><h4>{title}</h4>{names.length?names.map((n,i)=><div key={i} title={n}>{n}</div>):<p>无 / 未识别</p>}</div>;}
function NotePreview({part}:{part:S1Part}){
 const notes=partRelativeNotes(part);const length=part.length||1;
 return <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">{notes.slice(0,1500).map((n,i)=><rect key={i} x={n.start/length*100} y={38-(n.pitch/127)*36} width={Math.max(.3,n.length/length*100)} height="1.1"/>)}</svg>;
}
