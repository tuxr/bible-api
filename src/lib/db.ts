/**
 * D1 Database query helpers
 */

import type { Env, VerseRow, BookRow, TranslationRow } from "../types.js";
import type { ParsedReference } from "./parser.js";
import { BOOKS_BY_ID } from "./books-data.js";

/**
 * Discriminated union for database operation results
 */
export type DbResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Fetch verses for a parsed reference
 */
export async function getVerses(
  db: D1Database,
  ref: ParsedReference,
  translationId: string
): Promise<DbResult<VerseRow[]>> {
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

  try {
    const result = await db.prepare(query).bind(...params).all<VerseRow>();
    return { success: true, data: result.results ?? [] };
  } catch (err) {
    console.error("Database error in getVerses:", err);
    return { success: false, error: "Database query failed" };
  }
}

/**
 * Search verses using FTS5
 * Uses a single query with window function to get both results and total count
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
): Promise<DbResult<{ results: VerseRow[]; total: number }>> {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  // Build the search query
  // FTS5 MATCH requires specific syntax for the query
  // Escape double quotes within terms to prevent query injection
  const ftsQuery = query
    .trim()
    .split(/\s+/)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
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

  // Single query using window function for count - halves database load
  const searchQuery = `
    SELECT v.*, COUNT(*) OVER() as total_count
    FROM verses v
    INNER JOIN verses_fts ON v.id = verses_fts.rowid
    INNER JOIN books b ON v.book_id = b.id
    ${whereClause}
    AND verses_fts MATCH ?
    ORDER BY b.book_order, v.chapter, v.verse
    LIMIT ? OFFSET ?
  `;

  try {
    const result = await db
      .prepare(searchQuery)
      .bind(...params, ftsQuery, limit, offset)
      .all<VerseRow & { total_count: number }>();

    const results = result.results ?? [];
    // Get total from first row's window function result, or 0 if no results
    const firstResult = results[0];
    const total = firstResult?.total_count ?? 0;

    // Remove total_count from result objects before returning
    const cleanResults: VerseRow[] = results.map(({ total_count, ...verse }) => verse);

    return {
      success: true,
      data: { results: cleanResults, total },
    };
  } catch (err) {
    console.error("Database error in searchVerses:", err);
    return { success: false, error: "Search query failed" };
  }
}

/**
 * Get all books
 */
export async function getBooks(
  db: D1Database,
  testament?: "OT" | "NT" | "AP"
): Promise<DbResult<BookRow[]>> {
  let query = "SELECT * FROM books";
  const params: string[] = [];

  if (testament) {
    query += " WHERE testament = ?";
    params.push(testament);
  }

  query += " ORDER BY book_order";

  try {
    const result = await db.prepare(query).bind(...params).all<BookRow>();
    return { success: true, data: result.results ?? [] };
  } catch (err) {
    console.error("Database error in getBooks:", err);
    return { success: false, error: "Database query failed" };
  }
}

/**
 * Get all translations
 */
export async function getTranslations(db: D1Database): Promise<DbResult<TranslationRow[]>> {
  try {
    const result = await db
      .prepare("SELECT * FROM translations ORDER BY id")
      .all<TranslationRow>();
    return { success: true, data: result.results ?? [] };
  } catch (err) {
    console.error("Database error in getTranslations:", err);
    return { success: false, error: "Database query failed" };
  }
}

/**
 * Get a single translation
 */
export async function getTranslation(
  db: D1Database,
  id: string
): Promise<DbResult<TranslationRow | null>> {
  try {
    const result = await db
      .prepare("SELECT * FROM translations WHERE id = ?")
      .bind(id)
      .first<TranslationRow>();
    return { success: true, data: result ?? null };
  } catch (err) {
    console.error("Database error in getTranslation:", err);
    return { success: false, error: "Database query failed" };
  }
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
): Promise<DbResult<VerseRow | null>> {
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

  try {
    const result = await db.prepare(query).bind(...params).first<VerseRow>();
    return { success: true, data: result ?? null };
  } catch (err) {
    console.error("Database error in getRandomVerse:", err);
    return { success: false, error: "Database query failed" };
  }
}

/**
 * Get book name from ID
 */
export function getBookName(bookId: string): string {
  return BOOKS_BY_ID.get(bookId)?.name ?? bookId;
}

/**
 * Get all verses for a specific chapter
 */
export async function getChapterVerses(
  db: D1Database,
  bookId: string,
  chapter: number,
  translationId: string
): Promise<DbResult<VerseRow[]>> {
  const query = `
    SELECT * FROM verses
    WHERE translation_id = ?
      AND book_id = ?
      AND chapter = ?
    ORDER BY verse
  `;
  try {
    const result = await db.prepare(query).bind(translationId, bookId, chapter).all<VerseRow>();
    return { success: true, data: result.results ?? [] };
  } catch (err) {
    console.error("Database error in getChapterVerses:", err);
    return { success: false, error: "Database query failed" };
  }
}
