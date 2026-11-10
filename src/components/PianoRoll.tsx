import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '../i18n';
import type { MeterChange, S1Part } from '../lib/types';
import { buildBars, formatPosition } from '../lib/timing';
import { partRelativeNotes } from '../lib/midi';

const KEY_WIDTH = 76;
export function pitchName(pitch: number) {
  return ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12] + (Math.floor(pitch / 12) - 1);
}
const isBlack = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12);
const decimal = (n: number) => Number(n.toFixed(3));

/** Read-only piano roll: semitone rows, exact pitches and arrangement-aware ruler. */
export default function PianoRoll({ part, meterMap }: { part: S1Part; meterMap: MeterChange[] }) {
  const notes = useMemo(() => partRelativeNotes(part).filter(n => Number.isInteger(n.pitch) && n.pitch >= 0 && n.pitch <= 127), [part]);
  const [horizontalZoom, setHorizontalZoom] = useState(1);
  const [rowHeight, setRowHeight] = useState(20);
  const [fullRange, setFullRange] = useState(false);
  const [selectedNote, setSelectedNote] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(700);
  const viewport = useRef<HTMLDivElement>(null);
  const origin = part.start ?? 0;
  const length = part.length ?? Math.max(1, ...notes.map(n => n.start + n.length));
  const bars = useMemo(() => buildBars(meterMap, origin + length), [meterMap, origin, length]);
  const gridWidth = Math.max(viewportWidth - KEY_WIDTH - 2, length * 18) * horizontalZoom;
  const scale = gridWidth / Math.max(length, 0.001);
  const pitches = notes.map(n => n.pitch);
  const low = fullRange ? 0 : Math.max(0, Math.floor(((pitches.length ? Math.min(...pitches) : 60) - 2) / 12) * 12);
  const high = fullRange ? 127 : Math.min(127, Math.ceil(((pitches.length ? Math.max(...pitches) : 60) + 3) / 12) * 12 - 1);
  const rows = Array.from({ length: high - low + 1 }, (_, i) => high - i);
  const height = rows.length * rowHeight;
  const selected = selectedNote === null ? null : notes[selectedNote];
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => { setSelectedNote(null); }, [part]);
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const center = notes[0]?.pitch ?? 60;
    el.scrollTop = Math.max(0, (high - center + 0.5) * rowHeight - (el.clientHeight - 25) / 2);
  }, [part, fullRange, rowHeight, high]);

  const marks: { beat: number; label: string; bar: boolean }[] = [];
  for (const [barIndex, b] of bars.entries()) {
    const beatSize = 4 / b.denominator;
    for (let i = 0; i < b.numerator; i++) {
      const beat = b.beat + i * beatSize;
      if (beat >= (bars[barIndex + 1]?.beat ?? Infinity) - 1e-8) break;
      if (beat >= origin - 1e-8 && beat <= origin + length + 1e-8 && (i === 0 || beatSize * scale >= 22)) {
        marks.push({ beat, label: i === 0 ? String(b.number) : `${b.number}.${i + 1}`, bar: i === 0 });
      }
    }
  }
  // A trimmed part can start midway through a bar. Always label its left edge.
  if (!marks.some(m => Math.abs(m.beat - origin) < 1e-8)) marks.unshift({ beat: origin, label: formatPosition(origin, bars), bar: true });
  let lastLabel = -Infinity;
  return <div className="pianoRoll">
    <div className="pianoControls">
      <label>{tr('时间缩放')} <input aria-label={tr('钢琴窗时间缩放')} type="range" min="1" max="8" step="0.5" value={horizontalZoom} onChange={e => setHorizontalZoom(Number(e.target.value))} /></label>
      <label>{tr('音高缩放')} <input aria-label={tr('钢琴窗音高缩放')} type="range" min="14" max="32" step="2" value={rowHeight} onChange={e => setRowHeight(Number(e.target.value))} /></label>
      <button className={fullRange ? 'active' : ''} aria-pressed={fullRange} onClick={() => setFullRange(v => !v)}>{tr(fullRange ? '适配音域' : '完整键盘')}</button>
      <small>{tr('中央 C = C4 / MIDI 60')}</small>
    </div>
    <div className="pianoRollViewport" ref={viewport} tabIndex={0} aria-label={tr('只读钢琴窗，可横向和纵向滚动')}>
      <div className="pianoSurface" style={{ width: gridWidth + KEY_WIDTH }}>
        <div className="pianoRuler"><div className="pianoCorner" style={{ width: KEY_WIDTH }}>{tr('音高 / 小节')}</div><div style={{ width: gridWidth, position: 'relative' }}>{marks.map(m => {
          const left = (m.beat - origin) * scale;
          const show = left - lastLabel >= 42;
          if (show) lastLabel = left;
          return <span key={m.beat} style={{ left }} className={m.bar ? 'bar' : ''}>{show ? m.label : ''}</span>;
        })}</div></div>
        <div className="pianoBody" style={{ height }}>
          <div className="pianoKeyboard" style={{ width: KEY_WIDTH, height }}>{rows.map((pitch, i) => <div className={'pianoKey ' + (isBlack(pitch) ? 'black' : 'white') + (pitch % 12 === 0 ? ' octave' : '')} key={pitch} data-pitch={pitch} style={{ top: i * rowHeight, height: rowHeight }} title={`${pitchName(pitch)} · MIDI ${pitch}`}>{pitchName(pitch)} <small>{pitch}</small></div>)}</div>
          <div className="pianoGrid" style={{ width: gridWidth, height }}>
            {rows.map((pitch, i) => <div key={pitch} className={'pianoRow ' + (isBlack(pitch) ? 'black' : '') + (pitch % 12 === 0 ? ' octave' : '')} style={{ top: i * rowHeight, height: rowHeight }} />)}
            {marks.map(m => <div key={m.beat} className={'pianoGridLine ' + (m.bar ? 'bar' : '')} style={{ left: (m.beat - origin) * scale, height }} />)}
            {notes.map((n, i) => {
              const label = `${pitchName(n.pitch)} · MIDI ${n.pitch} · ${tr('起点')} ${formatPosition(origin + n.start, bars)} · ${tr('时值')} ${decimal(n.length)} · ${tr('力度')} ${n.velocity}`;
              return <button key={i} className={'pianoNote ' + (selectedNote === i ? 'selected' : '')} data-pitch={n.pitch} aria-label={label} aria-pressed={selectedNote === i} title={label} onClick={() => setSelectedNote(i)} style={{ left: n.start * scale, top: (high - n.pitch) * rowHeight + 2, width: Math.max(3, n.length * scale), height: rowHeight - 3, opacity: 0.55 + n.velocity / 127 * 0.45 }}><span>{pitchName(n.pitch)}</span></button>;
            })}
            {!notes.length && <span className="pianoEmpty">{tr('此片段没有可显示的音符')}</span>}
          </div>
        </div>
      </div>
    </div>
    <div className="noteDetails" role="status">{selected ? <><b>{pitchName(selected.pitch)}</b><span>MIDI {selected.pitch}</span><span>{tr('起点')} {formatPosition(origin + selected.start, bars)}</span><span>{tr('时值')} {decimal(selected.length)} {tr('拍')}</span><span>{tr('力度')} {selected.velocity}</span></> : <span>{tr('点击音符查看音高、位置、时值和力度')}</span>}</div>
  </div>;
}
