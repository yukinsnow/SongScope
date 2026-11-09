import JSZip from "jszip";
import type { PluginRef, S1Part, S1Song, S1Track, TrackType } from "./types";
import {
  attr, byXid, child, childByXid, children, descendants, firstByXid, kids,
  parseXml, s1Color, xid,
} from "./xml";
import { extractPresetNames } from "./presets";
import { readTimeMaps } from "./timing";
import { decodeMusicx } from "./musicx";

const XML_ENTRIES = [
  "Song/song.xml",
  "Song/mediapool.xml",
  "Devices/audiomixer.xml",
  "Devices/musictrackdevice.xml",
  "Devices/audiosynthfolder.xml",
  "Devices/mixerconsole.xml",
  "Devices/effectrack.xml",
  "metainfo.xml",
];

export async function readSong(fileName: string, data: ArrayBuffer): Promise<S1Song> {
  const zip = await JSZip.loadAsync(data);
  const entries = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const warnings: string[] = [];
  const xmlDocs: Record<string, Document> = {};

  const readXml = async (name: string): Promise<Document | null> => {
    const exact = zip.file(name);
    const f = exact ?? Object.keys(zip.files).map((n) => ({ n, f: zip.files[n] })).find((x) => x.n.toLowerCase() === name.toLowerCase())?.f;
    if (!f) return null;
    try {
      const doc = parseXml(await f.async("text"));
      xmlDocs[name] = doc;
      return doc;
    } catch (e) {
      warnings.push(name + ": " + (e as Error).message);
      return null;
    }
  };

  await Promise.all(XML_ENTRIES.map((n) => readXml(n)));

  const songDoc = xmlDocs["Song/song.xml"];
  if (!songDoc) {
    throw new Error("这不是有效的 .song：压缩包内找不到 Song/song.xml（文件可能是旧版二进制格式）");
  }

  const metadata: Record<string, string> = {};
  for (const el of Array.from(xmlDocs["metainfo.xml"]?.getElementsByTagName("Attribute") ?? [])) {
    const key = attr(el, "id");
    if (key) metadata[key] = attr(el, "value") ?? "";
  }
  const artPath = metadata["Media:Artwork"] || entries.find(n => /(^|\/)artwork\.(png|jpe?g|webp)$/i.test(n));
  const artEntry = artPath ? findZipEntry(zip, artPath) : null;
  const artwork = artEntry ? "data:image/" + (/\.png$/i.test(artPath!) ? "png" : /\.webp$/i.test(artPath!) ? "webp" : "jpeg") + ";base64," + await artEntry.async("base64") : null;
  let songTitle = attr(songDoc.documentElement, "name", "title");
  if (!songTitle) {
    const meta = xmlDocs["metainfo.xml"];
    if (meta) {
      for (const el of Array.from(meta.getElementsByTagName("*"))) {
        if ((xid(el) ?? "").includes("Document:Title")) {
          songTitle = attr(el, "value", "text");
          if (songTitle) break;
        }
      }
    }
  }
  const initial = readTempo(songDoc);
  const {tempoMap,meterMap}=readTimeMaps(songDoc,initial.tempo,initial.timeSignature);
  const tempo=tempoMap[0].bpm, timeSignature=meterMap[0].numerator+"/"+meterMap[0].denominator;
  if(tempoMap.some(e=>e.curveType!==0))warnings.push("检测到曲线变速：已保留原始节点与曲线类型；当前 MIDI 导出按节点阶梯近似，尚未还原连续曲线。");
  const mediaPool = readMediaPool(xmlDocs["Song/mediapool.xml"]);

  // ---------- tracks ----------
  const trackList = findTrackList(songDoc);
  const tracks: S1Track[] = [];
  if (trackList) {
    const SKIP = new Set(["MarkerTrack", "ChordTrack", "ArrangerTrack", "LyricsTrack", "VideoTrack"]);
    for (const el of kids(trackList)) {
      if (!/Track$/.test(el.tagName)) continue;
      if (SKIP.has(el.tagName)) continue;
      const track = readTrack(el);
      tracks.push(track);
    }
  } else {
    // Fallback: any MediaTrack/FolderTrack in document order.
    for (const el of Array.from(songDoc.getElementsByTagName("*"))) {
      if (/^(MediaTrack|FolderTrack|AutomationTrack)$/.test(el.tagName)) tracks.push(readTrack(el));
    }
    warnings.push("未找到 List[x:id=Tracks]，已回退到全文档扫描。");
  }

  // ---------- MIDI content (.musicx) ----------
  for (const t of tracks) {
    for (const p of t.parts) {
      if (!p.clipId) continue;
      const url = mediaPool.get(p.clipId);
      if (!url) continue;
      const path = url.replace(/^media:\/+/, "").replace(/^\/+/, "");
      p.mediaPath = path;
      const entry = findZipEntry(zip, path);
      if (!entry) {
        warnings.push("缺少 MIDI 数据文件: " + path);
        continue;
      }
      try {
        const doc = decodeMusicx(await entry.async("uint8array"));
        p.notes = doc.events;
        p.noteCount = doc.events.length;
      } catch (e) {
        warnings.push(path + ": " + (e as Error).message);
      }
    }
  }

  // ---------- plugin model ----------
  const instruments = readInstruments(xmlDocs["Devices/audiosynthfolder.xml"]);
  for(const entry of instruments){
    const p=entry.plugin,path=p.presetPath;
    p.presetNames=[];p.presetSource=null;
    if(!path){p.presetNote="工程未保存插件状态路径";continue;}
    const file=findZipEntry(zip,path.replace(/^media:\/+/,''));
    if(!file){p.presetNote="工程中缺少对应插件状态文件";continue;}
    const size=(file as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize;
    if(size&&size>32*1024*1024){p.presetNote="插件状态超过 32MB，未提取预设";continue;}
    try{
      const result=extractPresetNames(await file.async("uint8array"),p.name);
      p.presetNames=result.names;p.preset=result.names[0]??null;p.presetSource=result.source;p.presetNote=result.note;
    }catch{p.presetNote="无法读取插件状态文件";}
  }
  const channelEffects = readChannelEffects(xmlDocs["Devices/audiomixer.xml"]);
  const channels = readMusicChannels(xmlDocs["Devices/musictrackdevice.xml"]);

  for (const t of tracks) {
    const ch = channels.find((c) => c.uid && c.uid === t.channelId);
    let entry: InstrumentEntry | null = null;
    if (ch?.instrumentOutObjectID) {
      entry = instruments.find((i) => i.uniqueId === ch.instrumentOutObjectID || i.channelIds.includes(ch.instrumentOutObjectID!)) ?? null;
    }
    if (!entry && ch?.instrumentOutName) {
      entry = instruments.find((i) => i.plugin.name.toLowerCase() === ch.instrumentOutName!.toLowerCase()) ?? null;
    }
    if (!entry && t.channelId) {
      entry = instruments.find((i) => i.uniqueId === t.channelId) ?? null;
    }
    t.instrument = entry?.plugin.name ?? ch?.instrumentOutName ?? null;
    t.plugins = [];
    if (entry) t.plugins.push(entry.plugin);
    else if (ch?.instrumentOutName) {
      t.plugins.push({ name: ch.instrumentOutName, format: "instrument", preset: null });
    }
    const fx = t.channelId ? channelEffects.get(t.channelId) : undefined;
    if (fx) t.plugins.push(...fx);
    const mixerId = ch?.instrumentOutObjectID || t.channelId;
    const mixerFx = mixerId ? channelEffects.get(mixerId) : undefined;
    if (mixerFx && mixerId !== t.channelId) t.plugins.push(...mixerFx);
    t.inserts = t.plugins.filter(p => p.category === "Inserts");
    t.sends = t.plugins.filter(p => p.category === "Sends");
  }

  // Folder depth + ordering
  const byId = new Map(tracks.filter((t) => t.id).map((t) => [t.id, t]));
  for (const t of tracks) {
    let d = 0, p = t.parentFolderId ? byId.get(t.parentFolderId) : undefined;
    const guard = new Set<string>();
    while (p && d < 20 && !guard.has(p.id)) {
      guard.add(p.id);
      d++;
      p = p.parentFolderId ? byId.get(p.parentFolderId) : undefined;
    }
    t.depth = d;
  }

  // Plugins referenced elsewhere (song.xml / mediapool.xml) are still "in the project".
  const extras: PluginRef[] = [];
  for (const [name, doc] of Object.entries(xmlDocs)) {
    if (name === "Devices/audiomixer.xml" || name === "Devices/audiosynthfolder.xml") continue;
    for (const ghost of Array.from(doc.getElementsByTagName("*"))) {
      if (xid(ghost) !== "ghostData") continue;
      const ci = readClassInfo(ghost);
      if (ci.name) extras.push({ ...ci, format: "unknown", preset: null } as PluginRef);
    }
  }
  const plugins = dedupePlugins([
    ...instruments.map((i) => i.plugin),
    ...[...channelEffects.values()].flat(),
    ...extras,
  ]);
  if (!plugins.length) {
    warnings.push("没有解析到任何插件；工程可能为空，或使用了未知的设备结构。");
  }

  return {
    fileName,
    zipEntries: entries,
    tracks,
    folders: tracks.filter((t) => t.type === "folder"),
    plugins,
    tempo,
    timeSignature,
    tempoMap, meterMap,
    songTitle: metadata["Document:Title"] || songTitle,
    metadata, artwork,
    mediaPool,
    warnings,
    xmlDocs,
    zip,
  };
}

function findTrackList(doc: Document): Element | null {
  for (const el of Array.from(doc.getElementsByTagName("List"))) {
    if (xid(el) === "Tracks") return el;
  }
  // Some versions nest the id differently
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    if (el.tagName === "List" && /track/i.test(xid(el) ?? "")) return el;
  }
  return null;
}

