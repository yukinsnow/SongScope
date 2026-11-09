import { Midi } from "@tonejs/midi";
import type { NoteEvent, S1Part, S1Song, S1Track } from "./types";
import { detectNoteSchema, readNotes, guessUnit } from "./notes";
import { attr, newGuid, xid, kids } from "./xml";

const DEFAULT_PPQ = 480;

export interface PartRef {
  track: S1Track;
  part: S1Part;
}

export interface ExportOptions {
  /** "auto" inspects part length; ticks keeps raw values; beats multiplies by PPQ. */
  unit?: "auto" | "ticks" | "beats";
  /** merge all parts into a single MIDI track */
  merge?: boolean;
}

export function partNotes(part: S1Part): NoteEvent[] {
  const schema = detectNoteSchema(part.element);
  return schema ? readNotes(part.element, schema) : [];
}

export function exportPartsToMidi(refs: PartRef[], opts: ExportOptions = {}): Uint8Array {
  const midi = new Midi();
  const PPQ = midi.header.ppq || DEFAULT_PPQ;
  const first = refs[0];
  if (first?.track) {
    midi.header.setTempo(120);
  }

  const merged = opts.merge ? midi.addTrack() : null;
  if (merged) merged.name = "S1 Parts";

  for (const ref of refs) {
    const notes = partNotes(ref.part);
    if (!notes.length) continue;
    const unit = opts.unit && opts.unit !== "auto" ? opts.unit : guessUnit(ref.part.length, notes);
    const scale = unit === "beats" ? PPQ : 1;
    const tr = merged ?? midi.addTrack();
    if (!merged) tr.name = ref.part.name || ref.track.name || "Part";
    for (const n of notes) {
      tr.addNote({
        midi: n.pitch,
        velocity: Math.max(1, Math.min(127, n.velocity)) / 127,
        ticks: Math.max(0, Math.round(n.start * scale)),
        durationTicks: Math.max(1, Math.round(n.length * scale)),
      });
    }
  }

  if (!midi.tracks.length) {
    // still emit a valid, empty MIDI file so users can chain exporters
    midi.addTrack();
  }
  return new Uint8Array(midi.toArray());
}

export interface ImportOptions {
  targetTrackId: string;
  startTick?: number;
  partName?: string;
}

export interface ImportResult {
  bytes: Uint8Array;
  fileName: string;
  noteCount: number;
  warnings: string[];
}

export function midiNotesFromBytes(bytes: ArrayBuffer): { notes: NoteEvent[]; name: string | null; trackCount: number } {
  const midi = new Midi(bytes);
  const notes: NoteEvent[] = [];
  let name: string | null = null;
  for (const tr of midi.tracks) {
    if (!name && tr.name) name = tr.name;
    for (const n of tr.notes) {
      notes.push({
        pitch: n.midi,
        velocity: Math.max(1, Math.round(n.velocity * 127)),
        start: Math.round(n.ticks),
        length: Math.max(1, Math.round(n.durationTicks)),
      });
    }
  }
  notes.sort((a, b) => a.start - b.start);
  return { notes, name, trackCount: midi.tracks.length };
}

export async function importMidiInto(
  song: S1Song,
  midiBytes: ArrayBuffer,
  opts: ImportOptions,
): Promise<ImportResult> {
  const warnings: string[] = [];
  const { notes, name } = midiNotesFromBytes(midiBytes);
  if (!notes.length) throw new Error("这个 MIDI 文件里没有音符。");

  const track = song.tracks.find((t) => t.id === opts.targetTrackId);
  if (!track) throw new Error("找不到目标轨道。");

  const doc = song.xmlDocs["Song/song.xml"];
  if (!doc) throw new Error("song.xml 未加载。");

  // Prefer a part on the target track as the structural template.
  const ownPart = track.parts[0]?.element ?? null;
  const template = ownPart ?? song.tracks.flatMap((t) => t.parts)[0]?.element ?? null;

  const start = Math.max(0, Math.round(opts.startTick ?? 0));
  const end = notes.reduce((m, n) => Math.max(m, start + n.start + n.length), 0);
  const length = Math.max(1, end - start);

  let part: Element;
  let schema = template ? detectNoteSchema(template) : null;

  if (template) {
    part = template.cloneNode(true) as Element;
    regenerateUids(part);
    setAttrIfPresent(part, ["clipID", "id"], newGuid());
    setAttrIfPresent(part, ["name"], opts.partName || name || "Imported MIDI");
    setAttrIfPresent(part, ["start", "position", "startTime"], String(start));
    setAttrIfPresent(part, ["length", "duration"], String(length));
    // Remove template notes (and their containers' note children only)
    if (schema) {
      for (const old of Array.from(part.getElementsByTagName(schema.tag))) old.remove();
    }
    if (!schema) {
      schema = {
        tag: "Note",
        pitchAttr: "pitch",
        velocityAttr: "velocity",
        startAttr: "start",
        lengthAttr: "length",
        childStyle: false,
      };
      warnings.push("工程里没有可参考的音符结构，已按通用 <Note> 结构写入，可能需要在 Studio One 里检查。");
    }
  } else {
    part = doc.createElement("MusicPart");
    part.setAttribute("clipID", newGuid());
    part.setAttribute("name", opts.partName || name || "Imported MIDI");
    part.setAttribute("start", String(start));
    part.setAttribute("length", String(length));
    schema = {
      tag: "Note",
      pitchAttr: "pitch",
      velocityAttr: "velocity",
      startAttr: "start",
      lengthAttr: "length",
      childStyle: false,
    };
    warnings.push("目标工程没有任何 MusicPart，已创建最小结构；建议先在 Studio One 里建一个空 MIDI 片段再试。");
  }

  for (const n of notes) {
    const el = doc.createElement(schema.tag);
    el.setAttribute(schema.pitchAttr, String(n.pitch));
    if (schema.velocityAttr) el.setAttribute(schema.velocityAttr, String(n.velocity));
    if (schema.startAttr) el.setAttribute(schema.startAttr, String(n.start));
    if (schema.lengthAttr) el.setAttribute(schema.lengthAttr, String(n.length));
    part.appendChild(el);
  }

  if (ownPart?.parentElement) {
    ownPart.parentElement.insertBefore(part, ownPart.nextSibling);
  } else {
    const list = kids(track.element).find((k) => k.tagName === "List") ?? track.element;
    list.appendChild(part);
  }

  const xml = new XMLSerializer().serializeToString(doc);
  const withDecl = xml.startsWith("<?xml") ? xml : '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
  song.zip.file("Song/song.xml", withDecl);
  const bytes = await song.zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  return {
    bytes,
    fileName: song.fileName.replace(/\.song$/i, "") + "-edited.song",
    noteCount: notes.length,
    warnings,
  };
}

function setAttrIfPresent(el: Element, names: string[], value: string) {
  for (const n of names) {
    if (el.hasAttribute(n)) {
      el.setAttribute(n, value);
      return;
    }
  }
}

function regenerateUids(root: Element) {
  const guidRe = /^\{[0-9A-Fa-f-]{36}\}$/;
  for (const el of Array.from(root.getElementsByTagName("*"))) {
    if (el.tagName === "UID" || xid(el) === "uniqueID") {
      const cur = attr(el, "uid");
      if (cur && guidRe.test(cur)) el.setAttribute("uid", newGuid());
    }
  }
}
