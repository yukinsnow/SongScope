import type { NoteEvent } from "./types";
import { attr, xid, kids } from "./xml";

export interface NoteSchema {
  tag: string;
  pitchAttr: string;
  velocityAttr?: string;
  startAttr?: string;
  lengthAttr?: string;
  channelAttr?: string;
  /** true when values live in child <Attributes x:id="pitch" .../> style nodes */
  childStyle: boolean;
}

const PITCH_RE = /^(pitch|key|note|tone|midinote|noteNumber)$/i;
const VEL_RE = /^(velocity|vel|volume)$/i;
const START_RE = /^(start|starttime|startpos|position|pos|time|offset|tick|ticks|ppq)$/i;
const LEN_RE = /^(length|duration|dur|len|lengthticks)$/i;

function numericFrom(el: Element, name: string): number | null {
  const direct = attr(el, name);
  if (direct !== null && direct.trim() !== "" && Number.isFinite(Number(direct))) return Number(direct);
  for (const k of kids(el)) {
    if (xid(k) === name || k.tagName === name) {
      const v = attr(k, "value", "val", "text");
      if (v !== null && Number.isFinite(Number(v))) return Number(v);
    }
  }
  return null;
}

function attrNameMatching(el: Element, re: RegExp): string | null {
  for (const a of Array.from(el.attributes)) {
    if (re.test(a.name.replace(/^.*:/, ""))) return a.name;
  }
  return null;
}

/** Find the element/attribute pattern Studio One uses for notes inside a part. */
export function detectNoteSchema(part: Element): NoteSchema | null {
  const all = Array.from(part.getElementsByTagName("*"));
  const scores = new Map<string, { el: Element; score: number }>();
  for (const el of all) {
    const p = attrNameMatching(el, PITCH_RE);
    if (!p) continue;
    const raw = el.getAttribute(p);
    if (raw === null) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 127) continue;
    const key = el.tagName;
    const prev = scores.get(key);
    const score = (prev?.score ?? 0) + 1;
    if (!prev || score > prev.score) scores.set(key, { el, score });
  }
  if (!scores.size) return null;
  const [tag, best] = [...scores.entries()].sort((a, b) => b[1].score - a[1].score)[0];
  const el = best.el;
  const pitchAttr = attrNameMatching(el, PITCH_RE)!;
  return {
    tag,
    pitchAttr,
    velocityAttr: attrNameMatching(el, VEL_RE) ?? undefined,
    startAttr: attrNameMatching(el, START_RE) ?? undefined,
    lengthAttr: attrNameMatching(el, LEN_RE) ?? undefined,
    channelAttr: attrNameMatching(el, /^channel$/i) ?? undefined,
    childStyle: false,
  };
}

export function readNotes(part: Element, schema: NoteSchema): NoteEvent[] {
  const els = Array.from(part.getElementsByTagName(schema.tag));
  const raw = els.map((el) => {
    const pitch = Number(el.getAttribute(schema.pitchAttr));
    const velocity = schema.velocityAttr ? Number(el.getAttribute(schema.velocityAttr)) : 100;
    const start = schema.startAttr ? Number(el.getAttribute(schema.startAttr)) : 0;
    const length = schema.lengthAttr ? Number(el.getAttribute(schema.lengthAttr)) : 0;
    return { pitch, velocity, start, length };
  }).filter((n) => Number.isFinite(n.pitch) && n.pitch >= 0 && n.pitch <= 127);

  // Fallback: some formats store start/length as children, or omit length entirely.
  if (raw.length && raw.every((n) => n.start === 0)) {
    const starts = els.map((el) => numericFrom(el, "start") ?? numericFrom(el, "position") ?? 0);
    if (starts.some((s) => s > 0)) raw.forEach((n, i) => (n.start = starts[i]));
  }
  raw.sort((a, b) => a.start - b.start);
  raw.forEach((n, i) => {
    if (!n.length || !Number.isFinite(n.length)) {
      const next = raw[i + 1]?.start;
      n.length = next !== undefined && next > n.start ? Math.min(next - n.start, 960) : 240;
    }
    if (!Number.isFinite(n.velocity) || n.velocity <= 0) n.velocity = 100;
    if (n.velocity <= 1) n.velocity = Math.round(n.velocity * 127);
  });
  return raw;
}

export function countNotes(part: Element): number {
  const schema = detectNoteSchema(part);
  return schema ? part.getElementsByTagName(schema.tag).length : 0;
}

/** Guess whether raw part/note positions are ticks, beats or seconds. */
export function guessUnit(partLength: number | null, notes: NoteEvent[]): "ticks" | "beats" {
  const maxEnd = notes.reduce((m, n) => Math.max(m, n.start + n.length), 0);
  const ref = partLength && partLength > 0 ? partLength : maxEnd;
  if (ref > 0 && ref <= 512) return "beats";
  return "ticks";
}
