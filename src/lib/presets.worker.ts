import { readKontaktState } from './kontakt';
self.onmessage = (event: MessageEvent<{ chunks: Uint8Array[] }>) => {
  try { self.postMessage({ state: readKontaktState(event.data.chunks) }); }
  catch { self.postMessage({ state: null, error: true }); }
};
