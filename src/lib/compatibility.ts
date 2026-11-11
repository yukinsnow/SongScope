import JSZip from 'jszip';
import { t as tr } from '../i18n';
import type { S1Song } from './types';
import { parseXml } from './xml';
import { readProjectVersion } from './project-version';

/** Native archive compatibility is experimental, not a vendor-supported save-as. */
export type CompatibilityTarget = 5 | 6 | 7;
export interface CompatibilityReport {
  canExport: boolean;
  blockers: string[];
  warnings: string[];
  changes: string[];
  target: CompatibilityTarget;
  changedEntries: string[];
}
const EQ_NEW = 'D9AE9ACD-69B4-4B43-B8D5-983E39C559A5';
const EQ_OLD = '073C4094-E062-4FB5-8328-74608DD1A3A4';
const COMP_NEW = '36F3F4D1-CBB4-4BF7-A7E3-EBCCED53718B';
const MAX_XML = 16 * 1024 * 1024;
const MAX_PRESET = 1024 * 1024;
type Edit = { start: number; end: number; value: string };
type Attribute = { value: string; start: number; end: number };
type Tag = { name: string; start: number; end: number; close: number; attrs: Map<string, Attribute>; parent?: Tag };
type Prepared = { report: CompatibilityReport; replacements: Map<string, Uint8Array>; renames: Map<string, string> };
const encoder = new TextEncoder();
const fields = new Set(('linearphasesoft linearphasefreq linearphaseactive lcfreq lcslope lcactive lfgain lffreq lfq lftype lfactive lfdynamic lfdynthreshold lfdynrange lfsolo lmfgain lmffreq lmfq lmfactive lmfdynamic lmfdynthreshold lmfdynrange lmfsolo mfgain mffreq mfq mfactive mfdynamic mfdynthreshold mfdynrange mfsolo hmfgain hmffreq hmfq hmfactive hmfdynamic hmfdynthreshold hmfdynrange hmfsolo hfgain hffreq hfq hftype hfactive hfdynamic hfdynthreshold hfdynrange hfsolo hcfreq hcslope hcactive highqual showfft analyzerRangeMin analyzerRangeMax viewmode showControls showDynamics displayRange').split(' '));
const required = ('lcfreq lcslope lcactive lfgain lffreq lfq lftype lfactive lmfgain lmffreq lmfq lmfactive mfgain mffreq mfq mfactive hmfgain hmffreq hmfq hmfactive hfgain hffreq hfq hftype hfactive hcfreq hcslope hcactive gain autogain highqual').split(' ');
function decode(value: string): string {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, s => {
    const fixed: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (fixed[s]) return fixed[s];
    return String.fromCodePoint(s.startsWith('&#x') ? parseInt(s.slice(3, -1), 16) : parseInt(s.slice(2, -1), 10));
  });
}
function escape(value: string): string { return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
/** Offset-based edits retain unknown XML, namespaces, whitespace and all untouched values. */
function tags(text: string): Tag[] {
  if (text.length > MAX_XML || /<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('XML size / declarations');
  parseXml(text);
  const result: Tag[] = [], stack: Tag[] = [];
  const token = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:[^>"']|"[^"]*"|'[^']*')*>/g;
  for (const m of text.matchAll(token)) {
    if (/^<\?|^<!/.test(m[0])) continue;
    if (/^<\//.test(m[0])) { const top = stack.pop(); if (top) top.close = m.index! + m[0].length; continue; }
    const name = /^<\s*([^\s/>]+)/.exec(m[0])?.[1];
    if (!name) throw Error('XML tag');
    const tag: Tag = { name, start: m.index!, end: m.index! + m[0].length, close: m.index! + m[0].length, attrs: new Map(), parent: stack.at(-1) };
    const attrPattern = /([^\s=<>]+)\s*=\s*(["'])(.*?)\2/gs;
    for (const a of m[0].matchAll(attrPattern)) {
      const offset = m.index! + a.index! + a[0].indexOf(a[2]) + 1;
      tag.attrs.set(a[1], { value: decode(a[3]), start: offset, end: offset + a[3].length });
    }
    result.push(tag);
    if (!/\/\s*>$/.test(m[0])) stack.push(tag);
    if (result.length > 250000) throw Error('XML element budget');
  }
  return result;
}
function value(tag: Tag, key: string) { return tag.attrs.get(key)?.value; }
function id(tag: Tag) { return value(tag, 'x:id') ?? value(tag, 'id'); }
function edit(tag: Tag, key: string, replacement: string): Edit {
  const a = tag.attrs.get(key); if (!a) throw Error('Missing attribute ' + key);
  return { start: a.start, end: a.end, value: escape(replacement) };
}
function apply(text: string, edits: Edit[]) {
  const sorted = edits.sort((a, b) => b.start - a.start); let boundary = text.length;
  for (const e of sorted) { if (e.end > boundary) throw Error('Overlapping XML edits'); text = text.slice(0, e.start) + e.value + text.slice(e.end); boundary = e.start; }
  return text;
}
function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
/** Deliberately narrow JSON -> legacy EQ serialization. No defaulting missing DSP values. */
function convertEq(text: string): string {
  const json: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (!record(json) || json.classname !== 'Pro EQ' || typeof json.cid !== 'string' || json.cid.replace(/[{}]/g, '').toUpperCase() !== EQ_NEW || !record(json.parameters)) throw Error('unrecognized EQ schema');
  const flat: Record<string, number> = {};
  for (const section of Object.values(json.parameters)) {
    if (!record(section)) throw Error('parameter section');
    for (const [key, raw] of Object.entries(section)) {
      if (typeof raw !== 'number' || !Number.isFinite(raw) || key in flat) throw Error('invalid / duplicate parameter ' + key);
      if (!fields.has(key) && !['gain', 'autogain', 'solo', 'sidehold'].includes(key)) throw Error('unknown parameter ' + key);
      if (['solo', 'sidehold'].includes(key) && raw !== 0) throw Error('unsupported active parameter ' + key);
      if ((key === 'linearphaseactive' || /dynamic$/.test(key)) && raw !== 0) throw Error('unverified DSP mode ' + key);
      flat[key] = raw;
    }
  }
  for (const key of required) if (!(key in flat)) throw Error('missing parameter ' + key);
  if (!record(json.component) || !record(json.component.autogaincomponent) || ![0, 1].includes(json.component.autogaincomponent.legacyAutoGain as number)) throw Error('legacy auto gain missing');
  const other = Object.entries(json.component).filter(([name]) => name !== 'autogaincomponent');
  if (other.some(([, v]) => !record(v) || Object.keys(v).length)) throw Error('unknown EQ component');
  const attrs = Object.entries(flat).filter(([key]) => fields.has(key));
  attrs.push(['gain', 10 ** (flat.gain / 20)], ['autogain2', flat.autogain], ['autogain', json.component.autogaincomponent.legacyAutoGain as number]);
  if (attrs.some(([, n]) => !Number.isFinite(n))) throw Error('nonfinite mapped gain');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<AudioEffectPreset cid="{' + EQ_OLD + '}" version="1" algorithmVersion="1">\n  <Attributes x:id="ParameterData" ' + attrs.map(([key, n]) => key + '="' + n + '"').join(' ') + '/>\n</AudioEffectPreset>\n';
}
async function prepare(song: S1Song, target: CompatibilityTarget): Promise<Prepared> {
  const report: CompatibilityReport = { target, canExport: false, blockers: [], warnings: [
    tr('仅生成实验性兼容副本，尚未在目标版本软件中验证打开与播放。'),
    tr('新版本专属功能、第三方插件和自动化不保证兼容，不会自动渲染或删除。'),
    tr('保留外部音频引用，不会读取或打包工程外的音频文件。'),
    tr('请将兼容副本放在原工程同一目录，以保留相对素材路径。'),
    tr('保留原工程与保存软件版本记录。'),
  ], changes: [], changedEntries: [] };
  const replacements = new Map<string, Uint8Array>(), renames = new Map<string, string>();
  const result = { report, replacements, renames };
  const block = (message: string) => { if (!report.blockers.includes(message)) report.blockers.push(message); };
  if (song.readOnlyDemo) { block(tr('此示例仅供浏览，不支持 MIDI 或工程导出。')); return result; }
  if (![5, 6, 7].includes(target)) { block(tr('仅支持导出到 Studio One 5、6 或 7。')); return result; }
  if (target === 5) report.warnings.push(tr('Studio One 5 目标不会转换歌词轨、视频轨、空间音频等新版功能；已知不兼容的原生插件会阻止导出。'));
  const files = Object.values(song.zip.files).filter(f => !f.dir);
  const names = new Set<string>();
  for (const f of files) { const lower = f.name.toLowerCase(); if (names.has(lower)) block(tr('文件路径存在大小写冲突，无法安全转换。')); names.add(lower); }
  const meta = files.find(f => f.name.toLowerCase() === 'metainfo.xml');
  if (!meta) { block(tr('工程版本信息缺失或重复，无法安全转换。')); return result; }
  let source = 0;
  try {
    const text = await meta.async('text'), tokens = tags(text);
    const format = tokens.filter(t => t.name === 'Attribute' && t.parent?.name === 'MetaInformation' && id(t) === 'Document:FormatVersion');
    const generator = tokens.filter(t => t.name === 'Attribute' && t.parent?.name === 'MetaInformation' && id(t) === 'Document:Generator');
    if (format.length !== 1 || generator.length !== 1) throw Error('version metadata');
    const saved = value(generator[0], 'value') ?? '';
    const version = readProjectVersion({ 'Document:Generator': saved, 'Document:FormatVersion': value(format[0], 'value') ?? '' });
    const major = version.softwareVersion?.split('.')[0];
    if (!version.softwareName || !['6', '7', '8'].includes(major ?? '')) { block(tr('只支持保存于 Studio One 6 / 7 / Fender Studio Pro 8 的已识别工程格式。')); return result; }
    source = Number(major);
    if (value(format[0], 'value')?.trim() !== String(source + 1)) { block(tr('源软件版本与工程格式号不一致，无法安全转换。')); return result; }
    if (target >= source) { block(tr('目标版本必须低于工程保存版本。')); return result; }
    replacements.set(meta.name, encoder.encode(apply(text, [edit(format[0], 'value', String(target + 1))])));
    report.changes.push(tr('调整工程格式号：') + (source + 1) + ' → ' + (target + 1));
  } catch { block(tr('工程版本信息缺失或重复，无法安全转换。')); return result; }
  const eqEntries = new Map<string, { original: string; next: string; references: number }>();
  for (const f of files.filter(f => /\.dsppreset$/i.test(f.name))) {
    if ((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize! > MAX_PRESET) { block(tr('未知或不支持的原生插件状态：') + f.name); continue; }
    const text = await f.async('text');
    try {
      if (target === 5) {
        // The accepted JSON EQ format is newer than EQ². Do not assume that
        // the 6/7 legacy serializer also establishes an EQ³ -> EQ² mapping.
        const state = JSON.parse(text.replace(/^\uFEFF/, ''));
        if (state?.classname === 'Pro EQ') { block(tr('新版 Pro EQ 到 Studio One 5 的转换尚未验证，未导出。') + ' ' + f.name); continue; }
      }
      const converted = convertEq(text), next = f.name.replace(/\.dsppreset$/i, '.fxpreset');
      if (names.has(next.toLowerCase())) throw Error('output preset collision');
      replacements.set(f.name, encoder.encode(converted)); renames.set(f.name, next);
      eqEntries.set(f.name, { original: f.name, next, references: 0 });
      report.changes.push(tr('已转换 Pro EQ 预设及设备引用：') + f.name);
    } catch { block(tr(text.includes('Pro EQ') ? 'Pro EQ 状态不符合已验证转换范围：' : '未知或不支持的原生插件状态：') + f.name); }
  }
  const allowedIds = new Set<Attribute>();
  for (const f of files.filter(f => (/\.xml$/i.test(f.name) || (target === 5 && /\.(?:fxpreset|synthpreset)$/i.test(f.name))) && f.name !== meta.name)) {
    try {
      const text = await f.async('text');
      const clap = /\b(?:format|pluginFormat|type)\s*=\s*["']CLAP["']/i.test(text);
      const olderNativeCheck = target === 5 && (text.toUpperCase().includes(EQ_OLD) || (/^Devices\//i.test(f.name) && /\b(?:x:)?id\s*=\s*["']classInfo["']/i.test(text)));
      if (!new RegExp(EQ_NEW + '|' + COMP_NEW, 'i').test(text) && !/\.dsppreset|presetType\s*=\s*["']dsppreset["']/i.test(text) && !clap && !olderNativeCheck) continue;
      const tokens = tags(text), edits: Edit[] = [];
      if (tokens.some(t => ['uid', 'classID', 'cid'].some(k => value(t, k)?.replace(/[{}]/g, '').toUpperCase() === COMP_NEW))) block(tr('检测到未支持的新版压缩器，未导出以避免丢失插件。'));
      if (target < 7 && tokens.some(t => ['format', 'pluginFormat', 'type'].some(k => value(t, k)?.toUpperCase() === 'CLAP'))) block(tr('检测到 CLAP 插件；Studio One 5 / 6 不支持该插件格式。'));
      if (target === 5) {
        // classInfo is the saved factory identity, not a user-renamable track
        // label. Require the native category to avoid namesake VST plugins.
        const newerNative = tokens.filter(t => id(t) === 'classInfo' && /^\(Native\)(?:\/|$)/i.test(value(t, 'subCategory') ?? '') && /^(?:De[- ]?esser|Vocoder|Lead Architect|Surround (?:Delay|Chorus)|Open ?Air(?:²|2))$/i.test(value(t, 'name') ?? ''));
        for (const device of newerNative) block(tr('Studio One 5 不支持此新版原生插件：') + value(device, 'name'));
        const newEq = tokens.some(t => ['uid', 'classID', 'cid'].some(k => value(t, k)?.replace(/[{}]/g, '').toUpperCase() === EQ_NEW));
        const legacyEq = tokens.some(t => ['uid', 'classID', 'cid'].some(k => value(t, k)?.replace(/[{}]/g, '').toUpperCase() === EQ_OLD));
        // EQ² and EQ³ may share their legacy class ID. The ID alone is not
        // evidence of EQ³; only explicit dynamic-parameter schema markers are.
        const dynamicEq = legacyEq && tokens.some(t => [...t.attrs.keys()].some(k => /^(?:lf|lmf|mf|hmf|hf)dynamic$/.test(k)));
        if (newEq || dynamicEq) block(tr('新版 Pro EQ 到 Studio One 5 的转换尚未验证，未导出。') + ' ' + f.name);
      }
      for (const preset of tokens.filter(t => t.name === 'String' && id(t) === 'presetPath')) {
        const path = value(preset, 'text') ?? '', eq = eqEntries.get(path);
        if (!eq) { if (/\.dsppreset$/i.test(path)) block(tr('未知或不支持的原生插件状态：') + path); continue; }
        // presetPath and device identity must be direct members of the same FX wrapper.
        const wrapper = preset.parent;
        if (!wrapper) throw Error('preset wrapper');
        const inside = tokens.filter(t => t.start >= wrapper.start && t.start < wrapper.close);
        const device = inside.filter(t => t.name === 'UID' && id(t) === 'deviceClassID' && value(t, 'uid') === '{' + EQ_NEW + '}');
        const cls = inside.filter(t => id(t) === 'classInfo' && value(t, 'classID') === '{' + EQ_NEW + '}');
        const ghost = inside.filter(t => id(t) === 'ghostData' && value(t, 'presetType') === 'dsppreset');
        if (device.length !== 1 || cls.length !== 1 || ghost.length !== 1 || ghost[0].parent !== wrapper) throw Error('EQ identity / wrapper');
        const changes = [edit(preset, 'text', eq.next), edit(device[0], 'uid', '{' + EQ_OLD + '}'), edit(cls[0], 'classID', '{' + EQ_OLD + '}'), edit(ghost[0], 'presetType', 'fxpreset')];
        edits.push(...changes); allowedIds.add(device[0].attrs.get('uid')!); allowedIds.add(cls[0].attrs.get('classID')!); eq.references++;
      }
      for (const ghost of tokens.filter(t => id(t) === 'ghostData' && value(t, 'presetType') === 'dsppreset')) if (!edits.some(e => e.start === ghost.attrs.get('presetType')?.start)) block(tr('未知或不支持的原生插件状态：') + f.name);
      if (target !== 5) for (const token of tokens) for (const attr of token.attrs.values()) if (attr.value.toUpperCase().includes(EQ_NEW) && !allowedIds.has(attr)) throw Error('unmapped EQ class identity');
      if (edits.length) replacements.set(f.name, encoder.encode(apply(text, edits)));
    } catch { block(tr('工程 XML 不符合可安全转换的结构：') + f.name); }
  }
  for (const eq of eqEntries.values()) if (!eq.references) block(tr('Pro EQ 引用关系不明确，未导出。') + ' ' + eq.original);
  report.changedEntries = [...replacements.keys()].map(n => renames.get(n) ?? n);
  report.canExport = !report.blockers.length;
  return result;
}
export async function analyzeCompatibility(song: S1Song, target: CompatibilityTarget): Promise<CompatibilityReport> {
  return (await prepare(song, target)).report;
}
export async function exportCompatibleSong(song: S1Song, target: CompatibilityTarget): Promise<{ data: Uint8Array; fileName: string; report: CompatibilityReport }> {
  const { report, replacements, renames } = await prepare(song, target);
  if (!report.canExport) throw Error(tr('导出已阻止：') + report.blockers.join('\n'));
  const output = new JSZip();
  const comment = (song.zip as JSZip & { comment?: string }).comment;
  for (const entry of Object.values(song.zip.files)) {
    const data = entry.dir ? new Uint8Array() : replacements.get(entry.name) ?? await entry.async('uint8array');
    output.file(renames.get(entry.name) ?? entry.name, data, { dir: entry.dir, date: entry.date, comment: entry.comment ?? undefined, unixPermissions: entry.unixPermissions, dosPermissions: entry.dosPermissions, createFolders: false });
  }
  const data = await output.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'UNIX', comment });
  const base = song.fileName.replace(/\.song$/i, '').replace(/[\\/:*?"<>|]/g, '_');
  return { data, fileName: base + '-StudioOne' + target + '-compat.song', report };
}
