/**
 * D1 Database query helpers
 */

import type { Env, VerseRow, TranslationRow } from "../types.js";
import type { ParsedReference } from "./parser.js";
import { BOOKS_BY_ID } from "./books-data.js";
import { normalizeSearchQuery } from "./hebrew.js";

/**
 * Discriminated union for database operation results
 */
export type DbResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type VerseQueryParts = {
  whereClause: string;
  params: (string | number)[];
  orderBy: string;
};

/**
 * Build WHERE clause and params for a single parsed reference.
 * Shared by getVerses() and getVersesForMultipleReferences().
 */
function buildVerseQueryParts(ref: ParsedReference, translationId: string): VerseQueryParts {
  const { book, startChapter, startVerse, endChapter, endVerse } = ref;

  if (startChapter === endChapter) {
    // Same chapter
    if (startVerse === null || endVerse === null) {
      // Whole chapter
      return {
        whereClause: `
          translation_id = ?
            AND book_id = ?
            AND chapter = ?
        `,
        params: [translationId, book.id, startChapter],
        orderBy: "verse",
      };
    }

    // Verse range in single chapter
    return {
      whereClause: `
        translation_id = ?
          AND book_id = ?
          AND chapter = ?
          AND verse >= ?
          AND verse <= ?
      `,
      params: [translationId, book.id, startChapter, startVerse, endVerse],
      orderBy: "verse",
    };
  }

  // Multi-chapter range
  // Get verses from start chapter (from startVerse to end),
  // all verses from middle chapters,
  // verses from end chapter (from 1 to endVerse, or all if endVerse is null)
  //
  // startVerse: null → verse >= 1 on the start chapter (whole chapter from the start).
  //
  // Intentional correctness fix (refactor from getVerses): branch the end-chapter
  // clause instead of using a 999 sentinel upper bound. null endVerse means "to end
  // of chapter" (per parser.ts), so match the whole end chapter; an explicit
  // endVerse caps at that verse number. End chapter always starts at verse 1;
  // only the upper bound is conditional.
  const endChapterClause =
    endVerse === null ? "(chapter = ?)" : "(chapter = ? AND verse <= ?)";

  return {
    whereClause: `
      translation_id = ?
        AND book_id = ?
        AND (
          (chapter = ? AND verse >= ?)
          OR (chapter > ? AND chapter < ?)
          OR ${endChapterClause}
        )
    `,
    params: [
      translationId,
      book.id,
      startChapter,
      startVerse ?? 1,
      startChapter,
      endChapter,
      endChapter,
      ...(endVerse === null ? [] : [endVerse]),
    ],
    orderBy: "chapter, verse",
  };
}

/**
 * Fetch verses for a parsed reference
 */
export async function getVerses(
  db: D1Database,
  ref: ParsedReference,
  translationId: string
): Promise<DbResult<VerseRow[]>> {
  const { whereClause, params, orderBy } = buildVerseQueryParts(ref, translationId);
  const query = `
    SELECT * FROM verses
    WHERE ${whereClause.trim()}
    ORDER BY ${orderBy}
  `;

  try {
    const result = await db.prepare(query).bind(...params).all<VerseRow>();
    return { success: true, data: result.results ?? [] };
  } catch (err) {
    console.error("Database error in getVerses:", err);
    return { success: false, error: "Database query failed" };
  }
}

type VerseRowWithRefIndex = VerseRow & { ref_index: number };

/**
 * Fetch verses for multiple parsed references in a single UNION ALL query.
 * Results are ordered by reference index, then chapter/verse within each reference.
 */
export async function getVersesForMultipleReferences(
  db: D1Database,
  refs: ParsedReference[],
  translationId: string
): Promise<DbResult<VerseRow[]>> {
  if (refs.length === 0) {
    return { success: true, data: [] };
  }

  if (refs.length === 1) {
    return getVerses(db, refs[0]!, translationId);
  }

  const subqueries: string[] = [];
  const params: (string | number)[] = [];

  for (const [refIndex, ref] of refs.entries()) {
    const { whereClause, params: refParams } = buildVerseQueryParts(ref, translationId);
    subqueries.push(`
      SELECT id, translation_id, book_id, chapter, verse, text, segments, ? AS ref_index
      FROM verses
      WHERE ${whereClause.trim()}
    `);
    // ref_index placeholder appears before WHERE placeholders in the SQL text
    params.push(refIndex, ...refParams);
  }

  const query = `
    SELECT * FROM (
      ${subqueries.join(" UNION ALL ")}
    )
    ORDER BY ref_index, chapter, verse
  `;

  try {
    const result = await db.prepare(query).bind(...params).all<VerseRowWithRefIndex>();
    const data: VerseRow[] = (result.results ?? []).map(({ ref_index: _refIndex, ...verse }) => verse);
    return { success: true, data };
  } catch (err) {
    console.error("Database error in getVersesForMultipleReferences:", err);
    return { success: false, error: "Database query failed" };
  }
}

