/** Helpers for the opt-in `words=1` chapter payload and the lexicon routes. */

import type { LexiconEntry, VerseWord } from "./word-tagging.js";

/** Parse a stored `verses.words` column, ignoring anything malformed. */
export function parseStoredWords(raw: string | null | undefined): VerseWord[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    if (!parsed.every((word) => typeof word === "object" && word !== null && typeof (word as VerseWord).surface === "string")) {
      return undefined;
    }
    return parsed as VerseWord[];
  } catch {
    return undefined;
  }
}

/** Every lexicon id a set of words points at, parts included, in first-seen order. */
export function collectLexiconIds(verses: Iterable<VerseWord[]>): string[] {
  const ids = new Set<string>();
  for (const words of verses) {
    for (const word of words) {
      if (word.strong) ids.add(word.strong);
      for (const part of word.parts ?? []) if (part.strong) ids.add(part.strong);
    }
  }
  return [...ids];
}

/** Parse stored lexicon JSON rows into a map keyed by id, in the requested id order. */
export function toLexiconMap(ids: string[], rows: Map<string, string>): Record<string, LexiconEntry> {
  const entries: Record<string, LexiconEntry> = {};
  for (const id of ids) {
    const raw = rows.get(id);
    if (!raw) continue;
    try {
      entries[id] = JSON.parse(raw) as LexiconEntry;
    } catch {
      // A corrupt row is dropped rather than failing the whole response.
    }
  }
  return entries;
}

export const MAX_LEXICON_IDS = 200;

/** Normalize a lexicon id: "g01841" → "G1841", "h1254a" → "H1254A". Undefined for anything else. */
export function normalizeLexiconId(raw: string): string | undefined {
  const match = raw.trim().match(/^(?:([G])0*(\d{1,5})|([H])0*(\d{1,5})([A-F])?)$/i);
  if (!match) return undefined;
  const [prefix, digits, letter = ""] = match[1] ? [match[1], match[2]!] : [match[3]!, match[4]!, match[5]];
  if (Number(digits) === 0) return undefined;
  return `${prefix.toUpperCase()}${Number(digits)}${letter.toUpperCase()}`;
}
