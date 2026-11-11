import { Inflate } from 'pako';
import { t as tr } from '../i18n';
import type { PresetDetails } from './presets';

const LIMIT = 8 * 1024 * 1024;
const text = (b: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(b);
const tag = (b: Uint8Array, p = 0, n = 4) => String.fromCharCode(...b.subarray(p, p + n));
const unknown = (): PresetDetails => ({ names: [], source: null, note: tr('保存状态未暴露可识别名称（可能被压缩或使用私有格式）') });
function name(value: string | null): string | null {
  const n = value?.trim();
  return n && n.length <= 180 && !/[\u0000-\u001f\ufffd]/.test(n) ? n : null;
}
function result(names: string[], plugin: string): PresetDetails {
  const unique = [...new Set(names)].slice(0, 64);
  return unique.length ? { names: unique, source: plugin + ' · ' + tr('插件状态中的预设元数据'), note: tr('读取工程保存的音色槽位名称，未运行插件验证') } : unknown();
}

/** Only unwrap standard VST2 state at its documented boundary, not magic scans. */
function component(bytes: Uint8Array): Uint8Array | null {
  if (tag(bytes) !== 'CcnK') return bytes;
  if (bytes.length < 60) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), kind = tag(bytes, 8);
  const sizeAt = kind === 'FPCh' ? 56 : kind === 'FBCh' ? 156 : -1;
  if (sizeAt < 0 || bytes.length < sizeAt + 4 || v.getUint32(4) + 8 !== bytes.length) return null;
  const size = v.getUint32(sizeAt);
  return sizeAt + 4 + size === bytes.length ? bytes.subarray(sizeAt + 4) : null;
}

function inflateBounded(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length > LIMIT) return null;
  const pieces: Uint8Array[] = [];
  let length = 0;
  try {
    const decoder = new Inflate({ chunkSize: 65536 });
    decoder.onData = (piece: Uint8Array) => {
      length += piece.length;
      if (length > LIMIT) throw Error('State inflation limit');
      pieces.push(piece);
    };
    decoder.push(bytes, true);
    if (decoder.err || !decoder.ended) return null;
    const out = new Uint8Array(length); let p = 0;
    for (const piece of pieces) { out.set(piece, p); p += piece.length; }
    return out;
  } catch { return null; }
}

/** 1lys: selected slot, not a list of every factory-bank preset.
 * Evidence: perivar/AudioVSTToolbox authored Sylenth test FPCh; selected-bank
 * schema: bandpassrecords/daw-project-manager sylenth1_bank.dart.
 */
function sylenth(bytes: Uint8Array): string | null {
  const records = (data: Uint8Array): string | null => {
    if (data.length < 20 || tag(data) !== '1lys') return null;
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const version = v.getUint32(4, true);
    if (![2011, 2202, 2211, 3031, 3045].includes(version)) return null;
    const count = v.getUint32(8, true), fields = v.getUint32(12, true), current = v.getUint32(16, true);
    if (!count || count > 4096 || ![242, 243, 244].includes(fields) || current >= count) return null;
    const record = fields * 4 + 36, end = 20 + count * record;
    if (end > data.length || (end !== data.length && !/^\0*JUCEPrivateData/.test(tag(data, end, Math.min(64, data.length - end))))) return null;
    const p = 20 + current * record + fields * 4;
    const raw = data.subarray(p, p + 36), nul = raw.indexOf(0);
    return name(new TextDecoder('windows-1252').decode(nul < 0 ? raw : raw.subarray(0, nul)));
  };
  const plain = records(bytes);
  if (plain) return plain;
  // Newer banks wrap the SAME complete 1lys record stream after an 8-byte prefix.
  if (bytes.length < 8 || new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) !== 3045) return null;
  const inflated = inflateBounded(bytes.subarray(8));
  if (!inflated || tag(inflated) !== '1lys') return null;
  const a = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), b = new DataView(inflated.buffer, inflated.byteOffset, inflated.byteLength);
  return bytes.length >= 8 && inflated.length >= 8 && a.getUint32(4, true) === b.getUint32(4, true) ? records(inflated) : null;
}

