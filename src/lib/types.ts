import type JSZip from "jszip";

export type TrackType =
  | "audio"
  | "instrument"
  | "automation"
  | "folder"
  | "bus"
  | "fx"
  | "unknown";

export interface S1Part {
  clipId: string | null;
  name: string;
  /** arrangement position, in beats */
  start: number | null;
  /** part length, in beats */
  length: number | null;
  /** content offset inside the source clip, in beats */
  offset: number;
  timeFormat: number;
  /** notes decoded from the referenced .musicx */
  notes: NoteEvent[];
  noteCount: number;
  mediaPath: string | null;
  element: Element;
}

export interface S1AudioEvent {
  clipId: string | null;
  /** Saved event name, or the source sample filename when unnamed. */
  name: string;
  eventName: string;
  sampleName: string;
  path: string | null;
  /** Arrangement position and duration normalized to quarter-note beats. */
  start: number | null;
  length: number | null;
  /** Source offset in the original event timeFormat (0 = seconds, 2 = beats). */
  offset: number;
  timeFormat: number;
  /** Start is stored in the track's unit, independently of the event length. */
  positionTimeFormat: number;
}

export interface S1Track {
  id: string;
  name: string;
  type: TrackType;
  mediaType: string | null;
  color: string | null;
  channelId: string | null;
  parentFolderId: string | null;
  element: Element;
  parts: S1Part[];
  audioEvents: S1AudioEvent[];
  audioFiles: { clipId: string | null; eventName: string; name: string; path: string | null }[];
  instrument: string | null;
  plugins: PluginRef[];
  inserts: PluginRef[];
  sends: PluginRef[];
  depth: number;
}

export interface PluginRef {
  name: string;
  vendor?: string | null;
  category?: string | null;
  subCategory?: string | null;
  native?: boolean;
  format?: "instrument" | "effect" | "unknown";
  preset?: string | null;
  presetPath?: string | null;
  presetNames?: string[];
  presetSource?: string | null;
  presetNote?: string;
  /** Set only from a validated NI EncryptionItem, not from a failed decoder. */
  presetEncrypted?: boolean;
  /** Set only when the validated Kontakt state contains no loaded instruments. */
  presetEmpty?: boolean;
}

export interface TempoChange { beat: number; bpm: number; curveType: number; raw: Record<string,string> }
export interface MeterChange { beat: number; numerator: number; denominator: number }

export interface S1Song {
  fileName: string;
  zipEntries: string[];
  tracks: S1Track[];
  folders: S1Track[];
  plugins: PluginRef[];
  tempo: number | null;
  tempoMap: TempoChange[];
  meterMap: MeterChange[];
  timeSignature: string | null;
  /** mediaID -> media:/// path from mediapool.xml */
  mediaPool: Map<string, string>;
  songTitle: string | null;
  artwork: string | null;
  metadata: Record<string, string>;
  warnings: string[];
  xmlDocs: Record<string, Document>;
  zip: JSZip;
}

export interface NoteEvent {
  pitch: number;
  velocity: number;
  start: number;
  length: number;
}
