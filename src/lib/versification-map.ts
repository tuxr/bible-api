/**
 * Versification map types and loader.
 * Source: data/versification-map.json (derived from D1 by data/scripts/derive-versification.ts)
 */

import mapData from "../../data/versification-map.json" with { type: "json" };

export type DivergenceKind =
  | "superscription_as_v1"
  | "chapter_boundary_split"
  | "wlc_extra"
  | "english_extra"
  | "split_merge";

export interface VerseRef {
  chapter: number;
  verse: number;
}

export interface MappingEntry {
  book_id: string;
  kind: DivergenceKind;
  wlc: VerseRef | null;
  english: VerseRef | null;
  kjv: VerseRef | null;
  note?: string;
}

export interface WlcInventoryBook {
  book_id: string;
  name: string;
  chapters: number;
  total_verses: number;
  chapter_verse_counts: Record<string, number>;
}

export interface GoldenVerse {
  ref: string;
  book_id: string;
  chapter: number;
  verse: number;
  text: string;
  note: string;
}

export interface VersificationMap {
  version: number;
  generated_at: string;
  source: string;
  design: {
    principle: string;
    scope: string;
    extensibility: string;
  };
  wlc_inventory: WlcInventoryBook[];
  divergent_chapters: Array<{
    book_id: string;
    chapter: number;
    wlc_count: number;
    web_count: number;
    kjv_count: number;
    kinds: DivergenceKind[];
  }>;
  mappings: MappingEntry[];
  golden_verses: GoldenVerse[];
  textbook_crosscheck: {
    found: string[];
    missing_from_data: Array<{ id: string; description: string }>;
    unexpected_in_data: string[];
  };
}

export const versificationMap = mapData as VersificationMap;

export function verseKey(
  translationId: string,
  bookId: string,
  chapter: number,
  verse: number
): string {
  return `${translationId}:${bookId}:${chapter}:${verse}`;
}