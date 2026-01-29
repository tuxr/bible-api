/**
 * D1 Database query helpers
 */

import type { Env, VerseRow, BookRow, TranslationRow } from "../types.js";
import type { ParsedReference } from "./parser.js";
import { BOOKS_BY_ID } from "./books-data.js";

/**
 * Fetch verses for a parsed reference
 */
export async function getVerses(
  db: D1Database,
  ref: ParsedReference,
  translationId: string
): Promise<VerseRow[]> {
  const { book, startChapter, startVerse, endChapter, endVerse } = ref;

  let query: string;
  let params: (string | number)[];

  if (startChapter === endChapter) {
    // Same chapter
    if (startVerse === null || endVerse === null) {
      // Whole chapter
      query = `
        SELECT * FROM verses
        WHERE translation_id = ?
          AND book_id = ?
          AND chapter = ?
        ORDER BY verse
      `;
      params = [translationId, book.id, startChapter];
    } else {
      // Verse range in single chapter
      query = `
        SELECT * FROM verses
        WHERE translation_id = ?
          AND book_id = ?
          AND chapter = ?
          AND verse >= ?
          AND verse <= ?
        ORDER BY verse
      `;
      params = [translationId, book.id, startChapter, startVerse, endVerse];
    }
  } else {
    // Multi-chapter range
    // Get verses from start chapter (from startVerse to end),
    // all verses from middle chapters,
    // verses from end chapter (from 1 to endVerse)
    query = `
      SELECT * FROM verses
      WHERE translation_id = ?
        AND book_id = ?
        AND (
          (chapter = ? AND verse >= ?)
          OR (chapter > ? AND chapter < ?)
          OR (chapter = ? AND verse <= ?)
        )
      ORDER BY chapter, verse
    `;
    params = [
      translationId,
      book.id,
      startChapter,
      startVerse ?? 1,
      startChapter,
      endChapter,
      endChapter,
      endVerse ?? 999, // Large number to get all verses if null
    ];
  }

  const result = await db.prepare(query).bind(...params).all<VerseRow>();
  return result.results ?? [];
}

/**
 * Search verses using FTS5
 */
export async function searchVerses(
  db: D1Database,
  query: string,
  translationId: string,
  options?: {
    bookId?: string;
    testament?: "OT" | "NT" | "AP";
    limit?: number;
    offset?: number;
  }
): Promise<{ results: VerseRow[]; total: number }> {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  // Build the search query
  // FTS5 MATCH requires specific syntax for the query
  const ftsQuery = query
    .trim()
    .split(/\s+/)
    .map((term) => `"${term}"`)
    .join(" ");

  let whereClause = "WHERE v.translation_id = ?";
  const params: (string | number)[] = [translationId];

  if (options?.bookId) {
    whereClause += " AND v.book_id = ?";
    params.push(options.bookId);
  }

  if (options?.testament) {
    whereClause += " AND b.testament = ?";
    params.push(options.testament);
  }

  // Count total matches
  const countQuery = `
    SELECT COUNT(*) as total
    FROM verses v
    INNER JOIN verses_fts ON v.id = verses_fts.rowid
    INNER JOIN books b ON v.book_id = b.id
    ${whereClause}
    AND verses_fts MATCH ?
  `;

  const countResult = await db.prepare(countQuery).bind(...params, ftsQuery).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  // Get results
  const searchQuery = `
    SELECT v.*
    FROM verses v
    INNER JOIN verses_fts ON v.id = verses_fts.rowid
    INNER JOIN books b ON v.book_id = b.id
    ${whereClause}
    AND verses_fts MATCH ?
    ORDER BY b.book_order, v.chapter, v.verse
    LIMIT ? OFFSET ?
  `;

  const result = await db
    .prepare(searchQuery)
    .bind(...params, ftsQuery, limit, offset)
    .all<VerseRow>();

  return {
    results: result.results ?? [],
    total,
  };
}

/**
 * Get all books
 */
export async function getBooks(
  db: D1Database,
  testament?: "OT" | "NT" | "AP"
): Promise<BookRow[]> {
  let query = "SELECT * FROM books";
  const params: string[] = [];

  if (testament) {
    query += " WHERE testament = ?";
    params.push(testament);
  }

  query += " ORDER BY book_order";

  const result = await db.prepare(query).bind(...params).all<BookRow>();
  return result.results ?? [];
}

/**
 * Get all translations
 */
export async function getTranslations(db: D1Database): Promise<TranslationRow[]> {
  const result = await db
    .prepare("SELECT * FROM translations ORDER BY id")
    .all<TranslationRow>();
  return result.results ?? [];
}

/**
 * Get a single translation
 */
export async function getTranslation(
  db: D1Database,
  id: string
): Promise<TranslationRow | null> {
  const result = await db
    .prepare("SELECT * FROM translations WHERE id = ?")
    .bind(id)
    .first<TranslationRow>();
  return result ?? null;
}

/**
 * Get a random verse with optional filters
 */
export async function getRandomVerse(
  db: D1Database,
  translationId: string,
  options?: {
    bookId?: string;
    testament?: "OT" | "NT" | "AP";
  }
): Promise<VerseRow | null> {
  let query = `
    SELECT v.*
    FROM verses v
    INNER JOIN books b ON v.book_id = b.id
    WHERE v.translation_id = ?
  `;
  const params: string[] = [translationId];

  if (options?.bookId) {
    query += " AND v.book_id = ?";
    params.push(options.bookId);
  }

  if (options?.testament) {
    query += " AND b.testament = ?";
    params.push(options.testament);
  }

  query += " ORDER BY RANDOM() LIMIT 1";

  const result = await db.prepare(query).bind(...params).first<VerseRow>();
  return result ?? null;
}

/**
 * Get book name from ID
 */
export function getBookName(bookId: string): string {
  return BOOKS_BY_ID.get(bookId)?.name ?? bookId;
}
