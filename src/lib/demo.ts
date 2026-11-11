import JSZip from 'jszip';
import snapshot from '../data/demo-song.json';
import type { PluginRef, S1Song, S1Track } from './types';

export const demoCover = new URL('../data/demo-cover.png', import.meta.url).href;

/** Only curated display data is shipped: no source ZIP, XML or plugin states. */
export function loadDemoSong(): S1Song {
  const data = structuredClone(snapshot);
  const emptyElement = () => document.createElement('demo');
  const plugin = (p: unknown) => ({ ...(p as PluginRef) });
  const tracks: S1Track[] = data.tracks.map(t => ({
    ...t,
    readOnlyDemo: true,
    type: t.type as S1Track['type'],
    element: emptyElement(),
    plugins: t.plugins.map(plugin), inserts: t.inserts.map(plugin), sends: t.sends.map(plugin),
    parts: t.parts.map(p => ({ ...p, clipId: null, mediaPath: null, element: emptyElement(), readOnlyDemo: true })),
    audioEvents: t.audioEvents.map(e => ({ ...e, clipId: null, path: null })),
    audioFiles: t.audioFiles.map(f => ({ ...f, clipId: null, path: null })),
  }));
  return {
    ...data,
    readOnlyDemo: true,
    tracks, folders: tracks.filter(t => t.type === 'folder'), plugins: data.plugins.map(plugin),
    tempoMap: data.tempoMap.map(e => ({ ...e, raw: {} })),
    artwork: demoCover,
    zipEntries: [], mediaPool: new Map(), xmlDocs: {}, zip: new JSZip(), warnings: [],
  };
}
