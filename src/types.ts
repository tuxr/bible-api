/**
 * TypeScript types for the Bible API
 */

import type { Attribution, LexiconEntry, VerseWord } from "./lib/word-tagging.js";

export type { Attribution, LexiconEntry, VerseWord, WordPart } from "./lib/word-tagging.js";

// Cloudflare Worker environment bindings
export interface Env {
  DB: D1Database;
  SEARCH_RATE_LIMITER: RateLimit;
  RANDOM_RATE_LIMITER: RateLimit;
}

// Database row types
export interface TranslationRow {
  id: string;
  name: string;
  language: string;
  license: string | null;
  description: string | null;
}

export interface BookRow {
  id: string;
  name: string;
  testament: "OT" | "NT" | "AP";
  book_order: number;
  chapters: number;
  aliases: string; // JSON string
}

export interface VerseRow {
  id: number;
  translation_id: string;
  book_id: string;
  chapter: number;
  verse: number;
  text: string;
  segments?: string | null;
  words?: string | null;
}

// API response types
export interface VerseResponse {
  book: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  segments?: Array<{ text: string; speaker: "jesus" | "narrator" }>;
}

export interface VersesApiResponse {
  reference: string;
  translation: {
    id: string;
    name: string;
    language: string;
  };
  verses: VerseResponse[];
  text: string; // Combined text of all verses
}

export interface SearchResult {
  book: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  reference: string;
}

export interface SearchApiResponse {
  query: string;
  translation: string;
  total: number;
  results: SearchResult[];
}

export interface BookApiResponse {
  id: string;
  name: string;
  testament: "OT" | "NT" | "AP";
  chapters: number;
  aliases: string[];
}

export interface TranslationApiResponse {
  id: string;
  name: string;
  language: string;
  license: string | null;
  description: string | null;
}

export interface ErrorResponse {
  error: string;
  hint?: string;
}

// Chapter endpoint types
export interface ChapterNavigationTarget {
  book: string;
  chapter: number;
  testament: "OT" | "NT" | "AP";
}

export interface ChapterNavigation {
  previous: ChapterNavigationTarget | null;
  next: ChapterNavigationTarget | null;
}

export interface ChapterApiResponse {
  book: {
    id: string;
    name: string;
    testament: "OT" | "NT" | "AP";
  };
  chapter: number;
  translation: {
    id: string;
    name: string;
    language: string;
  };
  verses: Array<{
    verse: number;
    text: string;
    segments?: Array<{ text: string; speaker: "jesus" | "narrator" }>;
    words?: VerseWord[];
  }>;
  verse_count: number;
  navigation: ChapterNavigation;
  /** Present with `words=1` when the translation is tagged: entries for this chapter's words only. */
  lexicon?: Record<string, LexiconEntry>;
  attribution?: Attribution[];
}

export interface LexiconApiResponse {
  entries: Record<string, LexiconEntry>;
  attribution: Attribution[];
}