/** Clear XML forms only. No searching compressed/encrypted bytes for names. */
function xmlDocument(bytes: Uint8Array, root: string): { recognized: boolean; doc: Document | null } {
  if (bytes.length > LIMIT) return { recognized: false, doc: null };
  // Raw VST2 XML, or Spectrasonics' fixed VST3 component / host prefix.
  for (const offset of [0, 8, 24, 32]) {
    if (offset >= bytes.length) continue;
    let part = bytes.subarray(offset), count: number | null = null;
    if (offset === 24 || offset === 32) {
      count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset - 8, true);
      if (!count || count > part.length || count > LIMIT || part[count - 1] !== 0) continue;
      part = part.subarray(0, count - 1);
    } else {
      const nul = part.indexOf(0); if (nul >= 0) part = part.subarray(0, nul);
    }
    let value: string;
    try { value = text(part).trim(); } catch { continue; }
    if (/<!DOCTYPE|<!ENTITY/i.test(value) && value.slice(0, 1024).includes('<' + root)) return { recognized: true, doc: null };
    if (!value.startsWith('<') || !new RegExp('^(?:<\\?xml[^>]*>\\s*)?<'+root+'(?:\\s|>)').test(value)) continue;
    if (/<!DOCTYPE|<!ENTITY/i.test(value)) return { recognized: true, doc: null };
    const doc = new DOMParser().parseFromString(value, 'application/xml');
    if (doc.querySelector('parsererror') || doc.documentElement.tagName !== root || doc.getElementsByTagName('*').length > 10000) return { recognized: true, doc: null };
    return { recognized: true, doc };
  }
  return { recognized: false, doc: null };
}

/** null = unrecognized schema; recognized malformed/private schemas are definitive
 * unknown results, so generic scanners cannot harvest nested decoy names.
 * Omnisphere's SYNTHENG form is verified against an actual saved host state;
 * other forms have the narrower verification described in the support document.
 */
export function extractVendorPresetNames(chunks: Uint8Array[], pluginName: string): PresetDetails | null {
  const isSylenth = /sylenth\s*1/i.test(pluginName), isNexus = /nexus/i.test(pluginName);
  const isSpectra = /omnisphere|keyscape|trilian/i.test(pluginName), isRmx = /stylus\s*rmx/i.test(pluginName), isFalcon = /(?:uvi\s*)?falcon/i.test(pluginName);
  if (!(isSylenth || isNexus || isSpectra || isRmx || isFalcon)) return null;
  const names: string[] = []; let recognized = false;
  for (const chunk of chunks) {
    if (chunk.length > LIMIT) continue;
    const bytes = component(chunk); if (!bytes) { recognized = true; continue; }
    if (isNexus && /^NEXUS\d Bank\0/.test(tag(bytes, 0, 16))) { recognized = true; continue; }
    if (isSylenth && tag(bytes) === '1lys') {
      recognized = true;
      try { const found = sylenth(bytes); if (found) names.push(found); } catch { /* reject malformed records */ }
    }
    if (!(isSpectra || isRmx || isFalcon)) continue;
    const parsed = xmlDocument(bytes, isSpectra ? 'SynthMaster' : isRmx ? 'StylusRMXMaster' : 'UVI4');
    recognized ||= parsed.recognized;
    const root = parsed.doc?.documentElement; if (!root) continue;
    if (isSpectra) {
      // ENTRYDESCR at master scope is the Multi/Rack, not the loaded patch.
      let parts = 0;
      for (const sub of Array.from(root.children).filter(e => e.tagName === 'SynthSubEngine')) {
        for (const engine of Array.from(sub.children).filter(e => e.tagName === 'SynthEngine')) {
          if (++parts > 8) break;
          // Actual Omnisphere 3 host state nests patch metadata in SYNTHENG.
          // Older authored multis may put the same metadata on SYNTHENG itself.
          // Never search descendants: layer/soundsource names are not patch names.
          const synth = Array.from(engine.children).filter(e => e.tagName === 'SYNTHENG');
          if (synth.length > 1) continue;
          const scope = synth[0] ?? engine;
          const entries = Array.from(scope.children).filter(e => e.tagName === 'ENTRYDESCR');
          if (entries.length > 1) continue;
          const found = name(entries[0]?.getAttribute('name') ?? (synth[0]?.getAttribute('name') ?? null));
          if (found) names.push(found);
        }
        if (parts >= 8) break;
      }
    } else if (isRmx) {
      for (const el of Array.from(root.getElementsByTagName('*'))) {
        const found = name(el.getAttribute('Loop')); if (found) names.push(found);
      }
    } else {
      // Only Program labels; never Layer, Keygroup, script or oscillator names.
      for (const program of Array.from(root.children).filter(e => e.tagName === 'Program')) {
        const found = name(program.getAttribute('DisplayName')); if (found) names.push(found);
      }
    }
  }
  return recognized ? result(names, pluginName) : null;
}
