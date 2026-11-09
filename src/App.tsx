import { useRef, useState, useMemo, useLayoutEffect, useEffect } from "react";
import type { S1Song, S1Track, S1Part, PluginRef } from "./lib/types";
import { buildBars, formatPosition } from "./lib/timing";
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
  const [editor,setEditor]=useState(false);
  const [help,setHelp]=useState(false);
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
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(!['F1','F2','F3'].includes(e.key)||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
      const target=e.target as HTMLElement|null;
      if(target instanceof HTMLElement&&target.closest('input,textarea,select,[contenteditable="true"]'))return;
      e.preventDefault();if(e.repeat)return;
      if(e.key==='F1')setHelp(v=>!v);
      else if(song){if(e.key==='F2'){setEditor(v=>!v);setView('arrange');}else setMixer(v=>!v);}
    };
    window.addEventListener('keydown',onKey,true);return ()=>window.removeEventListener('keydown',onKey,true);
  },[song]);
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
  const end=Math.max(64,...all.map(r=>(r.part.start??0)+(r.part.length??0)),...(song?.tempoMap.map(e=>e.beat)??[]),...(song?.meterMap.map(e=>e.beat)??[]));
  const barMarks=useMemo(()=>buildBars(song?.meterMap??[],end),[song,end]);
  const width=(barMarks.at(-1)?.beat??end+8)*zoom;
  const barGrid=`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="1"><path d="${barMarks.map(b=>`M${b.beat*zoom} 0V1`).join('')}" stroke="#46545b66"/></svg>`)}")`;
  const position=(beat:number)=>formatPosition(beat,barMarks);
  const activePart=all.find(r=>r.track.id===selected&&picked.has(r.key))??all.find(r=>r.track.id===selected)??(!selected?all[0]:undefined);
  const exportMidi=async(parts:PartRef[],label:string,arrange=false)=>{
    if(!song||!parts.length)return;
    try{setBusy(true);const data=exportPartsToMidi(parts,{tempo:song.tempo,tempoMap:song.tempoMap,meterMap:song.meterMap,arrange:arrange||parts.length>1});const saved=await saveFile(label.replace(/[\\/:*?"<>|]/g,'_')+'.mid',data,'audio/midi');setStatus(saved?('已导出 MIDI'+(song.tempoMap.some(e=>e.curveType!==0)?' · 曲线变速按节点阶梯近似':'')):'已取消导出');}catch(e){setStatus('导出失败：'+(e as Error).message);}finally{setBusy(false);}
  };
  const toggle=(key:string)=>setPicked(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n;});
  const trackClick=(t:S1Track)=>{selectTrack(t.id);setView('arrange');requestAnimationFrame(()=>document.getElementById('track-'+t.id)?.scrollIntoView({block:'nearest'}));};
  return <div className={song?'app':'landing'} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)file(f);}}>
    <input hidden type="file" accept=".song,application/zip" ref={input} onChange={e=>{const f=e.target.files?.[0];if(f)file(f);e.target.value='';}}/>
    {!song?<div className="welcome"><div className="heroLogo"><img src="./brand/songscope-logo.png" alt="SongScope"/></div><div className="eyebrow">Studio One 工程查看器</div><h1>每一首歌，都有自己的结构。</h1><p>打开 Studio One 工程，浏览轨道、MIDI 与插件。</p><button className="primary" disabled={busy} onClick={open}>打开 .song 文件</button><p className="muted">也可拖放文件 · 本地解析 · 只读浏览</p></div>:<>
      <header><div className="brand logoBrand" title="SongScope — Studio One 工程查看器"><img src="./brand/songscope-logo.png" alt="SongScope"/></div><div className="headerTitle">{song.songTitle||song.fileName}</div><span className="readonly">只读工程</span><button onClick={open} disabled={busy}>打开歌曲</button></header>
      <nav className="toolbar"><div className="switch"><button className={view==='overview'?'active':''} onClick={()=>setView('overview')}>歌曲信息</button><button className={view==='arrange'?'active':''} onClick={()=>setView('arrange')}>编排 / 走带</button></div><div className="utilityButtons"><button onClick={()=>setHelp(true)}>F1 帮助</button><button className={editor?'active':''} onClick={()=>{setEditor(!editor);setView('arrange');}}>F2 MIDI</button></div><span className="muted desktop">{song.tempo?.toFixed(0)} BPM · {song.timeSignature} · {song.tracks.filter(t=>t.type!=='folder').length} 轨</span><button className={mixer?'active':''} onClick={()=>setMixer(!mixer)} aria-expanded={mixer}>F3 通道 / 插件 {mixer?'▾':'▴'}</button></nav>
      <div className="workspace">
        {view==='overview'?<div className="overview">
          <aside className="overviewTracks"><div className="sectionLabel">TRACKS <span>{song.tracks.filter(t=>t.type!=='folder').length}</span></div><input placeholder="搜索轨道" value={query} onChange={e=>setQuery(e.target.value)}/>{tracks.map((t,i)=><button className="trackName" key={t.id} onClick={()=>trackClick(t)} style={{borderLeftColor:t.color||'#6bafaa',paddingLeft:12+t.depth*10}}><small>{String(i+1).padStart(2,'0')}</small><span>{t.name}</span></button>)}</aside>
          <main className="songInfo"><div className="eyebrow">SONG OVERVIEW</div>{song.artwork?<img className="artwork" src={song.artwork} alt="歌曲封面"/>:<div className="artwork noArtwork">♫<small>暂无工程封面</small></div>}<h1>{song.songTitle||song.fileName.replace(/\.song$/i,'')}</h1><p className="artist">{song.metadata['Media:Artist']||song.metadata['Document:Creator']||'未知创作者'}</p><div className="songStats"><div><b>{song.tempo?.toFixed(0)||'—'}</b><small>BPM</small></div><div><b>{song.timeSignature||'—'}</b><small>拍号</small></div><div><b>{song.tracks.filter(t=>t.type!=='folder').length}</b><small>轨道</small></div></div><dl>{[['风格',song.metadata['Media:Genre']],['创作者',song.metadata['Document:Creator']],['调性',song.metadata['Media:KeySignature']],['制作软件',song.metadata['Document:Generator']]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'未填写'}</dd></div>)}</dl><details className="timingMap"><summary>速度 / 拍号轨 · {song.tempoMap.length} 个速度节点 · {song.meterMap.length} 个拍号节点</summary><div className="mapLists"><div><h4>速度变化</h4>{song.tempoMap.map((e,i)=><p key={i}><b>{position(e.beat)}</b> {Number(e.bpm.toFixed(3))} BPM {e.curveType!==0&&<em>曲线 {e.curveType}（导出阶梯近似）</em>}</p>)}</div><div><h4>拍号变化</h4>{song.meterMap.map((e,i)=><p key={i}><b>{position(e.beat)}</b> {e.numerator}/{e.denominator}</p>)}</div></div></details>{song.warnings.length>0&&<details className="timingMap"><summary>解析提示（{song.warnings.length}）</summary>{song.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}<button className="primary" onClick={()=>setView('arrange')}>浏览歌曲编排 →</button></main>
          <aside className="overviewPlugins"><div className="sectionLabel">INSTRUMENTS & EFFECTS</div>{song.plugins.map((p,i)=><div className="pluginItem" key={i}><span>{p.name}</span><small>{p.format==='instrument'?'乐器':'效果'} · {p.subCategory||p.vendor||'插件'}</small></div>)}</aside>
        </div>:<main className="arrangement"><div className="arrangeTools"><span>编排视图 <small className="muted"> · 点击片段选择，不可编辑</small></span><label>缩放 <input aria-label="时间线缩放" type="range" min="2" max="24" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label></div>
          <div className="timelineScroll"><div className="timeline" style={{width:width+200}}><div className="ruler"><div className="trackHeader">轨道 / 小节</div><div className="rulerBars" style={{width}}>{barMarks.filter((b,i)=>i===0||(b.number-1)%Math.max(1,Math.ceil(48/(b.numerator*4/b.denominator*zoom)))===0||song.meterMap.some(m=>m.beat===b.beat)).map(b=><span key={b.beat} style={{left:b.beat*zoom}}>{b.number}</span>)}</div></div>
          <div className="mapLane"><div className="trackHeader">速度 / BPM</div><div className="mapContent" style={{width}}>{song.tempoMap.map((e,i)=><span key={i} title={`第 ${position(e.beat)} 小节 · ${Number(e.bpm.toFixed(3))} BPM${e.curveType?' · 曲线变速，导出阶梯近似':''}`} style={{left:e.beat*zoom}}>{Number(e.bpm.toFixed(2))}{e.curveType?' ↝':''}</span>)}</div></div>
          <div className="mapLane"><div className="trackHeader">拍号</div><div className="mapContent" style={{width}}>{song.meterMap.map((e,i)=><span key={i} title={`第 ${position(e.beat)} 小节`} style={{left:e.beat*zoom}}>{e.numerator}/{e.denominator}</span>)}</div></div>
          {tracks.map((t,i)=><div className={'lane '+(selected===t.id?'selected':'')} key={t.id} id={'track-'+t.id}><button className="trackHeader" style={{borderLeftColor:t.color||'#6bafaa'}} onClick={()=>selectTrack(t.id)}><small>{i+1}</small><div><strong>{t.name}</strong><small title={t.plugins.find(p=>p.format==='instrument')?.preset||undefined}>{(t.instrument? t.instrument+(t.plugins.find(p=>p.format==='instrument')?.preset?' · '+t.plugins.find(p=>p.format==='instrument')?.preset:''):null)||(t.type==='folder'?'文件夹':t.type==='audio'?'音频轨道':'轨道')}</small></div></button><div className="laneContent" style={{width,backgroundImage:barGrid,backgroundSize:width+'px 100%'}}>{t.parts.map((p,j)=>{const key=t.id+':'+j;return <button key={key} aria-pressed={picked.has(key)} title={`${p.name} · 第 ${position(p.start??0)} 小节 · ${p.noteCount} 音符`} className={'clip '+(picked.has(key)?'picked':'')} style={{left:(p.start??0)*zoom,width:Math.max(3,(p.length??0)*zoom),backgroundColor:t.color||'#51b5ad'}} onClick={()=>{toggle(key);selectTrack(t.id);}}><span>{p.name}</span><NotePreview part={p}/></button>;})}{!t.parts.length&&<span className="laneEmpty">{t.type==='audio'?'音频轨道 · 无 MIDI 片段':'无 MIDI 片段'}</span>}</div></div>)}
          </div></div><div className="exportBar"><span>{refs.length?'已选 '+refs.length+' 个片段':'点击 MIDI 块以选择'}</span><button disabled={!refs.length||busy} onClick={()=>exportMidi(refs,'selected-parts')}>导出所选</button><button disabled={!picked.size} onClick={()=>setPicked(new Set())}>清除</button><button disabled={!all.length||busy} onClick={()=>exportMidi(all,(song.songTitle||'song')+'-arrangement',true)}>导出全部（保留位置）</button></div></main>}
      </div>
      {editor&&<section className="midiInspector"><div className="mixerHeading"><span>F2 · MIDI 查看 <small>只读，不提供编辑</small></span><button onClick={()=>setEditor(false)} aria-label="收起 MIDI 查看">×</button></div>{activePart?<><div className="inspectMeta">{activePart.track.name} / {activePart.part.name} · 起点 {position(activePart.part.start??0)} · {activePart.part.noteCount} 音符 <button disabled={busy} onClick={()=>exportMidi([activePart],activePart.part.name)}>导出此片段</button></div><div className="pianoPreview"><NotePreview part={activePart.part}/></div></>:<p className="muted">当前轨道没有 MIDI 片段，请选择乐器轨道或 MIDI 块。</p>}</section>}
      {mixer&&<section className="mixer"><div className="mixerHeading"><span>CHANNELS <small>通道与插件 · 只读</small></span><button onClick={()=>setMixer(false)} aria-label="收起通道">×</button></div><div className="channelScroll" ref={channelStrip}>{song.tracks.filter(t=>t.type!=='folder').map((t,i)=><article ref={node=>{if(node)channelNodes.current.set(t.id,node);else channelNodes.current.delete(t.id);}} className={'channel '+(selected===t.id?'selected':'')} key={t.id} style={{borderBottomColor:t.color||'#51b5ad'}}><button className="channelTop" onClick={()=>selectTrack(t.id)}><small>{String(i+1).padStart(2,'0')}</small><strong>{t.name}</strong></button><PluginGroup title="VSTi / 乐器" names={t.instrument?[t.instrument]:[]}/><InstrumentPreset plugin={t.plugins.find(p=>p.format==='instrument')}/><PluginGroup title="插入 / INSERTS" names={t.inserts.map(p=>p.name)}/><PluginGroup title="发送 / SENDS" names={t.sends.map(p=>p.name)}/><button className="channelExport" disabled={!t.parts.length||busy} onClick={()=>exportMidi(t.parts.map(part=>({track:t,part})),t.name,true)}>导出轨道 MIDI</button></article>)}</div></section>}
    </>}<footer className="credits"><a href="https://github.com/yukinsnow" target="_blank" rel="noopener noreferrer">Github@Yukinsnow</a><span>·</span><span>Bilibili@純白</span></footer>{help&&<HelpDialog onClose={()=>setHelp(false)}/ >}{status&&<div role="status" className="status" onClick={()=>setStatus('')}>{status}</div>}{busy&&<div className="busy">处理中…</div>}
  </div>;
}
function PluginGroup({title,names}:{title:string;names:string[]}) {return <div className="pluginGroup"><h4>{title}</h4>{names.length?names.map((n,i)=><div key={i} title={n}>{n}</div>):<p>无 / 未识别</p>}</div>;}
function NotePreview({part}:{part:S1Part}){
 const notes=partRelativeNotes(part);const length=part.length||1;
 return <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">{notes.slice(0,1500).map((n,i)=><rect key={i} x={n.start/length*100} y={38-(n.pitch/127)*36} width={Math.max(.3,n.length/length*100)} height="1.1"/>)}</svg>;
}

