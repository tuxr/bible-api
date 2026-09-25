/**
 * The search index, `verses_search`: an FTS5 table whose rowid is each verse's position,
 *
 *   search_id · 10^8 + book_order · 10^6 + chapter · 10^3 + verse
 *
 * so FTS5 returns matches in canonical order, and a translation, book or testament is a rowid
 * range. D1 bills a row per FTS match read: a count reads only the matches in scope, and a page
 * stops after offset + limit instead of sorting every match.
 *
 * The table is contentless (it stores no text) and kept in sync by the triggers below. Keep
 * SEARCH_INDEX_DDL in sync with schemas/schema.sql.
 */

/** Each translation's leading key digit(s). Never renumber: the index is keyed by it. */
export const SEARCH_IDS: Readonly<Record<string, number>> = { web: 1, kjv: 2, wlc: 3, tcgnt: 4 };

export const KEY_TRANSLATION = 100_000_000;
export const KEY_BOOK = 1_000_000;
export const KEY_CHAPTER = 1_000;

/** The search key of a verses row, from its translation's search_id and its book's order. */
function keyOf(row: "new" | "old"): string {
  return `(SELECT search_id FROM translations WHERE id = ${row}.translation_id) * ${KEY_TRANSLATION}
      + (SELECT book_order FROM books WHERE id = ${row}.book_id) * ${KEY_BOOK}
      + ${row}.chapter * ${KEY_CHAPTER} + ${row}.verse`;
}

/** Rejects a verse the key can't encode instead of indexing it under a wrong or NULL rowid. */
const UNKEYABLE = `(SELECT search_id FROM translations WHERE id = new.translation_id) IS NULL
      OR (SELECT book_order FROM books WHERE id = new.book_id) NOT BETWEEN 1 AND 99
      OR new.chapter NOT BETWEEN 0 AND 999
      OR new.verse NOT BETWEEN 0 AND 999`;
const UNKEYABLE_MESSAGE =
  "verses_search: the translation needs a search_id, the book an order of 1-99, and chapter and verse must be 0-999";

export const SEARCH_INDEX_DDL: readonly string[] = [
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_translations_search_id ON translations(search_id)`,
  `CREATE INDEX IF NOT EXISTS idx_books_testament_order ON books(testament, book_order)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS verses_search USING fts5(
    text_plain,
    content='',
    contentless_delete=1
  )`,
  `CREATE TRIGGER IF NOT EXISTS verses_search_guard_insert BEFORE INSERT ON verses
    WHEN ${UNKEYABLE}
  BEGIN
    SELECT RAISE(ABORT, '${UNKEYABLE_MESSAGE}');
  END`,
  `CREATE TRIGGER IF NOT EXISTS verses_search_guard_update
    BEFORE UPDATE OF translation_id, book_id, chapter, verse ON verses
    WHEN ${UNKEYABLE}
  BEGIN
    SELECT RAISE(ABORT, '${UNKEYABLE_MESSAGE}');
  END`,
  // Every indexed key depends on these; changing one means rebuilding the index.
  `CREATE TRIGGER IF NOT EXISTS verses_search_book_order BEFORE UPDATE OF book_order ON books
    WHEN new.book_order IS NOT old.book_order
  BEGIN
    SELECT RAISE(ABORT, 'verses_search is keyed by book_order: rebuild it to change a book''s order');
  END`,
  `CREATE TRIGGER IF NOT EXISTS verses_search_search_id BEFORE UPDATE OF search_id ON translations
    WHEN old.search_id IS NOT NULL AND new.search_id IS NOT old.search_id
  BEGIN
    SELECT RAISE(ABORT, 'verses_search is keyed by search_id: never renumber a translation');
  END`,
  `CREATE TRIGGER IF NOT EXISTS verses_search_ai AFTER INSERT ON verses BEGIN
    INSERT INTO verses_search(rowid, text_plain) VALUES (${keyOf("new")}, new.text_plain);
  END`,
  `CREATE TRIGGER IF NOT EXISTS verses_search_ad AFTER DELETE ON verses BEGIN
    DELETE FROM verses_search WHERE rowid = ${keyOf("old")};
  END`,
  // Scoped to the key and text_plain: writing segments or words doesn't re-index the verse.
  `CREATE TRIGGER IF NOT EXISTS verses_search_au
    AFTER UPDATE OF translation_id, book_id, chapter, verse, text_plain ON verses
  BEGIN
    DELETE FROM verses_search WHERE rowid = ${keyOf("old")};
    INSERT INTO verses_search(rowid, text_plain) VALUES (${keyOf("new")}, new.text_plain);
  END`,
];
