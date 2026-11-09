import { useCallback, useMemo, useRef, useState } from "react";
import type { S1Song, S1Track, PluginRef } from "./lib/types";
import { readSong } from "./lib/song";
import { exportPartsToMidi, importMidiInto, partNotes, type PartRef } from "./lib/midi";
import { buildDiagnostics } from "./lib/diagnostics";
import { fmtNum } from "./lib/xml";

const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : fmtNum(Number(v.toFixed ? v.toFixed(3) : v)));

type Tab = "overview" | "tracks" | "plugins" | "midi";

const TYPE_LABEL: Record<string, string> = {
  audio: "音频", instrument: "乐器", automation: "自动化",
  folder: "文件夹", bus: "总线", fx: "FX", unknown: "其他",
};

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
  const [song, setSong] = useState<S1Song | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [pickedPartIds, setPickedPartIds] = useState<Set<string>>(new Set());
  const [midiFile, setMidiFile] = useState<{ name: string; bytes: ArrayBuffer } | null>(null);
  const [importTrackId, setImportTrackId] = useState<string>("");
  const [importStart, setImportStart] = useState("0");
  const [importName, setImportName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const midiInput = useRef<HTMLInputElement>(null);

  const openSong = useCallback(async (name: string, data: ArrayBuffer) => {
    setBusy("正在解析工程…");
    setError(null);
    try {
      const parsed = await readSong(name, data);
      setSong(parsed);
      setSelectedId(parsed.tracks[0]?.id ?? null);
      setImportTrackId(parsed.tracks.find((t) => t.type === "instrument")?.id ?? parsed.tracks[0]?.id ?? "");
      setPickedPartIds(new Set());
      setTab("overview");
    } catch (e) {
      setSong(null);
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!/\.song$/i.test(file.name)) {
      setError("请选择 .song 文件（Studio One / Fender Studio Pro 工程）");
      return;
    }
    await openSong(file.name, await file.arrayBuffer());
  }, [openSong]);

  const pickSong = async () => {
    if (window.s1?.openSong) {
      const r = await window.s1.openSong();
      if (r) await openSong(r.name, new Uint8Array(r.data).buffer);
    } else {
      fileInput.current?.click();
    }
  };

  const selected = useMemo(() => song?.tracks.find((t) => t.id === selectedId) ?? null, [song, selectedId]);

  const totalParts = useMemo(() => song?.tracks.reduce((n, t) => n + t.parts.length, 0) ?? 0, [song]);

  const visibleTracks = useMemo(() => {
    if (!song) return [];
    const q = filter.trim().toLowerCase();
    return q ? song.tracks.filter((t) => t.name.toLowerCase().includes(q)) : song.tracks;
  }, [song, filter]);

  const pluginUsage = useMemo(() => {
    const map = new Map<string, { plugin: PluginRef; tracks: string[] }>();
    for (const p of song?.plugins ?? []) map.set(p.name.toLowerCase(), { plugin: p, tracks: [] });
    for (const t of song?.tracks ?? []) {
      for (const p of t.plugins) {
        const key = p.name.toLowerCase();
        const cur = map.get(key) ?? { plugin: p, tracks: [] };
        if (!cur.tracks.includes(t.name)) cur.tracks.push(t.name);
        map.set(key, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.tracks.length - a.tracks.length || a.plugin.name.localeCompare(b.plugin.name));
  }, [song]);

  const allParts = useMemo<PartRef[]>(() => {
    if (!song) return [];
    return song.tracks.flatMap((track) => track.parts.map((part) => ({ track, part })));
  }, [song]);

  const selectedParts = useMemo(() => allParts.filter((r) => r.part.clipId && pickedPartIds.has(r.part.clipId)), [allParts, pickedPartIds]);

  const togglePart = (id: string | null) => {
    if (!id) return;
    setPickedPartIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const doExport = async (refs: PartRef[], label: string) => {
    if (!song) return;
    if (!refs.length) return flash("先勾选至少一个 MIDI 片段");
    setBusy("正在生成 MIDI…");
    try {
      const notes = refs.reduce((n, r) => n + partNotes(r.part).length, 0);
      if (!notes) {
        flash("这些片段里没有可识别的音符数据，已生成空 MIDI 供格式诊断");
      }
      const bytes = exportPartsToMidi(refs, { merge: false, tempo: song.tempo });
      const saved = await saveFile(label.replace(/[\\/:*?"<>|]/g, "_") + ".mid", bytes, "audio/midi");
      setToast("已导出 " + refs.length + " 个片段（" + notes + " 个音符）" + (saved ? " → " + saved : ""));
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    if (!song || !midiFile) return flash("先选择一个 .mid 文件");
    if (!importTrackId) return flash("先选择目标轨道");
    setBusy("正在写入工程…");
    try {
      const res = await importMidiInto(song, midiFile.bytes, {
        targetTrackId: importTrackId,
        startTick: Number(importStart) || 0,
        partName: importName || undefined,
      });
      const saved = await saveFile(res.fileName, res.bytes);
      setToast("已写入 " + res.noteCount + " 个音符" + (saved ? " → " + saved : "") + (res.warnings.length ? "；" + res.warnings[0] : ""));
      // Re-parse the edited archive so the new part shows up immediately.
      try {
        const bytes = res.bytes as Uint8Array;
        const reloaded = await readSong(res.fileName, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
        setSong(reloaded);
        setPickedPartIds(new Set());
        setSelectedId(importTrackId);
        setImportTrackId(importTrackId);
      } catch { /* keep old view; file already saved */ }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doDiagnostics = async () => {
    if (!song) return;
    setBusy("正在生成诊断报告…");
    try {
      const report = await buildDiagnostics(song);
      await saveFile(song.fileName.replace(/\.song$/i, "") + "-diagnostics.json", new TextEncoder().encode(report), "application/json");
      setToast("诊断报告已导出");
    } finally {
      setBusy(null);
    }
  };

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  if (!song) {
    return (
      <div
        className={"landing" + (dragging ? " dragging" : "")}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
      >
        <input ref={fileInput} type="file" accept="*/*" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <div className="logo">S1<span>TOOLBOX</span></div>
        <h1>拆开你的 Studio One 工程</h1>
        <p className="sub">本地解析 .song 压缩包 · 轨道 / 插件 / MIDI 片段一目了然。文件不会上传。</p>
        <button className="primary" onClick={pickSong} disabled={!!busy}>打开 .song 文件</button>
        <p className="hint">也可以直接把 .song 拖进来</p>
        {busy && <p className="busy">{busy}</p>}
        {error && <div className="error">{error}</div>}
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">S1<span>TOOLBOX</span></div>
        <div className="filemeta">
          <strong>{song.songTitle || song.fileName}</strong>
          <span>{song.fileName}</span>
        </div>
        <div className="stats">
          <Stat label="轨道" value={song.tracks.filter((t) => t.type !== "folder").length} />
          <Stat label="插件" value={song.plugins.length} />
          <Stat label="片段" value={totalParts} />
          {song.tempo && <Stat label="BPM" value={fmtNum(song.tempo)} />}
        </div>
        <button className="ghost" onClick={pickSong}>换一个文件</button>
      </header>

      <div className="body">
        <aside className="sidebar">
          <input className="search" placeholder="搜索轨道…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="tracklist">
            {visibleTracks.map((t) => (
              <button
                key={t.id || t.name}
                className={"trackRow" + (t.id === selectedId ? " active" : "")}
                style={{ paddingLeft: 10 + t.depth * 14 }}
                onClick={() => setSelectedId(t.id)}
              >
                <i className="dot" style={{ background: t.color || "#5c6370" }} />
                <span className={"tname" + (t.type === "folder" ? " folder" : "")}>{t.name}</span>
                {t.parts.length > 0 && <em>{t.parts.length}</em>}
                <span className={"badge t-" + t.type}>{TYPE_LABEL[t.type]}</span>
              </button>
            ))}
            {!visibleTracks.length && <p className="empty">没有匹配的轨道</p>}
          </div>
        </aside>

        <main className="main">
          <nav className="tabs">
            {(["overview", "tracks", "plugins", "midi"] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {({ overview: "概览", tracks: "轨道详情", plugins: "插件", midi: "MIDI 片段" } as Record<Tab, string>)[t]}
              </button>
            ))}
            <span className="spacer" />
            <button className="ghost small" onClick={doDiagnostics}>导出格式诊断</button>
          </nav>

          {song.warnings.length > 0 && tab !== "midi" && (
            <div className="warnbox">{song.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
          )}

          <div className="content">
            {tab === "overview" && (
              <div className="overview">
                <section className="cards">
                  <Card title="工程信息">
                    <KV k="文件" v={song.fileName} />
                    <KV k="标题" v={song.songTitle || "—"} />
                    <KV k="速度" v={song.tempo ? fmtNum(song.tempo) + " BPM" : "未识别"} />
                    <KV k="拍号" v={song.timeSignature || "未识别"} />
                    <KV k="压缩包条目" v={song.zipEntries.length + " 个"} />
                  </Card>
                  <Card title="结构">
                    <KV k="轨道" v={song.tracks.filter((t) => t.type !== "folder").length + " 条"} />
                    <KV k="文件夹" v={song.folders.length + " 个"} />
                    <KV k="MIDI 片段" v={totalParts + " 个"} />
                    <KV k="乐器插件" v={pluginUsage.filter((p) => p.plugin.format === "instrument").length + " 个"} />
                    <KV k="效果插件" v={pluginUsage.filter((p) => p.plugin.format === "effect").length + " 个"} />
                  </Card>
                  <Card title="插件 Top">
                    {pluginUsage.slice(0, 6).map((p) => (
                      <KV key={p.plugin.name} k={p.plugin.name} v={p.tracks.length ? p.tracks.length + " 轨" : "已加载"} />
                    ))}
                    {!pluginUsage.length && <p className="empty">未识别到插件</p>}
                  </Card>
                </section>
                <section className="panel">
                  <h3>压缩包内容</h3>
                  <div className="entrygrid">
                    {song.zipEntries.map((e) => <code key={e}>{e}</code>)}
                  </div>
                </section>
              </div>
            )}

            {tab === "tracks" && (
              <div className="trackdetail">
                {selected ? <TrackDetail track={selected} /> : <p className="empty">从左侧选择一条轨道</p>}
              </div>
            )}

            {tab === "plugins" && (
              <div className="panel">
                <h3>工程内插件（{pluginUsage.length}）</h3>
                <div className="tableWrap"><table className="grid pluginTable">
                  <thead><tr><th>插件</th><th>类型</th><th>分类</th><th>厂商</th><th>使用轨道</th></tr></thead>
                  <tbody>
                    {pluginUsage.map(({ plugin, tracks }) => (
                      <tr key={plugin.name}>
                        <td className="strong">{plugin.name}</td>
                        <td>{plugin.format === "instrument" ? "乐器" : plugin.format === "effect" ? "效果" : "未知"}</td>
                        <td className="dim">{[plugin.category, plugin.subCategory].filter(Boolean).join(" / ") || "—"}</td>
                        <td className="dim">{plugin.vendor || (plugin.native ? "PreSonus (Native)" : "—")}</td>
                        <td className="dim">{tracks.join("、") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                {!pluginUsage.length && <p className="empty">没有解析到插件信息</p>}
              </div>
            )}

            {tab === "midi" && (
              <div className="midi">
                <section className="panel">
                  <div className="panelhead">
                    <h3>MIDI 片段 · 导出</h3>
                    <div className="actions">
                      <button className="ghost small" onClick={() => setPickedPartIds(new Set(allParts.map((r) => r.part.clipId!).filter(Boolean)))}>全选</button>
                      <button className="ghost small" onClick={() => setPickedPartIds(new Set())}>清空</button>
                      <button className="primary small" onClick={() => doExport(selectedParts, song.fileName.replace(/\.song$/i, "") + "-parts")}>
                        导出所选 .mid
                      </button>
                    </div>
                  </div>
                  <p className="note">勾选片段后导出为标准 MIDI 文件。音频事件不参与导出；没有音符数据的片段会导出为空轨。</p>
                  <div className="tableWrap"><table className="grid midiTable">
                    <thead><tr><th></th><th>片段</th><th>轨道</th><th>起点</th><th>长度</th><th>音符</th><th></th></tr></thead>
                    <tbody>
                      {allParts.map((r, i) => (
                        <tr key={(r.part.clipId || "p") + i} className={pickedPartIds.has(r.part.clipId || "") ? "picked" : ""}>
                          <td><input type="checkbox" checked={!!r.part.clipId && pickedPartIds.has(r.part.clipId)} onChange={() => togglePart(r.part.clipId)} /></td>
                          <td className="strong">{r.part.name}</td>
                          <td className="dim">{r.track.name}</td>
                          <td>{num(r.part.start)}</td>
                          <td>{num(r.part.length)}</td>
                          <td>{r.part.noteCount || "—"}</td>
                          <td><button className="mini" onClick={() => doExport([r], (r.track.name + "-" + r.part.name))}>导出</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                  {!allParts.length && <p className="empty">这个工程里没有 MIDI 片段（可能是纯音频工程）</p>}
                </section>

                <section className="panel">
                  <h3>把 MIDI 导入工程</h3>
                  <p className="note">
                    选择 .mid → 目标轨道 → 写入。会克隆该轨道已有片段的内部结构，只替换音符；结果另存为 <code>-edited.song</code>，不会覆盖原文件。
                  </p>
                  <div className="importrow">
                    <input ref={midiInput} type="file" accept=".mid,.midi" hidden onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) { setMidiFile({ name: f.name, bytes: await f.arrayBuffer() }); setImportName(f.name.replace(/\.midi?$/i, "")); }
                    }} />
                    <button className="ghost" onClick={() => midiInput.current?.click()}>{midiFile ? "更换 MIDI" : "选择 .mid 文件"}</button>
                    <span className="dim">{midiFile?.name || "未选择"}</span>
                  </div>
                  <div className="importgrid">
                    <label>目标轨道
                      <select value={importTrackId} onChange={(e) => setImportTrackId(e.target.value)}>
                        {song.tracks.filter((t) => t.type !== "folder").map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>起点（tick）
                      <input value={importStart} onChange={(e) => setImportStart(e.target.value)} inputMode="numeric" />
                    </label>
                    <label>片段名称
                      <input value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="Imported MIDI" />
                    </label>
                  </div>
                  <button className="primary" disabled={!midiFile} onClick={doImport}>导入并另存为新工程</button>
                </section>
              </div>
            )}
          </div>
        </main>
      </div>

      {busy && <div className="overlay"><div className="spinner" />{busy}</div>}
      {toast && <div className="toast fixed">{toast}</div>}
      {error && <div className="error fixed" onClick={() => setError(null)}>{error}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <div className="stat"><b>{value}</b><span>{label}</span></div>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card"><h4>{title}</h4>{children}</div>;
}

function KV({ k, v }: { k: string; v: string }) {
  return <div className="kv"><span>{k}</span><b>{v}</b></div>;
}

function TrackDetail({ track }: { track: S1Track }) {
  return (
    <div className="panel">
      <div className="trackhead">
        <i className="dot big" style={{ background: track.color || "#5c6370" }} />
        <h2>{track.name}</h2>
        <span className={"badge t-" + track.type}>{TYPE_LABEL[track.type]}</span>
      </div>
      <div className="cards">
        <Card title="轨道属性">
          <KV k="类型" v={track.element.tagName + (track.mediaType ? " · " + track.mediaType : "")} />
          <KV k="trackID" v={track.id || "—"} />
          <KV k="channelID" v={track.channelId || "—"} />
          <KV k="父文件夹" v={track.parentFolderId || "—"} />
        </Card>
        <Card title="乐器">
          <KV k="加载" v={track.instrument || "无 / 未识别"} />
          <KV k="片段数" v={String(track.parts.length)} />
        </Card>
        <Card title="插件链">
          {track.plugins.map((p) => <KV key={p.name} k={p.name} v={(p.format === "instrument" ? "乐器" : "效果") + (p.native ? " · Native" : "")} />)}
          {!track.plugins.length && <p className="empty">无</p>}
        </Card>
      </div>
      <h3>MIDI 片段</h3>
      <div className="tableWrap"><table className="grid partTable">
        <thead><tr><th>名称</th><th>clipID</th><th>起点</th><th>长度</th><th>音符</th></tr></thead>
        <tbody>
          {track.parts.map((p, i) => (
            <tr key={i}>
              <td className="strong">{p.name}</td>
              <td className="dim mono">{p.clipId || "—"}</td>
              <td>{num(p.start)}</td>
              <td>{num(p.length)}</td>
              <td>{p.noteCount || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {!track.parts.length && <p className="empty">这条轨道没有 MIDI 片段</p>}
    </div>
  );
}
