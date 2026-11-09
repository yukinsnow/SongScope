const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 840, show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  await win.loadFile(path.join(__dirname, "../dist/index.html"));
  const b64 = fs.readFileSync(path.join(__dirname, "../fixtures/smoke.song")).toString("base64");
  const result = await win.webContents.executeJavaScript(`(async () => {
    const bin = atob("${b64}");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const song = await window.__s1.readSong("smoke.song", bytes.buffer);
    const refs = song.tracks.flatMap(t => t.parts.map(p => ({ track: t, part: p })));
    const midi = window.__s1.exportPartsToMidi(refs, { unit: "auto" });
    const notes = window.__s1.midiNotesFromBytes(midi.buffer.slice(midi.byteOffset, midi.byteOffset + midi.byteLength));
    const imp = await window.__s1.importMidiInto(song, midi.buffer.slice(midi.byteOffset, midi.byteOffset + midi.byteLength), { targetTrackId: song.tracks[1].id, startTick: 3840, partName: "Imported" });
    const resong = await window.__s1.readSong("edited.song", imp.bytes.buffer.slice(imp.bytes.byteOffset, imp.bytes.byteOffset + imp.bytes.byteLength));
    return {
      title: song.songTitle, tempo: song.tempo, timeSignature: song.timeSignature,
      tracks: song.tracks.map(t => ({ name: t.name, type: t.type, channel: t.channelId, inst: t.instrument, plugins: t.plugins.map(p => p.name), parts: t.parts.length, notes: t.parts.reduce((n,p)=>n+p.noteCount,0) })),
      plugins: song.plugins.map(p => p.name), warnings: song.warnings,
      midiBytes: midi.length, midiNotes: notes.notes.length, importWarnings: imp.warnings,
      reTracks: resong.tracks.map(t => ({ name: t.name, parts: t.parts.length, notes: t.parts.reduce((n,p)=>n+p.noteCount,0) })),
    };
  })()`);
  console.log(JSON.stringify(result, null, 2));
  app.quit();
});
