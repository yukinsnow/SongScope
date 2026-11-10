import { extractPresetNames, kontaktPresetDetails, stateChunks, type PresetDetails } from './presets';
import type { KontaktState } from './kontakt';
import { t as tr } from '../i18n';

/** Keep potentially large Kontakt inflation off the UI thread. */
export async function extractSavedPreset(bytes: Uint8Array, plugin: string): Promise<PresetDetails> {
  if (!/kontakt/i.test(plugin)) return extractPresetNames(bytes, plugin);
  let chunks: Uint8Array[], copy: Uint8Array;
  try { stateChunks(bytes); copy = bytes.slice(); chunks = stateChunks(copy); }
  catch (e) { return { names: [], source: null, note: (e as Error).message }; }
  return new Promise(resolve => {
    let worker: Worker;
    try { worker = new Worker(new URL('./presets.worker.ts', import.meta.url), { type: 'module' }); }
    catch { resolve({ names: [], source: null, note: tr('无法读取插件状态文件') }); return; }
    const finish = (result: PresetDetails) => { clearTimeout(timer); worker.terminate(); resolve(result); };
    const timer = setTimeout(() => finish({ names: [], source: null, note: tr('插件状态解析超时') }), 8000);
    worker.onmessage = (e: MessageEvent<{ state: KontaktState | null; error?: boolean }>) => {
      if (e.data.error) finish({ names: [], source: null, note: tr('无法读取插件状态文件') });
      else if (e.data.state) finish(kontaktPresetDetails(e.data.state));
      // Compatibility scan for small legacy/non-NI states only. Large unknown
      // states must not turn the UI thread into an unbounded text scanner.
      else finish(bytes.length <= 256 * 1024 ? extractPresetNames(bytes, plugin) : {
        names: [], source: null, note: tr('保存状态未暴露可识别名称（可能被压缩或使用私有格式）'),
      });
    };
    worker.onerror = () => finish({ names: [], source: null, note: tr('无法读取插件状态文件') });
    // Transfer a private copy so parsing never detaches the archive's saved bytes.
    worker.postMessage({ chunks }, [copy.buffer]);
  });
}