function readTrack(el: Element): S1Track {
  const mediaType = attr(el, "mediaType");
  let type: TrackType = "unknown";
  if (el.tagName === "FolderTrack") type = "folder";
  else if (el.tagName === "AutomationTrack") type = "automation";
  else if (el.tagName === "BusTrack") type = "bus";
  else if (el.tagName === "FxTrack") type = "fx";
  else if (mediaType) {
    const m = mediaType.toLowerCase();
    if (m.includes("music") || m.includes("midi") || m.includes("inst")) type = "instrument";
    else if (m.includes("audio")) type = "audio";
    else if (m.includes("bus")) type = "bus";
    else if (m.includes("fx")) type = "fx";
  } else {
    const hasInstrument = !!el.querySelector("Connections, Instrument");
    type = hasInstrument ? "instrument" : "audio";
  }

  const channelEl = kids(el).find((k) => k.tagName === "UID" && xid(k) === "channelID")
    ?? firstByXid(el, "channelID", "UID");
  const parts: S1Part[] = descendants(el, "MusicPart").map((p) => ({
    clipId: attr(p, "clipID", "id"),
    name: attr(p, "name") ?? "Part",
    start: numAttr(p, "start", "position", "startTime"),
    length: numAttr(p, "length", "duration"),
    offset: numAttr(p, "offset") ?? 0,
    timeFormat: numAttr(p, "timeFormat") ?? 2,
    notes: [],
    noteCount: 0,
    mediaPath: null,
    element: p,
  }));

  return {
    id: attr(el, "trackID", "id") ?? "",
    name: attr(el, "name") ?? el.tagName,
    type,
    mediaType,
    color: s1Color(attr(el, "color")),
    channelId: attr(channelEl, "uid") ?? null,
    parentFolderId: attr(el, "parentFolder") ?? null,
    element: el,
    parts,
    instrument: null,
    plugins: [],
    inserts: [], sends: [],
    depth: 0,
  };
}

