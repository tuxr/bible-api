export type SegmentsFlag = "off" | "on" | "invalid";

export type VerseSegment = {
  text: string;
  speaker: "jesus" | "narrator";
};

export function parseSegmentsFlag(raw: string | undefined): SegmentsFlag {
  if (raw === undefined || raw === "") return "off";
  const value = raw.toLowerCase();
  return value === "1" || value === "true" || value === "yes" ? "on" : "invalid";
}

export function parseStoredSegments(raw: string | null | undefined): VerseSegment[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    if (!parsed.every((item) =>
      typeof item === "object" && item !== null &&
      typeof (item as VerseSegment).text === "string" &&
      ((item as VerseSegment).speaker === "jesus" || (item as VerseSegment).speaker === "narrator")
    )) return undefined;
    return parsed as VerseSegment[];
  } catch {
    return undefined;
  }
}
