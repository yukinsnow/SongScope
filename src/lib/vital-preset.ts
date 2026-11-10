import { t as tr } from '../i18n';

/** Schema-based interoperability reader, not Vital DSP/source code.
 * Official format sources:
 * https://github.com/mtytel/vital/blob/main/src/plugin/synth_plugin.cpp
 *   SynthPlugin::getStateInformation: UTF-8 JSON written with a NUL terminator.
 * https://github.com/mtytel/vital/blob/main/src/common/load_save.cpp
 *   LoadSave::stateToJson: root preset_name, synth_version, and settings.
 * The bundled JUCE VST3 wrapper optionally prefixes VstW + CcnK/FBCh and
 * appends private state after the terminating NUL. No audio/plugin is loaded.
 */
interface VitalPresetDetails { names: string[]; source: string | null; note?: string }
const MAX_STATE = 32 * 1024 * 1024;
const ascii = (bytes: Uint8Array, offset: number, count: number) => new TextDecoder().decode(bytes.subarray(offset, offset + count));

function unwrapState(bytes: Uint8Array): Uint8Array | null {
  if (!bytes.length || bytes.length > MAX_STATE) return null;
  let state = bytes;
  if (ascii(state, 0, 4) === 'VstW') {
    if (state.length < 16) return null;
    const view = new DataView(state.buffer, state.byteOffset, state.byteLength);
    const headerLength = view.getUint32(4, false) + 8;
    if (view.getUint32(8, false) !== 1 || headerLength < 16 || headerLength > state.length) return null;
    state = state.subarray(headerLength);
    if (ascii(state, 0, 4) !== 'CcnK') return null;
  }
  if (ascii(state, 0, 4) === 'CcnK') {
    if (state.length < 12) return null;
    const view = new DataView(state.buffer, state.byteOffset, state.byteLength);
    const magic = ascii(state, 8, 4), header = magic === 'FBCh' ? 160 : magic === 'FPCh' ? 60 : 0;
    const declaredLength = view.getUint32(4, false) + 8;
    if (!header || state.length < header || declaredLength < header || declaredLength > state.length) return null;
    const length = view.getUint32(header - 4, false);
    if (length > declaredLength - header) return null;
    state = state.subarray(header, header + length);
  }
  return state;
}

/** Recognize only Vital's root preset metadata. In particular, names in sample,
 * wavetables, LFOs, comments, or other nested objects are not preset names. */
export function extractVitalPreset(chunks: Uint8Array[], pluginName: string): VitalPresetDetails | null {
  if (!/^Vital(?:\b|$)/i.test(pluginName.trim())) return null;
  for (const chunk of chunks) {
    const state = unwrapState(chunk);
    if (!state) continue;
    const terminator = state.indexOf(0);
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(terminator < 0 ? state : state.subarray(0, terminator)).trim();
      if (!text.startsWith('{')) continue;
      const data: unknown = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
      const root = data as Record<string, unknown>;
      if (typeof root.synth_version !== 'string' || !/^\d+\.\d+(?:\.\d+)?(?:[-+].*)?$/.test(root.synth_version) ||
          !root.settings || typeof root.settings !== 'object' || Array.isArray(root.settings) || typeof root.preset_name !== 'string') continue;
      const name = root.preset_name.trim();
      if (!name || name.length > 180 || /[\u0000-\u001f\ufffd]/.test(name)) continue;
      return { names: [name], source: 'Vital JSON · preset_name', note: tr('读取工程保存的音色槽位名称，未运行插件验证') };
    } catch { /* Malformed, unsupported, or truncated state: do not guess. */ }
  }
  return { names: [], source: null, note: tr('保存状态未暴露可识别名称（可能被压缩或使用私有格式）') };
}