function numAttr(el: Element, ...names: string[]): number | null {
  for (const n of names) {
    const v = el.getAttribute(n);
    if (v !== null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function readTempo(doc: Document): { tempo: number | null; timeSignature: string | null } {
  let tempo: number | null = null;
  let timeSignature: string | null = null;
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    if (tempo === null) {
      const v = attr(el, "tempo");
      const n = v !== null ? Number(v) : NaN;
      // Studio One stores tempo as seconds-per-beat (e.g. 0.441176 = 136 BPM)
      if (Number.isFinite(n)) {
        if (n > 0 && n < 10) tempo = 60 / n;
        else if (n >= 20 && n <= 400) tempo = n;
      }
    }
    if (tempo === null && (/tempo/i.test(xid(el) ?? "") || /^Tempo$/i.test(el.tagName))) {
      const n = Number(attr(el, "value", "bpm", "tempo"));
      if (Number.isFinite(n) && n >= 20 && n <= 400) tempo = n;
    }
    if (tempo === null && /BPM/i.test(xid(el) ?? "")) {
      const n = Number(attr(el, "value", "bpm"));
      if (Number.isFinite(n) && n >= 20 && n <= 400) tempo = n;
    }
    if (!timeSignature) {
      const num = Number(attr(el, "numerator", "num"));
      const den = Number(attr(el, "denominator", "den"));
      if (Number.isFinite(num) && Number.isFinite(den) && num > 0 && den > 0 && num <= 32 && den <= 32) {
        timeSignature = num + "/" + den;
      }
    }
  }
  return { tempo, timeSignature };
}

interface InstrumentEntry { uniqueId: string | null; channelIds: string[]; plugin: PluginRef }

function readClassInfo(ghost: Element | null | undefined): Partial<PluginRef> {
  if (!ghost) return {};
  const ci = kids(ghost).find((k) => k.tagName === "Attributes" && xid(k) === "classInfo")
    ?? ghost.querySelector("Attributes");
  if (!ci) return {};
  const sub = attr(ci, "subCategory") ?? "";
  return {
    name: attr(ci, "name") ?? undefined,
    vendor: attr(ci, "vendor", "manufacturer"),
    category: attr(ci, "category"),
    subCategory: sub.replace(/^\(Native\)\//, ""),
    native: sub.startsWith("(Native)/"),
  };
}

function readInstruments(doc: Document | undefined): InstrumentEntry[] {
  if (!doc) return [];
  const root = doc.documentElement;
  const blocks = children(root, "Attributes");
  const out: InstrumentEntry[] = [];
  for (const b of blocks) {
    const deviceData = kids(b).find((k) => k.tagName === "Attributes" && xid(k) === "deviceData");
    const ghost = kids(b).find((k) => k.tagName === "Attributes" && xid(k) === "ghostData");
    const ci = readClassInfo(ghost);
    if (!ci.name) continue;
    const uniqueId = deviceData
      ? attr(kids(deviceData).find((k) => k.tagName === "UID" && xid(k) === "uniqueID"), "uid")
      : null;
    const preset = kids(b).find((k) => k.tagName === "String" && xid(k) === "presetPath");
    out.push({
      uniqueId,
      channelIds: Array.from(b.getElementsByTagName("List")).filter(e => xid(e) === "synthChannels").flatMap(e => Array.from(e.getElementsByTagName("UID")).map(u => attr(u, "uid") || "")),
      plugin: {
        name: ci.name,
        vendor: ci.vendor,
        category: ci.category,
        subCategory: ci.subCategory,
        native: ci.native,
        format: "instrument",
        preset: null,
        presetPath: attr(preset, "text") ?? null,
      },
    });
  }
  // Fallback for variant layouts: scan every ghostData/classInfo
  if (!out.length) {
    for (const ghost of Array.from(doc.getElementsByTagName("*"))) {
      if (xid(ghost) !== "ghostData") continue;
      const ci = readClassInfo(ghost);
      if (ci.name) out.push({ uniqueId: null, channelIds: [], plugin: { ...ci, format: "instrument", preset: null } as PluginRef });
    }
  }
  return out;
}

interface MusicChannel {
  uid: string | null;
  instrumentOutName: string | null;
  instrumentOutObjectID: string | null;
}

function readMusicChannels(doc: Document | undefined): MusicChannel[] {
  if (!doc) return [];
  return Array.from(doc.getElementsByTagName("MusicTrackChannel")).map((el) => {
    const uid = attr(kids(el).find((k) => k.tagName === "UID" && xid(k) === "uniqueID"), "uid");
    const out = kids(el).find((k) => k.tagName === "Connection" && xid(k) === "instrumentOut");
    return {
      uid,
      instrumentOutName: attr(out, "friendlyName"),
      instrumentOutObjectID: attr(out, "objectID")?.split("/")[0] ?? null,
    };
  });
}

function readChannelEffects(doc: Document | undefined): Map<string, PluginRef[]> {
  const map = new Map<string, PluginRef[]>();
  if (!doc) return map;

  // Every Inserts/Sends block belongs to its nearest UID ancestor.
  const all = Array.from(doc.getElementsByTagName("*"));
  for (const el of all) {
    const id = xid(el);
    if (!id || !/^(Inserts|Sends)$/i.test(id)) continue;
    const uid = channelUidOf(el.parentElement ?? el);
    if (!uid) continue;
    const fx = readFxSlots(el).map(p => ({ ...p, category: id }));
    if (id === "Sends") {
      for (const connection of Array.from(el.getElementsByTagName("Connection"))) {
        const target = attr(connection, "objectID")?.split("/")[0];
        const targetChannel = all.find(n => /Channel$/.test(n.tagName) && kids(n).some(u => u.tagName === "UID" && xid(u) === "uniqueID" && attr(u,"uid") === target));
        const targetInserts = targetChannel ? kids(targetChannel).find(n => xid(n) === "Inserts") : undefined;
        const targetFx = targetInserts ? readFxSlots(targetInserts) : [];
        const label = attr(connection,"friendlyName") || (targetChannel && attr(targetChannel,"label")) || "未识别发送目标";
        fx.push(...(targetFx.length ? targetFx.map(p => ({...p, name: label + " → " + p.name, category: "Sends"})) : [{name: label, format: "effect" as const, category: "Sends"}]));
      }
    }
    if (!fx.length) continue;
    const prev = map.get(uid) ?? [];
    map.set(uid, [...prev, ...fx]);
  }

  // Fallback: all ghostData classInfo entries, unattributed
  if (!map.size) {
    const loose: PluginRef[] = [];
    for (const ghost of all) {
      if (xid(ghost) !== "ghostData") continue;
      const ci = readClassInfo(ghost);
      if (ci.name) loose.push({ ...ci, format: "effect", preset: null } as PluginRef);
    }
    if (loose.length) map.set("__all__", loose);
  }
  return map;
}

function channelUidOf(el: Element): string | null {
  let cur: Element | null = el;
  for (let i = 0; i < 6 && cur; i++) {
    const uid = kids(cur).find((k) => k.tagName === "UID" && xid(k) === "uniqueID");
    if (uid) return attr(uid, "uid");
    const direct = attr(cur, "uid");
    if (direct && /^\{/.test(direct)) return direct;
    cur = cur.parentElement;
  }
  return null;
}

function readFxSlots(inserts: Element): PluginRef[] {
  const out: PluginRef[] = [];
  const walk = (node: Element) => {
    for (const k of kids(node)) {
      const id = xid(k) || attr(k, "name");
      if (id && /^FX/i.test(id) && k.tagName === "Attributes") {
        const ghost = kids(k).find((g) => g.tagName === "Attributes" && xid(g) === "ghostData");
        const ci = readClassInfo(ghost);
        if (ci.name) out.push({ ...ci, format: "effect", preset: null } as PluginRef);
      }
      walk(k);
    }
  };
  walk(inserts);
  return out;
}

function readMediaPool(doc: Document | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!doc) return map;
  for (const clip of Array.from(doc.getElementsByTagName("MusicClip"))) {
    const id = attr(clip, "mediaID", "clipID", "id");
    if (!id) continue;
    const urlEl = kids(clip).find((k) => k.tagName === "Url" && xid(k) === "dataPath")
      ?? clip.getElementsByTagName("Url")[0];
    const url = attr(urlEl, "url");
    if (url) map.set(id, url);
  }
  return map;
}

function findZipEntry(zip: JSZip, path: string): JSZip.JSZipObject | null {
  const direct = zip.file(path);
  if (direct) return direct;
  const decoded = decodeURIComponent(path);
  const byDecoded = zip.file(decoded);
  if (byDecoded) return byDecoded;
  const needle = decoded.toLowerCase();
  for (const name of Object.keys(zip.files)) {
    if (name.toLowerCase() === needle) return zip.files[name];
  }
  return null;
}

export function dedupePlugins(list: PluginRef[]): PluginRef[] {
  const seen = new Map<string, PluginRef>();
  for (const p of list) {
    if (!p?.name) continue;
    const key = p.name.toLowerCase();
    const cur = seen.get(key);
    if (!cur) seen.set(key, p);
    else if (!cur.format || cur.format === "unknown") cur.format = p.format;
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

