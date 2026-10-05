import type { ConnectorCall } from "../types/api";

const TRANSCRIPT_KEYS = [
  "transcript",
  "transcription",
  "recognized_text",
  "display_text",
  "text",
] as const;

function findTranscript(value: unknown, depth = 0): string | null {
  if (depth > 6 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const transcript = findTranscript(item, depth + 1);
      if (transcript) return transcript;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of TRANSCRIPT_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
  }
  for (const candidate of Object.values(record)) {
    const transcript = findTranscript(candidate, depth + 1);
    if (transcript) return transcript;
  }
  return null;
}

export function gnaniTranscript(call: ConnectorCall | undefined): string | null {
  if (!call || call.status !== "live_succeeded") return null;
  return findTranscript(call.response.parsed_response);
}
