/** Read-only NI containers. All sizes and work are bounded; no plugin or file I/O. */
const MAX_DECODED = 32 * 1024 * 1024;
const MAX_TOTAL = 64 * 1024 * 1024;
const MAX_ITEMS = 20000;
export interface KontaktState { names: string[]; encrypted: boolean; source: 'program' | 'files' }
type Item = { domain: string; id: number; start: number; end: number };
const invalid = () => new Error('Invalid or unsupported Kontakt state');

/** Strict FastLZ levels 1/2: reject truncated input, bad distances and size mismatches. */
export function fastLz(src: Uint8Array, expected: number): Uint8Array {
  if (!Number.isInteger(expected) || expected < 48 || expected > MAX_DECODED || !src.length) throw invalid();
  const level = (src[0] >> 5) + 1;
  if (level !== 1 && level !== 2) throw invalid();
  const dst = new Uint8Array(expected);
  let ip = 1, op = 0, ctrl = src[0] & 31;
  const byte = () => { if (ip >= src.length) throw invalid(); return src[ip++]; };
  for (;;) {
    if (ctrl < 32) {
      const length = ctrl + 1;
      if (ip + length > src.length || op + length > expected) throw invalid();
      dst.set(src.subarray(ip, ip + length), op); ip += length; op += length;
    } else {
      let length = ctrl >> 5, distance = (ctrl & 31) << 8;
      if (length === 7) {
        let extra: number;
        do { extra = byte(); length += extra; } while (level === 2 && extra === 255);
      }
      const code = byte(); distance += code;
      if (level === 2 && code === 255 && distance === 8191) distance = (byte() << 8) + byte() + 8191;
      const ref = op - distance - 1; length += 2;
      if (ref < 0 || op + length > expected) throw invalid();
      // Sequential copy deliberately supports overlapping LZ runs.
      for (let j = 0; j < length; j++) dst[op++] = dst[ref + j];
    }
    if (ip === src.length) break;
    ctrl = byte();
  }
  if (op !== expected) throw invalid();
  return dst;
}