/**
 * Search verses using FTS5
 * Runs the page and count queries independently so the total remains available
 * when pagination produces an empty page.
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
  const normalizedQuery = normalizeSearchQuery(query);
  const ftsQuery = normalizedQuery
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(" ");

  if (ftsQuery.length === 0) {
    return { success: true, data: { results: [], total: 0 } };
  }

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

  const countQuery = `
    SELECT COUNT(*) as total_count
    FROM verses v
    INNER JOIN verses_fts ON v.id = verses_fts.rowid
    INNER JOIN books b ON v.book_id = b.id
    ${whereClause}
    AND verses_fts MATCH ?
  `;

  const searchQuery = `
    SELECT v.id, v.translation_id, v.book_id, v.chapter, v.verse, v.text
    FROM verses v
    INNER JOIN verses_fts ON v.id = verses_fts.rowid
    INNER JOIN books b ON v.book_id = b.id
    ${whereClause}
    AND verses_fts MATCH ?
    ORDER BY b.book_order, v.chapter, v.verse
    LIMIT ? OFFSET ?
  `;

  try {
    const [countResult, result] = await Promise.all([
      db.prepare(countQuery).bind(...params, ftsQuery).first<{ total_count: number }>(),
      db.prepare(searchQuery).bind(...params, ftsQuery, limit, offset).all<VerseRow>(),
    ]);

    const total = Number(countResult?.total_count ?? 0);
    const results = result.results ?? [];

    return {
      success: true,
      data: { results, total },
    };
  } catch (err) {
    console.error("Database error in searchVerses:", err);
    return { success: false, error: "Search query failed" };
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
 * Build shared FROM/WHERE clause for random verse queries.
 * JOIN books only when filtering by testament; book_id filters use verses alone.
 * Testament queries rely on idx_verses_translation + idx_books_testament (adequate at current scale).
 * Assumes referential integrity (verses.book_id always references books.id); unfiltered and
 * book-only queries skip the JOIN intentionally for performance — orphan verses are not excluded.
 */
function buildRandomVerseFilter(
  translationId: string,
  options?: {
    bookId?: string;
    testament?: "OT" | "NT" | "AP";
  }
): { fromWhere: string; params: string[] } {
  const needsBookJoin = options?.testament != null;

  let fromWhere = needsBookJoin
    ? `
    FROM verses v
    INNER JOIN books b ON v.book_id = b.id
    WHERE v.translation_id = ?
  `
    : `
    FROM verses v
    WHERE v.translation_id = ?
  `;
  const params: string[] = [translationId];

  if (options?.bookId) {
    fromWhere += " AND v.book_id = ?";
    params.push(options.bookId);
  }

  if (options?.testament) {
    fromWhere += " AND b.testament = ?";
    params.push(options.testament);
  }

  return { fromWhere, params };
}

/**
 * Get a random verse with optional filters.
 * Uses COUNT + random OFFSET instead of ORDER BY RANDOM() to avoid full table scans.
 *
 * Tradeoffs:
 * - OFFSET cost is O(offset) per request; ID-range sampling was rejected because sparse IDs
 *   and partial filters would bias selection away from uniform distribution.
 * - COUNT and SELECT are not atomic; concurrent writes between queries could yield null despite
 *   count > 0. Accepted for this read-only dataset (route returns 404 in that rare case).
 */
export async function getRandomVerse(
  db: D1Database,
  translationId: string,
  options?: {
    bookId?: string;
    testament?: "OT" | "NT" | "AP";
  }
): Promise<DbResult<VerseRow | null>> {
  const { fromWhere, params } = buildRandomVerseFilter(translationId, options);

  try {
    const countRow = await db
      .prepare(`SELECT COUNT(*) as count ${fromWhere}`)
      .bind(...params)
      .first<{ count: number }>();

    const count = Number(countRow?.count ?? 0);
    if (!Number.isFinite(count) || count <= 0) {
      return { success: true, data: null };
    }

    const offset = Math.floor(Math.random() * count);

    // ORDER BY v.id ensures deterministic row order for uniform OFFSET-based selection.
    const result = await db
      .prepare(`SELECT v.* ${fromWhere} ORDER BY v.id LIMIT 1 OFFSET ?`)
      .bind(...params, offset)
      .first<VerseRow>();

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
