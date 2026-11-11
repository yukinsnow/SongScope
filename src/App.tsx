import { t as tr } from "./i18n";
import { useRef, useState, useMemo, useLayoutEffect, useEffect } from "react";
import type { S1Song, S1Track, S1Part, S1AudioEvent, PluginRef } from "./lib/types";
import { buildBars, formatPosition } from "./lib/timing";
import PianoRoll from "./components/PianoRoll";
import CompatibilityExport from "./components/CompatibilityExport";
import { exportCompatibleSong, type CompatibilityTarget } from "./lib/compatibility";
import { readSong } from "./lib/song";
import { exportPartsToMidi, partRelativeNotes, type PartRef } from "./lib/midi";

function instrumentPreset(track: S1Track) {
  const p = track.plugins.find(p => p.format === "instrument");
  return p?.preset || (p?.presetEncrypted ? tr("加密音源无法读取") : p?.presetEmpty ? tr("未加载音源") : "");
}

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
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return null;
    /* Unsupported sharing falls through to download. */
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
  const [inspectedKey,setInspectedKey]=useState('');
  const [audioSelection,setAudioSelection]=useState<{track:S1Track;event:S1AudioEvent}|null>(null);
  const toggleEditor=()=>{setEditor(v=>!v);setMixer(false);setView('arrange');};
  const toggleMixer=()=>{setMixer(v=>!v);setEditor(false);};
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
      else if(song){if(e.key==='F2')toggleEditor();else toggleMixer();}
    };
    window.addEventListener('keydown',onKey,true);return ()=>window.removeEventListener('keydown',onKey,true);
  },[song]);
  const input=useRef<HTMLInputElement>(null);
  const load=async(name:string,data:ArrayBuffer)=>{
    setBusy(true);setStatus(tr("正在读取歌曲…"));
    try {const s=await readSong(name,data);setSong(s);setView('overview');setPicked(new Set());setSelected('');setInspectedKey('');setAudioSelection(null);setStatus('');}
    catch(e){setStatus((e as Error).message);}finally{setBusy(false);}
  };
  const file=async(f:File)=>{if(!/\.song$/i.test(f.name)){setStatus(tr("请选择 .song 工程"));return;}await load(f.name,await f.arrayBuffer());};
  const open=async()=>{if(window.s1?.openSong){const r=await window.s1.openSong();if(r)await load(r.name,new Uint8Array(r.data).buffer);}else input.current?.click();};
  const all=useMemo(()=>song?.tracks.flatMap(t=>t.parts.map((p,i)=>({track:t,part:p,key:t.id+':'+i})))??[],[song]);
  const tracks=song?.tracks.filter(t=>t.name.toLowerCase().includes(query.toLowerCase()))??[];
  const refs=all.filter(r=>picked.has(r.key));
  const end=Math.max(64,...all.map(r=>(r.part.start??0)+(r.part.length??0)),...(song?.tracks.flatMap(t=>t.audioEvents.filter(e=>e.start!==null&&e.length!==null).map(e=>e.start!+e.length!))??[]),...(song?.tempoMap.map(e=>e.beat)??[]),...(song?.meterMap.map(e=>e.beat)??[]));
  const barMarks=useMemo(()=>buildBars(song?.meterMap??[],end),[song,end]);
  const width=(barMarks.at(-1)?.beat??end+8)*zoom;
  const barGrid=`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="1"><path d="${barMarks.map(b=>`M${b.beat*zoom} 0V1`).join('')}" stroke="#46545b66"/></svg>`)}")`;
  const position=(beat:number)=>formatPosition(beat,barMarks);
  const activePart=all.find(r=>r.track.id===selected&&r.key===inspectedKey)??all.find(r=>r.track.id===selected&&picked.has(r.key))??all.find(r=>r.track.id===selected)??(!selected?all[0]:undefined);
  const exportMidi=async(parts:PartRef[],label:string,arrange=false)=>{
    if(!song||!parts.length)return;
    try{setBusy(true);const data=exportPartsToMidi(parts,{tempo:song.tempo,tempoMap:song.tempoMap,meterMap:song.meterMap,arrange:arrange||parts.length>1});const saved=await saveFile(label.replace(/[\\/:*?"<>|]/g,'_')+'.mid',data,'audio/midi');setStatus(saved?(tr("已导出 MIDI")+(song.tempoMap.some(e=>e.curveType!==0)?tr(" · 曲线变速按节点阶梯近似"):'')):tr("已取消导出"));}catch(e){setStatus(tr("导出失败：")+(e as Error).message);}finally{setBusy(false);}
  };
  const exportCompatibility=async(target:CompatibilityTarget)=>{
    if(!song)return;
    setBusy(true);setStatus(tr("正在生成兼容副本…"));
    try {
      const result=await exportCompatibleSong(song,target);
      const saved=await saveFile(result.fileName,result.data,'application/x.presonus-song');
      setStatus(saved?tr("兼容副本已导出，请在目标软件中验证。"):tr("已取消导出"));
    } catch(e) {setStatus(tr("导出失败：")+(e as Error).message);}
    finally {setBusy(false);}
  };
  const toggle=(key:string)=>setPicked(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n;});
  const trackClick=(t:S1Track)=>{selectTrack(t.id);setView('arrange');requestAnimationFrame(()=>document.getElementById('track-'+t.id)?.scrollIntoView({block:'nearest'}));};
  return <div className={song?'app':'landing'} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)file(f);}}>
    <input hidden type="file" accept=".song,application/zip" ref={input} onChange={e=>{const f=e.target.files?.[0];if(f)file(f);e.target.value='';}}/>
    {!song?<div className="welcome"><div className="heroLogo"><img src="./brand/songscope-logo.png" alt="SongScope"/></div><div className="eyebrow">{tr("Studio One / Fender Studio Pro 工程查看器")}</div><h1>{tr("每一首歌，都有自己的结构。")}</h1><p>{tr("打开 Studio One / Fender Studio Pro 工程，浏览轨道、MIDI 与插件。")}</p><p className="productAlias">{tr("Studio One 与 Fender Studio Pro 是同一软件产品线，统一支持 .song 工程。")}</p><button className="primary" disabled={busy} onClick={open}>{tr("打开 .song 文件")}</button><p className="muted">{tr("也可拖放文件 · 本地解析 · 只读浏览")}</p><section className="privacyNotice"><h2>{tr("隐私与免责声明")}</h2><p>{tr("工程文件及其中的数据均在设备本地离线处理，不会以任何形式上传；不收集工程内容或素材路径。首次访问和更新网页时仅下载应用资源。")}</p><p>{tr("本工具为非官方工程查看与兼容导出工具，与 PreSonus / Fender 无关联。解析与转换结果可能存在误差，请以原软件为准，并保留工程备份。")}</p></section></div>:<>
      <header><div className="brand logoBrand" title={tr("SongScope — Studio One / Fender Studio Pro 工程查看器")}><img src="./brand/songscope-logo.png" alt="SongScope"/></div><div className="headerTitle">{song.songTitle||song.fileName}</div><span className="readonly">{tr("只读工程")}</span><button onClick={open} disabled={busy}>{tr("打开歌曲")}</button></header>
      <nav className="toolbar"><div className="switch"><button className={view==='overview'?'active':''} onClick={()=>setView('overview')}>{tr("歌曲信息")}</button><button className={view==='arrange'?'active':''} onClick={()=>setView('arrange')}>{tr("编排 / 走带")}</button></div><div className="utilityButtons"><button onClick={()=>setHelp(true)}>{tr("F1 帮助")}</button><button className={editor?'active':''} onClick={toggleEditor}>F2 MIDI</button></div><span className="muted desktop">{song.tempo?.toFixed(0)} BPM · {song.timeSignature} · {song.tracks.filter(t=>t.type!=='folder').length} {tr(" 轨")}</span><button className={mixer?'active':''} onClick={toggleMixer} aria-expanded={mixer}>{tr("F3 通道 / 插件 ")}{mixer?'▾':'▴'}</button></nav>
      <div className="workspace">
        {view==='overview'?<div className="overview">
          <aside className="overviewTracks"><div className="sectionLabel">TRACKS <span>{song.tracks.filter(t=>t.type!=='folder').length}</span></div><input placeholder={tr("搜索轨道")} value={query} onChange={e=>setQuery(e.target.value)}/>{tracks.map((t,i)=><button className="trackName" key={t.id} onClick={()=>trackClick(t)} style={{borderLeftColor:t.color||'#6bafaa',paddingLeft:12+t.depth*10}}><small>{String(i+1).padStart(2,'0')}</small><span>{t.name}</span></button>)}</aside>
          <main className="songInfo"><div className="eyebrow">SONG OVERVIEW</div>{song.artwork?<img className="artwork" src={song.artwork} alt={tr("歌曲封面")}/>:<div className="artwork noArtwork">♫<small>{tr("暂无工程封面")}</small></div>}<h1>{song.songTitle||song.fileName.replace(/\.song$/i,'')}</h1><p className="artist">{song.metadata['Media:Artist']||song.metadata['Document:Creator']||tr("未知创作者")}</p><div className="songStats"><div><b>{song.tempo?.toFixed(0)||'—'}</b><small>BPM</small></div><div><b>{song.timeSignature||'—'}</b><small>{tr("拍号")}</small></div><div><b>{song.tracks.filter(t=>t.type!=='folder').length}</b><small>{tr("轨道")}</small></div></div><dl>{[[tr("风格"),song.metadata['Media:Genre']],[tr("创作者"),song.metadata['Document:Creator']],[tr("调性"),song.metadata['Media:KeySignature']],[tr("制作软件"),song.projectVersion.softwareName||song.projectVersion.rawGenerator],[tr("工程保存版本"),song.projectVersion.softwareVersion],[tr("工程格式版本"),song.projectVersion.formatVersion]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||tr("未填写")}</dd></div>)}</dl><details className="timingMap"><summary>{tr("速度 / 拍号轨 · ")}{song.tempoMap.length} {tr(" 个速度节点 · ")}{song.meterMap.length} {tr(" 个拍号节点")}</summary><div className="mapLists"><div><h4>{tr("速度变化")}</h4>{song.tempoMap.map((e,i)=><p key={i}><b>{position(e.beat)}</b> {Number(e.bpm.toFixed(3))} BPM {e.curveType!==0&&<em>{tr("曲线 ")}{e.curveType}{tr("（导出阶梯近似）")}</em>}</p>)}</div><div><h4>{tr("拍号变化")}</h4>{song.meterMap.map((e,i)=><p key={i}><b>{position(e.beat)}</b> {e.numerator}/{e.denominator}</p>)}</div></div></details>{song.warnings.length>0&&<details className="timingMap"><summary>{tr("解析提示（")}{song.warnings.length}）</summary>{song.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}<button className="primary" onClick={()=>setView('arrange')}>{tr("浏览歌曲编排 →")}</button><CompatibilityExport key={song.fileName+song.projectVersion.rawGenerator} song={song} busy={busy} onExport={exportCompatibility}/></main>
          <aside className="overviewPlugins"><div className="sectionLabel">INSTRUMENTS & EFFECTS</div>{song.plugins.map((p,i)=><div className="pluginItem" key={i}><span>{p.name}</span><small>{p.format==='instrument'?tr("乐器"):tr("效果")} · {p.subCategory||p.vendor||tr("插件")}</small></div>)}</aside>
        </div>:<main className="arrangement"><div className="arrangeTools"><span>{tr("编排视图 ")}<small className="muted"> {tr(" · 点击片段选择，不可编辑")}</small></span><label>{tr("缩放 ")}<input aria-label={tr("时间线缩放")} type="range" min="2" max="24" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label></div>
          <div className="timelineScroll"><div className="timeline" style={{width:width+200}}><div className="ruler"><div className="trackHeader">{tr("轨道 / 小节")}</div><div className="rulerBars" style={{width}}>{barMarks.filter((b,i)=>i===0||(b.number-1)%Math.max(1,Math.ceil(48/(b.numerator*4/b.denominator*zoom)))===0||song.meterMap.some(m=>m.beat===b.beat)).map(b=><span key={b.beat} style={{left:b.beat*zoom}}>{b.number}</span>)}</div></div>
          <div className="mapLane"><div className="trackHeader">{tr("速度 / BPM")}</div><div className="mapContent" style={{width}}>{song.tempoMap.map((e,i)=><span key={i} title={`${tr("第 ")}${position(e.beat)}${tr(" 小节 · ")}${Number(e.bpm.toFixed(3))} BPM${e.curveType?tr(" · 曲线变速，导出阶梯近似"):''}`} style={{left:e.beat*zoom}}>{Number(e.bpm.toFixed(2))}{e.curveType?' ↝':''}</span>)}</div></div>
          <div className="mapLane"><div className="trackHeader">{tr("拍号")}</div><div className="mapContent" style={{width}}>{song.meterMap.map((e,i)=><span key={i} title={`${tr("第 ")}${position(e.beat)}${tr(" 小节")}`} style={{left:e.beat*zoom}}>{e.numerator}/{e.denominator}</span>)}</div></div>
          {tracks.map((t,i)=>{const audio=layoutAudio(t.audioEvents);return <div className={'lane '+(selected===t.id?'selected':'')} key={t.id} id={'track-'+t.id} style={{height:Math.max(72,audio.rows*66+6)}}><button className="trackHeader" style={{borderLeftColor:t.color||'#6bafaa'}} onClick={()=>selectTrack(t.id)}><small>{i+1}</small><div><strong>{t.name}</strong><small title={instrumentPreset(t)||undefined}>{(t.instrument? t.instrument+(instrumentPreset(t)?' · '+instrumentPreset(t):''):null)||(t.type==='folder'?tr("文件夹"):t.type==='audio'?tr("音频轨道"):tr("轨道"))}</small></div></button><div className="laneContent" style={{width,backgroundImage:barGrid,backgroundSize:width+'px 100%'}}>{t.parts.map((p,j)=>{const key=t.id+':'+j;return <button key={key} aria-pressed={picked.has(key)} title={`${p.name}${tr(" · 第 ")}${position(p.start??0)}${tr(" 小节 · ")}${p.noteCount}${tr(" 音符")}`} className={'clip '+(picked.has(key)?'picked':'')} style={{left:(p.start??0)*zoom,width:Math.max(3,(p.length??0)*zoom),backgroundColor:t.color||'#51b5ad'}} onClick={()=>{toggle(key);setInspectedKey(key);setAudioSelection(null);selectTrack(t.id);}}><span>{p.name}</span><NotePreview part={p}/></button>;})}{audio.clips.map(({event:e,row,index})=><button key={'audio-'+index} className={'clip audioClip '+(audioSelection?.event===e?'picked':'')} aria-pressed={audioSelection?.event===e} title={`${e.name} · ${tr('起点')} ${position(e.start!)} · ${tr('时值')} ${Number(e.length!.toFixed(3))} ${tr('拍')}\n${e.sampleName}`} style={{left:e.start!*zoom,width:Math.max(3,e.length!*zoom),top:6+row*66,backgroundColor:t.color||'#619bd0'}} onClick={()=>{setAudioSelection({track:t,event:e});selectTrack(t.id);}}><span>{e.name}</span><small>♫ {e.sampleName||tr('音频片段')}</small></button>)}{audio.unpositioned.length>0&&<details className="unpositionedAudio"><summary>{tr('无法定位的音频片段')} · {audio.unpositioned.length}</summary>{audio.unpositioned.map((e,i)=><div key={i}>{e.name}</div>)}</details>}{!t.parts.length&&!t.audioEvents.length&&<span className="laneEmpty">{t.type==='audio'?tr('无音频片段'):tr('无 MIDI 片段')}</span>}</div></div>;})}
          </div></div>{audioSelection&&<div className="audioInspector"><div><strong>{audioSelection.event.name}</strong><span>{audioSelection.event.sampleName}</span><span>{tr('起点')} {position(audioSelection.event.start??0)} · {tr('时值')} {Number((audioSelection.event.length??0).toFixed(3))} {tr('拍')}</span></div><small>{tr('仅显示位置与名称，不读取外部音频。')}</small><button aria-label={tr('关闭音频详情')} onClick={()=>setAudioSelection(null)}>×</button></div>}<div className="exportBar"><span>{refs.length?tr("已选 ")+refs.length+tr(" 个片段"):tr("点击 MIDI 块以选择")}</span><button disabled={!refs.length||busy} onClick={()=>exportMidi(refs,'selected-parts')}>{tr("导出所选")}</button><button disabled={!picked.size} onClick={()=>setPicked(new Set())}>{tr("清除")}</button><button disabled={!all.length||busy} onClick={()=>exportMidi(all,(song.songTitle||'song')+'-arrangement',true)}>{tr("导出全部（保留位置）")}</button></div></main>}
      </div>
      {editor&&<section className="midiInspector"><div className="mixerHeading"><span>{tr("F2 · MIDI 查看 ")}<small>{tr("只读，不提供编辑")}</small></span><button onClick={()=>setEditor(false)} aria-label={tr("收起 MIDI 查看")}>×</button></div>{activePart?<><div className="inspectMeta">{activePart.track.name} / {activePart.part.name} {tr(" · 起点 ")}{position(activePart.part.start??0)} · {activePart.part.noteCount} {tr(" 音符 ")}<button disabled={busy} onClick={()=>exportMidi([activePart],activePart.part.name)}>{tr("导出此片段")}</button></div><PianoRoll key={activePart.key} part={activePart.part} meterMap={song.meterMap}/></>:<p className="muted">{tr("当前轨道没有 MIDI 片段，请选择乐器轨道或 MIDI 块。")}</p>}</section>}
      {mixer&&<section className="mixer"><div className="mixerHeading"><span>CHANNELS <small>{tr("通道与插件 · 只读")}</small></span><button onClick={()=>setMixer(false)} aria-label={tr("收起通道")}>×</button></div><div className="channelScroll" ref={channelStrip}>{song.tracks.filter(t=>t.type!=='folder').map((t,i)=><article ref={node=>{if(node)channelNodes.current.set(t.id,node);else channelNodes.current.delete(t.id);}} className={'channel '+(selected===t.id?'selected':'')} key={t.id} style={{borderBottomColor:t.color||'#51b5ad'}}><button className="channelTop" onClick={()=>selectTrack(t.id)}><small>{String(i+1).padStart(2,'0')}</small><strong>{t.name}</strong></button><AudioFiles track={t}/><PluginGroup title={tr("VSTi / 乐器")} names={t.instrument?[t.instrument]:[]}/><InstrumentPreset plugin={t.plugins.find(p=>p.format==='instrument')}/><PluginGroup title={tr("插入 / INSERTS")} names={t.inserts.map(p=>p.name)}/><PluginGroup title={tr("发送 / SENDS")} names={t.sends.map(p=>p.name)}/></article>)}</div></section>}
    </>}<footer className="credits"><a href="https://github.com/yukinsnow" target="_blank" rel="noopener noreferrer">Github@Yukinsnow</a><span>·</span><span>Bilibili@純白</span></footer>{help&&<HelpDialog onClose={()=>setHelp(false)}/ >}{status&&<div role="status" className="status" onClick={()=>setStatus('')}>{status}</div>}{busy&&<div className="busy">{tr("处理中…")}</div>}
  </div>;
}
function PluginGroup({title,names}:{title:string;names:string[]}) {return <div className="pluginGroup"><h4>{title}</h4>{names.length?names.map((n,i)=><div key={i} title={n}>{n}</div>):<p>{tr("无 / 未识别")}</p>}</div>;}
function NotePreview({part}:{part:S1Part}){
 const notes=partRelativeNotes(part);const length=part.length||1;
 return <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">{notes.slice(0,1500).map((n,i)=><rect key={i} x={n.start/length*100} y={38-(n.pitch/127)*36} width={Math.max(.3,n.length/length*100)} height="1.1"/>)}</svg>;
}

