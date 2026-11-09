import type { NoteEvent } from "./types";

/**
 * Studio One .musicx (Performances/*.musicx) binary format.
 *
 * A tiny tagged-value stream:
 *   '{' object (key = 'i' + u8 length + bytes, then typed value, until '}')
 *   '[' array (values until ']')
 *   'D' float64 BE
 *   'I' int16 BE
 *   'i' LEB128 int
 *   'U' uint8
 *   's' string (u8 length + UTF-8 bytes)
 *   'b' bool (u8)
 *   'f' float32 BE
 */
export interface MusicxDoc {
  timeFormat: number;
  events: NoteEvent[];
  envelopes: unknown[];
  other: Record<string, unknown>;
}

class Reader {
  private i = 0;
  constructor(private b: Uint8Array) {}

  private u8() { return this.b[this.i++]; }
  private str() {
    const n = this.u8();
    const s = new TextDecoder().decode(this.b.subarray(this.i, this.i + n));
    this.i += n;
    return s;
  }
  private int() {
    let shift = 0, res = 0;
    for (;;) {
      const c = this.u8();
      res |= (c & 0x7f) << shift;
      if (!(c & 0x80)) return res;
      shift += 7;
    }
  }

  value(prefix: string): unknown {
    switch (prefix) {
      case "{": {
        const o: Record<string, unknown> = {};
        while (this.b[this.i] !== 0x7d) {
          if (this.b[this.i] !== 0x69) throw new Error("musicx: bad key at " + this.i);
          this.i++;
          const k = this.str();
          const p = String.fromCharCode(this.b[this.i++]);
          o[k] = this.value(p);
        }
        this.i++;
        return o;
      }
      case "[": {
        const a: unknown[] = [];
        while (this.b[this.i] !== 0x5d) {
          const p = String.fromCharCode(this.b[this.i++]);
          a.push(this.value(p));
        }
        this.i++;
        return a;
      }
      case "D": {
        const v = new DataView(this.b.buffer, this.b.byteOffset + this.i, 8).getFloat64(0, false);
        this.i += 8;
        return v;
      }
      case "I": {
        const v = new DataView(this.b.buffer, this.b.byteOffset + this.i, 2).getInt16(0, false);
        this.i += 2;
        return v;
      }
      case "i": return this.int();
      case "U": return this.u8();
      case "s": return this.str();
      case "b": return this.u8() !== 0;
      case "f": {
        const v = new DataView(this.b.buffer, this.b.byteOffset + this.i, 4).getFloat32(0, false);
        this.i += 4;
        return v;
      }
      default: throw new Error("musicx: unknown token " + prefix + " at " + (this.i - 1));
    }
  }

  root(): { value: unknown; consumed: number } {
    const first = String.fromCharCode(this.b[0]);
    this.i = 1;
    return { value: this.value(first), consumed: this.i };
  }
}

export function decodeMusicx(bytes: Uint8Array): MusicxDoc {
  const { value } = new Reader(bytes).root();
  const o = (value ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(o.events) ? (o.events as Record<string, unknown>[]) : [];
  const events: NoteEvent[] = raw.map((e) => ({
    pitch: Number(e.pitch ?? 0),
    velocity: normalizeVelocity(Number(e.velocity ?? 0.75)),
    start: Number(e.start ?? 0),
    length: Number(e.length ?? 0.25),
  })).filter((e) => Number.isFinite(e.pitch) && e.pitch >= 0 && e.pitch <= 127);
  events.sort((a, b) => a.start - b.start);
  return {
    timeFormat: Number(o.timeFormat ?? 2),
    events,
    envelopes: Array.isArray(o.envelopes) ? o.envelopes : [],
    other: o,
  };
}

function normalizeVelocity(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 100;
  // musicx stores 0..1; accept legacy 1..127 too
  return v <= 1 ? Math.round(v * 127) : Math.round(v);
}

class Writer {
  private out: number[] = [];
  u8(v: number) { this.out.push(v & 0xff); }
  str(s: string) {
    const b = new TextEncoder().encode(s);
    if (b.length > 255) throw new Error("musicx: string too long");
    this.u8(b.length);
    for (const x of b) this.u8(x);
  }
  int(v: number) {
    let n = Math.max(0, Math.round(v));
    do {
      let c = n & 0x7f;
      n >>= 7;
      if (n) c |= 0x80;
      this.u8(c);
    } while (n);
  }
  float64(v: number) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, false);
    for (const x of b) this.u8(x);
  }
  int16(v: number) {
    this.u8((v >> 8) & 0xff);
    this.u8(v & 0xff);
  }
  key(k: string) { this.u8(0x69); this.str(k); }
  bytes() { return new Uint8Array(this.out); }
}

export function encodeMusicx(events: NoteEvent[], timeFormat = 2): Uint8Array {
  const w = new Writer();
  w.u8(0x7b); // {
  w.key("timeFormat"); w.u8(0x69); w.int(timeFormat);
  w.key("events"); w.u8(0x5b); // [
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    w.u8(0x7b);
    w.key("start"); w.u8(0x44); w.float64(e.start);
    w.key("pitch"); w.u8(0x69); w.int(Math.max(0, Math.min(127, Math.round(e.pitch))));
    w.key("noteId"); w.u8(0x49); w.int16(i + 1);
    w.key("length"); w.u8(0x44); w.float64(Math.max(0.01, e.length));
    w.key("velocity"); w.u8(0x44); w.float64(Math.max(0.01, Math.min(1, e.velocity / 127)));
    w.key("quantize.velocity"); w.u8(0x44); w.float64(0);
    w.u8(0x7d);
  }
  w.u8(0x5d); // ]
  w.key("envelopes"); w.u8(0x5b); w.u8(0x5d);
  w.u8(0x7d); // }
  return w.bytes();
}
