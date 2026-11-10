import { t as tr } from '../i18n';
import type { S1AudioEvent, TempoChange } from './types';
import { attr, descendants } from './xml';

function numberAttr(el: Element, ...names: string[]): number | null {
  for (const name of names) {
    const value = el.getAttribute(name);
    if (value !== null && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function validTempos(map: TempoChange[]): TempoChange[] {
  const events = map.filter(e => Number.isFinite(e.beat) && e.beat >= 0 && Number.isFinite(e.bpm) && e.bpm > 0).sort((a, b) => a.beat - b.beat);
  if (!events.length || events[0].beat > 0) events.unshift({ beat: 0, bpm: 120, curveType: 0, raw: {} });
  return events;
}

/** Tempo-node integration. Nonzero curve types use the same documented step
 * approximation as MIDI export, rather than assuming the whole song's BPM. */
export function secondsAtBeat(beat: number, map: TempoChange[]): number {
  const events = validTempos(map);
  let seconds = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i], end = events[i + 1]?.beat ?? Infinity;
    if (beat <= end) return seconds + (beat - event.beat) * 60 / event.bpm;
    seconds += (end - event.beat) * 60 / event.bpm;
  }
  return seconds;
}

export function beatAtSeconds(seconds: number, map: TempoChange[]): number {
  const events = validTempos(map);
  let elapsed = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i], end = events[i + 1]?.beat ?? Infinity;
    const duration = (end - event.beat) * 60 / event.bpm;
    if (seconds <= elapsed + duration) return event.beat + (seconds - elapsed) * event.bpm / 60;
    elapsed += duration;
  }
  return 0;
}

export function sampleFileName(path: string | null): string {
  let decoded = path || '';
  try { decoded = decodeURIComponent(decoded); } catch { /* Keep malformed saved URIs visible. */ }
  return decoded.split(/[\\/]/).pop() || '';
}

/** Read saved references and timing only. Never fetch or decode source audio.
 * Studio One stores event.start in the containing track's timeFormat, while
 * event.timeFormat governs length/offset (verified against a 783-event song). */
export function readAudioEvents(track: Element, mediaPool: Map<string, string>, tempoMap: TempoChange[]): S1AudioEvent[] {
  const positionTimeFormat = numberAttr(track, 'timeFormat') ?? 2;
  return descendants(track, 'AudioEvent').map(event => {
    const clipId = attr(event, 'clipID');
    const path = (clipId && mediaPool.get(clipId)) || attr(event, 'path', 'url');
    const eventName = (attr(event, 'name') || '').trim(), sampleName = sampleFileName(path);
    const rawStart = numberAttr(event, 'start', 'position', 'startTime');
    const rawLength = numberAttr(event, 'length', 'duration');
    const timeFormat = numberAttr(event, 'timeFormat') ?? positionTimeFormat;
    const start = rawStart === null ? null : positionTimeFormat === 2 ? rawStart : positionTimeFormat === 0 ? beatAtSeconds(rawStart, tempoMap) : null;
    let length: number | null = null;
    if (rawLength !== null && rawLength >= 0) {
      if (timeFormat === 2) length = rawLength;
      else if (timeFormat === 0 && start !== null) length = beatAtSeconds(secondsAtBeat(start, tempoMap) + rawLength, tempoMap) - start;
    }
    return { clipId, path, eventName, sampleName, name: eventName || sampleName || tr('未命名素材'), start, length, offset: numberAttr(event, 'offset') ?? 0, timeFormat, positionTimeFormat };
  });
}