function HelpDialog({onClose}:{onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useLayoutEffect(()=>{const d=ref.current;d?.showModal();return ()=>d?.close();},[]);
 return <dialog ref={ref} className="shortcutHelp" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-labelledby="helpTitle"><h2 id="helpTitle">{tr("SongScope 快捷键")}</h2><dl><div><dt>F1</dt><dd>{tr("打开 / 关闭帮助")}</dd></div><div><dt>F2</dt><dd>{tr("显示 / 隐藏只读 MIDI 查看区")}</dd></div><div><dt>F3</dt><dd>{tr("显示 / 隐藏底部混音台")}</dd></div><div><dt>Esc</dt><dd>{tr("关闭本帮助窗口")}</dd></div></dl><p>{tr("沿用 Studio One 常用布局。Mac 可能需要同时按 Fn。输入文字时不抢占快捷键；只读查看，不会修改工程。")}</p><p>{tr("单片段导出以片段起点归零，多片段导出保留编排位置与速度 / 拍号节点。曲线变速当前按节点阶梯近似，并显示提示。")}</p><button onClick={onClose}>{tr("关闭")}</button></dialog>;
}

function InstrumentPreset({plugin}:{plugin:PluginRef|undefined}){
 if(!plugin)return null;
 return <div className="presetBadge" title={plugin.presetNote||plugin.presetSource||tr("预设未识别")}><small>{tr("PRESET / 预设")}</small>{plugin.presetNames?.length?plugin.presetNames.map((name,i)=><div key={i}>{name}</div>):<div className="muted">{tr(plugin.presetEncrypted?"加密音源无法读取":plugin.presetEmpty?"未加载音源":"未识别")}</div>}{plugin.presetSource&&<small>{plugin.presetSource}</small>}</div>;
}

function AudioFiles({track}:{track:S1Track}) {
 if(!track.audioFiles.length)return null;
 return <details className="audioFiles"><summary>{tr("音频素材")} · {track.audioFiles.length}</summary>{track.audioFiles.map((f,i)=><div key={i}><strong>{f.name||tr("未命名素材")}</strong>{f.eventName&&f.eventName!==f.name&&<small>{f.eventName}</small>}<code>{f.path||tr("工程未保存素材路径")}</code></div>)}<p>{tr("仅显示工程保存的引用；不读取外部素材，不提供音频导出。")}</p></details>;
}

/** Stack overlapping occurrences instead of hiding one source behind another. */
function layoutAudio(events:S1AudioEvent[]) {
 const ends:number[]=[];
 const clips=events.map((event,index)=>({event,index})).filter(({event:e})=>e.start!==null&&e.length!==null).sort((a,b)=>a.event.start!-b.event.start!).map(item=>{
  let row=ends.findIndex(end=>end<=item.event.start!+1e-8);
  if(row<0)row=ends.length;
  ends[row]=item.event.start!+item.event.length!;
  return {...item,row};
 });
 return {clips,rows:Math.max(1,ends.length),unpositioned:events.filter(e=>e.start===null||e.length===null)};
}
