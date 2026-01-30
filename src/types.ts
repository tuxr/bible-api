/**
 * TypeScript types for the Bible API
 */

// Cloudflare Worker environment bindings
export interface Env {
  DB: D1Database;
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
}

// API response types
export interface VerseResponse {
  book: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface VersesApiResponse {
  reference: string;
  translation: {
    id: string;
    name: string;
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
  status: number;
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
  };
  verses: Array<{
    verse: number;
    text: string;
  }>;
  verse_count: number;
  navigation: ChapterNavigation;
}