export function readKontaktState(chunks: Uint8Array[]): KontaktState | null {
  const names = new Set<string>(), programs = new Set<string>();
  let encrypted = false, recognized = false, total = 0, items = 0;
  const visit = (data: Uint8Array, start: number, end: number, depth: number): number => {
    if (depth > 32 || ++items > MAX_ITEMS || start + 48 > end) throw invalid();
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const u32 = (p: number) => { if (p < start || p + 4 > end) throw invalid(); return view.getUint32(p, true); };
    const u64 = (p: number) => { if (p < start || p + 8 > end) throw invalid(); const n = Number(view.getBigUint64(p, true)); if (!Number.isSafeInteger(n)) throw invalid(); return n; };
    const tag = (p: number) => String.fromCharCode(...data.subarray(p, p + 4));
    const frameEnd = start + u64(start);
    if (frameEnd > end || frameEnd < start + 48 || u32(start + 8) !== 1 || tag(start + 12) !== 'hsin') throw invalid();
    const chain: Item[] = [];
    const stack = (p: number, limit: number, level: number): number => {
      if (level > 32 || ++items > MAX_ITEMS || p + 20 > limit) throw invalid();
      const stop = p + u64(p), domain = tag(p + 8), id = u32(p + 12);
      if (stop < p + 20 || stop > limit || !['DSIN', '4KIN', 'NISD', '2SAM'].includes(domain) || u32(p + 16) !== 1) throw invalid();
      const payload = id === 1 ? p + 20 : stack(p + 20, stop, level + 1);
      chain.push({ domain, id, start: payload, end: stop });
      return stop;
    };
    const dataEnd = stack(start + 40, frameEnd, 0);
    // EncryptionItem payload is u32 version + u8 flag, not a guessed byte scan.
    let protectedSubtree = false;
    for (const item of chain) if (item.domain === 'DSIN' && item.id === 116) {
      if (item.end - item.start !== 5 || u32(item.start) !== 1 || data[item.start + 4] > 1) throw invalid();
      protectedSubtree = data[item.start + 4] === 1;
      encrypted ||= protectedSubtree;
    }
    if (protectedSubtree && !chain.some(i => i.domain === 'DSIN' && i.id === 115)) throw invalid();
    for (const item of chain) {
      if (item.domain === 'DSIN' && item.id === 115) {
        const p = item.start;
        if (p + 5 > item.end || u32(p) !== 1 || data[p + 4] > 1) throw invalid();
        if (data[p + 4] === 0) {
          if (protectedSubtree) throw invalid();
          if (visit(data, p + 5, item.end, depth + 1) !== item.end) throw invalid();
        } else {
          if (p + 13 > item.end) throw invalid();
          const size = u32(p + 5), compressed = u32(p + 9);
          if (p + 13 + compressed !== item.end || !compressed || size < 48) throw invalid();
          if (protectedSubtree) continue;
          if (size > MAX_DECODED || total + size > MAX_TOTAL) throw invalid();
          total += size;
          const decoded = fastLz(data.subarray(p + 13, item.end), size);
          if (visit(decoded, 0, decoded.length, depth + 1) !== decoded.length) throw invalid();
        }
      }
      // Instrument path records are read below, never by harvesting script strings.
      collectInstrumentPaths(data.subarray(item.start, item.end), item, names, programs);
    }
    if (dataEnd + 8 > frameEnd || u32(dataEnd) !== 1) throw invalid();
    const count = u32(dataEnd + 4);
    if (count > MAX_ITEMS) throw invalid();
    let child = dataEnd + 8;
    for (let i = 0; i < count; i++) {
      if (child + 12 > frameEnd || !['DSIN', '4KIN', 'NISD', '2SAM'].includes(tag(child + 4))) throw invalid();
      child = visit(data, child + 12, frameEnd, depth + 1);
    }
    if (child !== frameEnd) throw invalid();
    return frameEnd;
  };
  for (const chunk of chunks) {
    if (chunk.length < 16 || String.fromCharCode(...chunk.subarray(12, 16)) !== 'hsin') continue;
    recognized = true;
    if (visit(chunk, 0, chunk.length, 0) !== chunk.length) throw invalid();
  }
  return recognized ? { names: [...(programs.size ? programs : names)].slice(0, 64), encrypted, source: programs.size ? 'program' : 'files' } : null;
}

function collectInstrumentPaths(data: Uint8Array, item: Item, names: Set<string>, programs: Set<string>) {
  if (item.domain !== 'DSIN' || item.id !== 109 || data.length < 28) return;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Only the verified single-item Kontakt dictionary is supported. Unknown
  // versions are left unidentified; never fall back to names in script text.
  if (view.getUint32(0, true) !== 1 || view.getUint32(4, true) !== 1 || view.getUint32(8, true) !== 1 || view.getUint32(16, true) !== 0) return;
  const size = view.getUint32(12, true), end = 20 + size;
  // Last word is NOT a fixed magic: the verified Cello uses 0x71bab847,
  // while the empty/guzheng samples use 0x8565620d. Preserve the boundary.
  if (end + 8 !== data.length || view.getUint32(end, true) !== 0) return;
  const found: string[] = [];
  const loaded: string[] = [];
  let pos = 20, objects = 0;
  while (pos < end) {
    if (pos + 6 > end || ++objects > MAX_ITEMS) return;
    const id = view.getUint16(pos, true), stop = pos + 6 + view.getUint32(pos + 2, true);
    if (stop > end) return;
    if (id === 3) loaded.push(...loadedPrograms(data, pos + 6, stop));
    if (id === 0x4b) {
      const files = pathTable(data.subarray(pos + 6, stop));
      if (!files) return;
      found.push(...files);
    }
    pos = stop;
  }
  for (const name of found) if (names.size < 64) names.add(name);
  for (const name of loaded) if (programs.size < 64) programs.add(name);
}

