import { Midi } from "@tonejs/midi";
import type { NoteEvent, S1Part, S1Song, S1Track, TempoChange, MeterChange } from "./types";
import { rebaseTimeMaps } from "./timing";
import { encodeMusicx } from "./musicx";
import { attr, newGuid, xid, kids, child } from "./xml";

const DEFAULT_PPQ = 480;

export interface PartRef {
  track: S1Track;
  part: S1Part;
}

export interface ExportOptions {
  /** merge all parts into one MIDI track */
  merge?: boolean;
  /** shift notes by the arrangement position of the part instead of exporting clip content at 0 */
  arrange?: boolean;
  tempo?: number | null;
  tempoMap?: TempoChange[];
  meterMap?: MeterChange[];
}

export function partNotes(part: S1Part): NoteEvent[] {
  return part.notes;
}

/** Notes relative to the part's left edge (clipped to the part window). */
export function partRelativeNotes(part: S1Part): NoteEvent[] {
  const off = part.offset || 0;
  const len = part.length ?? Infinity;
  return part.notes
    .map((n) => ({ ...n, start: n.start - off }))
    .filter((n) => n.start + n.length >= 0 && n.start < len)
    .map((n) => ({ ...n, start: Math.max(0, n.start) }));
}

export function exportPartsToMidi(refs: PartRef[], opts: ExportOptions = {}): Uint8Array {
  const midi = new Midi();
  const ppq = midi.header.ppq || DEFAULT_PPQ;
  // Independent clips from different song positions cannot share conflicting conductor maps.
  if(!opts.arrange && refs.length>1 && (opts.tempoMap?.length||0)+(opts.meterMap?.length||0)>2)
    throw new Error("变速/变拍子的多片段请保留编排位置导出");
  const origin=opts.arrange?0:(refs[0]?.part.start??0);
  const end=Math.max(origin,...refs.map(r=>(r.part.start??0)+(r.part.length??0)));
  const maps=rebaseTimeMaps(opts.tempoMap??[{beat:0,bpm:opts.tempo||120,curveType:0,raw:{}}],opts.meterMap??[{beat:0,numerator:4,denominator:4}],origin,end);
  midi.header.tempos=maps.tempoMap.map(e=>({ticks:Math.round(e.beat*ppq),bpm:e.bpm}));
  midi.header.timeSignatures=maps.meterMap.map(e=>({ticks:Math.round(e.beat*ppq),timeSignature:[e.numerator,e.denominator]}));
  midi.header.update();

  const merged = opts.merge ? midi.addTrack() : null;
  if (merged) merged.name = "S1 Parts";

  for (const ref of refs) {
    const notes = partRelativeNotes(ref.part);
    if (!notes.length) continue;
    const shift = opts.arrange ? (ref.part.start ?? 0) : 0;
    const tr = merged ?? midi.addTrack();
    if (!merged) tr.name = ref.part.name || ref.track.name || "Part";
    for (const n of notes) {
      tr.addNote({
        midi: n.pitch,
        velocity: Math.max(1, Math.min(127, n.velocity)) / 127,
        ticks: Math.max(0, Math.round((n.start + shift) * ppq)),
        durationTicks: Math.max(1, Math.round(n.length * ppq)),
      });
    }
  }

  if (!midi.tracks.length) midi.addTrack();
  return new Uint8Array(midi.toArray());
}

export interface ImportOptions {
  targetTrackId: string;
  /** arrangement position in MIDI ticks (PPQ 480) */
  startTick?: number;
  partName?: string;
}

export interface ImportResult {
  bytes: Uint8Array;
  fileName: string;
  noteCount: number;
  warnings: string[];
}

export function midiNotesFromBytes(bytes: ArrayBuffer): { notes: NoteEvent[]; name: string | null; trackCount: number; ppq: number } {
  const midi = new Midi(bytes);
  const notes: NoteEvent[] = [];
  let name: string | null = null;
  for (const tr of midi.tracks) {
    if (!name && tr.name) name = tr.name;
    for (const n of tr.notes) {
      notes.push({
        pitch: n.midi,
        velocity: Math.max(1, Math.round(n.velocity * 127)),
        start: n.ticks,
        length: Math.max(1, n.durationTicks),
      });
    }
  }
  notes.sort((a, b) => a.start - b.start);
  return { notes, name, trackCount: midi.tracks.length, ppq: midi.header.ppq || DEFAULT_PPQ };
}

