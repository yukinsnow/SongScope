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
}

export interface S1Song {
  fileName: string;
  zipEntries: string[];
  tracks: S1Track[];
  folders: S1Track[];
  plugins: PluginRef[];
  tempo: number | null;
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