/** BANK's own name is the Rack. Only names inside occupied program slots count. */
function loadedPrograms(data: Uint8Array, start: number, end: number): string[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  type Block = { id: number; start: number; end: number };
  type Structure = { publicStart: number; publicEnd: number; children: Block[]; end: number };
  let work = 0;
  const need = (p: number, n: number, limit: number) => { if (p < start || p + n > limit || ++work > MAX_ITEMS) throw invalid(); };
  const u32 = (p: number, limit: number) => { need(p, 4, limit); return view.getUint32(p, true); };
  const blocks = (p: number, limit: number): Block[] => {
    const result: Block[] = [];
    while (p < limit) {
      need(p, 6, limit);
      const stop = p + 6 + view.getUint32(p + 2, true); need(p, stop - p, limit);
      result.push({ id: view.getUint16(p, true), start: p + 6, end: stop }); p = stop;
    }
    return result;
  };
  const structure = (p: number, limit: number): Structure => {
    need(p, 3, limit);
    if (data[p] !== 1) throw invalid();
    p += 3;
    const privateSize = u32(p, limit); p += 4; need(p, privateSize, limit); p += privateSize;
    const publicSize = u32(p, limit); p += 4; need(p, publicSize, limit);
    const publicStart = p; p += publicSize;
    const childSize = u32(p, limit); p += 4; need(p, childSize, limit);
    return { publicStart, publicEnd: publicStart + publicSize, children: blocks(p, p + childSize), end: p + childSize };
  };
  try {
    const bank = structure(start, end), names: string[] = [];
    if (bank.end !== end) return [];
    for (const slotList of bank.children.filter(c => c.id === 0x37)) {
      need(slotList.start, 8, slotList.end);
      const occupied = view.getBigUint64(slotList.start, true);
      const containers = blocks(slotList.start + 8, slotList.end);
      let index = 0;
      for (let slot = 0; slot < 64; slot++) {
        if (!(occupied & (1n << BigInt(slot)))) continue;
        const block = containers[index++];
        if (!block || block.id !== 0x29) return [];
        const container = structure(block.start, block.end);
        if (container.end !== block.end) return [];
        for (const list of container.children.filter(c => c.id === 0x36)) {
          const count = u32(list.start, list.end); let p = list.start + 4;
          if (count > 128) return [];
          for (let i = 0; i < count; i++) {
            const program = structure(p, list.end); p = program.end;
            const length = u32(program.publicStart, program.publicEnd);
            if (length < 1 || length > 180) return [];
            need(program.publicStart + 4, length * 2, program.publicEnd);
            const name = new TextDecoder('utf-16le', { fatal: true }).decode(data.subarray(program.publicStart + 4, program.publicStart + 4 + length * 2)).trim();
            if (!name || /[\u0000-\u001f\ufffd]/.test(name)) return [];
            names.push(name);
          }
          if (p !== list.end) return [];
        }
      }
      if (index !== containers.length) return [];
    }
    return names.slice(0, 64);
  } catch { return []; }
}

/** Kontakt FILENAME_LIST_EX v3. Parse every record to its exact boundary. */
function pathTable(data: Uint8Array): string[] | null {
  if (data.length < 6) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint16(0, true) !== 3) return null;
  const count = view.getUint32(2, true), names: string[] = [];
  if (count > 100000 || count * 32 > data.length - 6) return null;
  let pos = 6;
  for (let i = 0; i < count; i++) {
    if (pos + 12 > data.length) return null;
    const segments = view.getUint32(pos + 8, true); pos += 12;
    if (segments > 128) return null;
    for (let j = 0; j < segments; j++) {
      if (pos >= data.length) return null;
      const type = data[pos++];
      if ([1, 2, 4, 8, 9].includes(type)) {
        if (pos + 4 > data.length) return null;
        const length = view.getUint32(pos, true); pos += 4;
        if (length > 4096 || pos + length * 2 > data.length) return null;
        if (type === 4 && length <= 180) {
          const name = new TextDecoder('utf-16le', { fatal: true }).decode(data.subarray(pos, pos + length * 2));
          if (/\.(nki|nkm|nksn)$/i.test(name) && !/[\\/\u0000-\u001f\ufffd]/.test(name) && names.length < 64) names.push(name);
        }
        pos += length * 2;
      } else if (type === 0) {
        if (pos + 2 > data.length) return null;
        pos += 2;
      } else if (![3, 6, 11].includes(type)) return null;
    }
    if (pos + 20 > data.length) return null;
    pos += 20;
  }
  return pos === data.length ? names : null;
}