export async function importMidiInto(
  song: S1Song,
  midiBytes: ArrayBuffer,
  opts: ImportOptions,
): Promise<ImportResult> {
  const warnings: string[] = [];
  const { notes, name, ppq } = midiNotesFromBytes(midiBytes);
  if (!notes.length) throw new Error("这个 MIDI 文件里没有音符。");

  const track = song.tracks.find((t) => t.id === opts.targetTrackId);
  if (!track) throw new Error("找不到目标轨道。");

  const songDoc = song.xmlDocs["Song/song.xml"];
  if (!songDoc) throw new Error("song.xml 未加载。");
  const poolDoc = song.xmlDocs["Song/mediapool.xml"];

  const scale = 1 / ppq; // ticks -> beats
  const beatNotes: NoteEvent[] = notes.map((n) => ({
    pitch: n.pitch,
    velocity: n.velocity,
    start: n.start * scale,
    length: Math.max(0.01, n.length * scale),
  }));
  const partStart = Math.max(0, (opts.startTick ?? 0) * scale);
  const partLength = Math.max(...beatNotes.map((n) => n.start + n.length));
  const partName = opts.partName || name || "Imported MIDI";

  // 1) new MIDI performance file
  const mediaID = newGuid();
  const seq = nextImportIndex(song.zipEntries);
  const mediaPath = "Performances/Imported/Imported(" + seq + ").musicx";
  song.zip.file(mediaPath, encodeMusicx(beatNotes, 2));

  // 2) register in mediapool.xml
  if (poolDoc) {
    const clip = poolDoc.createElement("MusicClip");
    clip.setAttribute("mediaID", mediaID);
    clip.setAttribute("useCount", "1");
    const url = poolDoc.createElement("Url");
    url.setAttribute("x:id", "dataPath");
    url.setAttribute("type", "1");
    url.setAttribute("url", "media:///" + mediaPath);
    clip.appendChild(url);
    const folder = findMusicFolder(poolDoc);
    folder.appendChild(clip);
    writeXml(song, "Song/mediapool.xml", poolDoc);
  } else {
    warnings.push("工程里没有 mediapool.xml，未注册 MediaPool 条目。");
  }

  // 3) new MusicPart on the target track
  const part = songDoc.createElement("MusicPart");
  part.setAttribute("transpose", "0");
  part.setAttribute("velocity", "0");
  part.setAttribute("clipID", mediaID);
  part.setAttribute("start", trimNum(partStart));
  part.setAttribute("timeFormat", "2");
  part.setAttribute("length", trimNum(partLength));
  part.setAttribute("offset", "0");
  part.setAttribute("name", partName);
  const attrs = songDoc.createElement("Attributes");
  attrs.setAttribute("x:id", "attributes");
  if (track.id) attrs.setAttribute("trackID", track.id);
  part.appendChild(attrs);

  const eventsList = findEventsList(track.element) ?? kids(track.element).find((k) => k.tagName === "List");
  (eventsList ?? track.element).appendChild(part);
  writeXml(song, "Song/song.xml", songDoc);

  const bytes = await song.zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return {
    bytes,
    fileName: song.fileName.replace(/\.song$/i, "") + "-edited.song",
    noteCount: beatNotes.length,
    warnings,
  };
}

function writeXml(song: S1Song, entry: string, doc: Document) {
  const xml = new XMLSerializer().serializeToString(doc);
  const withDecl = xml.startsWith("<?xml") ? xml : '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
  song.zip.file(entry, withDecl);
}

function findMusicFolder(doc: Document): Element {
  for (const el of Array.from(doc.getElementsByTagName("MediaFolder"))) {
    if ((attr(el, "name") ?? "").toLowerCase() === "music") return el;
  }
  for (const el of Array.from(doc.getElementsByTagName("MediaFolder"))) {
    if (el.getElementsByTagName("MusicClip").length) return el;
  }
  const first = doc.getElementsByTagName("MediaFolder")[0];
  return first ?? doc.documentElement;
}

function findEventsList(track: Element): Element | null {
  return kids(track).find((k) => k.tagName === "List" && xid(k) === "Events") ?? null;
}

function nextImportIndex(entries: string[]): number {
  let max = -1;
  for (const e of entries) {
    const m = /Performances\/Imported\/Imported\((\d+)\)\.musicx$/i.exec(e);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(9)));
}
