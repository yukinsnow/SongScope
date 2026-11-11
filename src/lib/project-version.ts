import type { ProjectVersion } from "./types";

/** Saved application version and document format are separate, unrelated fields. */
export function readProjectVersion(metadata: Record<string, string>): ProjectVersion {
  const rawGenerator = metadata["Document:Generator"] || null;
  const generator = rawGenerator?.trim() ?? "";
  // Known saved product names only. Do not infer a DAW from arbitrary generator text.
  const match = /^(Studio ?One|(?:Fender )?Studio Pro)(?:(?:\s*\/\s*|\s+)(\d+(?:\.\d+){0,3}))?$/i.exec(generator);
  const rawFormat = metadata["Document:FormatVersion"]?.trim() ?? "";
  return {
    softwareName: match ? "Studio One / Fender Studio Pro" : null,
    softwareVersion: match?.[2] ?? null,
    formatVersion: /^\d+$/.test(rawFormat) ? rawFormat : null,
    rawGenerator,
  };
}
