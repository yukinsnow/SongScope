import type { S1Song } from "./types";
import { detectNoteSchema, readNotes, guessUnit } from "./notes";
import { xid } from "./xml";

export async function buildDiagnostics(song: S1Song): Promise<string> {
  const noteSchemas: unknown[] = [];
  const partSamples: unknown[] = [];
  const report: Record<string, unknown> = {
    file: song.fileName,
    entries: song.zipEntries,
    tracks: song.tracks.map((t) => ({
      name: t.name, id: t.id, tag: t.element.tagName, type: t.type,
      mediaType: t.mediaType, channelId: t.channelId, parentFolderId: t.parentFolderId,
      parts: t.parts.map((p) => ({ name: p.name, clipId: p.clipId, start: p.start, length: p.length, notes: p.noteCount })),
    })),
    plugins: song.plugins,
    warnings: song.warnings,
    xmlElements: {} as Record<string, number>,
    partSamples,
  };

  // element census across all known xml docs
  const census: Record<string, number> = {};
  for (const doc of Object.values(song.xmlDocs)) {
    for (const el of Array.from(doc.getElementsByTagName("*"))) {
      census[el.tagName] = (census[el.tagName] ?? 0) + 1;
    }
  }
  report.xmlElements = census;

  const parts = song.tracks.flatMap((t) => t.parts);
  partSamples.push(...parts.slice(0, 3).map((p) => ({
    track: p.name,
    clipId: p.clipId,
    xml: p.element.outerHTML.slice(0, 6000),
  })));

  for (const p of parts.slice(0, 5)) {
    const schema = detectNoteSchema(p.element);
    if (schema) {
      const notes = readNotes(p.element, schema);
      noteSchemas.push({ part: p.name, schema, count: notes.length, unit: guessUnit(p.length, notes), first: notes.slice(0, 8) });
    }
  }

  // Cross-reference clipIDs against every other zip entry (find where note data lives)
  const ids = parts.map((p) => p.clipId).filter(Boolean) as string[];
  const refs: Record<string, string[]> = {};
  if (ids.length) {
    for (const name of song.zipEntries) {
      if (name === "Song/song.xml") continue;
      if (!/\.(xml|json|txt|data)$/i.test(name)) continue;
      const f = song.zip.file(name);
      if (!f) continue;
      try {
        const text = await f.async("text");
        for (const id of ids) if (text.includes(id)) (refs[id] ??= []).push(name);
      } catch { /* binary */ }
    }
  }
  report.clipIdReferences = refs;
  report.noteSchemas = noteSchemas;

  return JSON.stringify(report, null, 2);
}