function HelpDialog({onClose}:{onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useLayoutEffect(()=>{const d=ref.current;d?.showModal();return ()=>d?.close();},[]);
 return <dialog ref={ref} className="shortcutHelp" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-labelledby="helpTitle"><h2 id="helpTitle">SongScope 快捷键</h2><dl><div><dt>F1</dt><dd>打开 / 关闭帮助</dd></div><div><dt>F2</dt><dd>显示 / 隐藏只读 MIDI 查看区</dd></div><div><dt>F3</dt><dd>显示 / 隐藏底部混音台</dd></div><div><dt>Esc</dt><dd>关闭本帮助窗口</dd></div></dl><p>沿用 Studio One 常用布局。Mac 可能需要同时按 Fn。输入文字时不抢占快捷键；只读查看，不会修改工程。</p><p>单片段导出以片段起点归零，多片段导出保留编排位置与速度 / 拍号节点。曲线变速当前按节点阶梯近似，并显示提示。</p><button onClick={onClose}>关闭</button></dialog>;
}

function InstrumentPreset({plugin}:{plugin:PluginRef|undefined}){
 if(!plugin)return null;
 return <div className="presetBadge" title={plugin.presetNote||plugin.presetSource||'预设未识别'}><small>PRESET / 预设</small>{plugin.presetNames?.length?plugin.presetNames.map((name,i)=><div key={i}>{name}</div>):<div className="muted">未识别</div>}{plugin.presetSource&&<small>{plugin.presetSource}</small>}</div>;
}
