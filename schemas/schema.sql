-- Bible API Database Schema
-- Uses SQLite with FTS5 for full-text search

-- Translations table
CREATE TABLE IF NOT EXISTS translations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    license TEXT,
    description TEXT,
    -- The source zip the stored verses match exactly (see data/sources.lock.json).
    -- NULL: seeded before revisions were recorded, or not yet moved to the locked revision.
    source_revision TEXT,  -- eBible revision date, YYYY-MM-DD
    source_sha256 TEXT,    -- SHA-256 of the zip
    imported_at TEXT,      -- when the verses were seeded or adopted (ISO 8601)
    -- Leading part of every verses_search key (src/lib/search-index.ts SEARCH_IDS). Never renumber.
    search_id INTEGER
);

-- Books table with metadata
CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    testament TEXT NOT NULL CHECK (testament IN ('OT', 'NT', 'AP')),
    book_order INTEGER NOT NULL,
    chapters INTEGER NOT NULL,
    aliases TEXT -- JSON array of aliases like ["Gen", "Ge", "Gn"]
);

-- Verses table - main data store
CREATE TABLE IF NOT EXISTS verses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translation_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    text TEXT NOT NULL,
    text_plain TEXT NOT NULL DEFAULT '',
    segments TEXT,
    words TEXT, -- JSON array of per-word tags (lemma, Strong's, morphology, gloss); NULL when untagged
    FOREIGN KEY (translation_id) REFERENCES translations(id),
    FOREIGN KEY (book_id) REFERENCES books(id),
    UNIQUE (translation_id, book_id, chapter, verse)
);

-- Lexicon entries referenced by verses.words (id like "G1841" or "H7225")
CREATE TABLE IF NOT EXISTS lexicon (
    id TEXT PRIMARY KEY,
    language TEXT NOT NULL,
    entry TEXT NOT NULL -- JSON: strong, lemma, language, transliteration, pronunciation, partOfSpeech, gloss, definition, occurrences
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_verses_lookup ON verses(translation_id, book_id, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_verses_translation ON verses(translation_id);
CREATE INDEX IF NOT EXISTS idx_verses_book ON verses(book_id);
CREATE INDEX IF NOT EXISTS idx_books_order ON books(book_order);
CREATE INDEX IF NOT EXISTS idx_books_testament ON books(testament);

-- Search index (src/lib/search-index.ts; keep SEARCH_INDEX_DDL in sync with this section).
-- Contentless FTS5 table whose rowid is each verse's canonical position,
--   search_id * 10^8 + book_order * 10^6 + chapter * 10^3 + verse,
-- so a translation, book or testament is a rowid range and matches come back in order.
CREATE UNIQUE INDEX IF NOT EXISTS idx_translations_search_id ON translations(search_id);
CREATE INDEX IF NOT EXISTS idx_books_testament_order ON books(testament, book_order);

CREATE VIRTUAL TABLE IF NOT EXISTS verses_search USING fts5(
    text_plain,
    content='',
    contentless_delete=1
);

-- Reject a verse the key can't encode instead of indexing it under a wrong or NULL rowid.
CREATE TRIGGER IF NOT EXISTS verses_search_guard_insert BEFORE INSERT ON verses
    WHEN (SELECT search_id FROM translations WHERE id = new.translation_id) IS NULL
      OR (SELECT book_order FROM books WHERE id = new.book_id) NOT BETWEEN 1 AND 99
      OR new.chapter NOT BETWEEN 0 AND 999
      OR new.verse NOT BETWEEN 0 AND 999
BEGIN
    SELECT RAISE(ABORT, 'verses_search: the translation needs a search_id, the book an order of 1-99, and chapter and verse must be 0-999');
END;

CREATE TRIGGER IF NOT EXISTS verses_search_guard_update
    BEFORE UPDATE OF translation_id, book_id, chapter, verse ON verses
    WHEN (SELECT search_id FROM translations WHERE id = new.translation_id) IS NULL
      OR (SELECT book_order FROM books WHERE id = new.book_id) NOT BETWEEN 1 AND 99
      OR new.chapter NOT BETWEEN 0 AND 999
      OR new.verse NOT BETWEEN 0 AND 999
BEGIN
    SELECT RAISE(ABORT, 'verses_search: the translation needs a search_id, the book an order of 1-99, and chapter and verse must be 0-999');
END;

-- Every indexed key depends on these; changing one means rebuilding the index.
CREATE TRIGGER IF NOT EXISTS verses_search_book_order BEFORE UPDATE OF book_order ON books
    WHEN new.book_order IS NOT old.book_order
BEGIN
    SELECT RAISE(ABORT, 'verses_search is keyed by book_order: rebuild it to change a book''s order');
END;

CREATE TRIGGER IF NOT EXISTS verses_search_search_id BEFORE UPDATE OF search_id ON translations
    WHEN old.search_id IS NOT NULL AND new.search_id IS NOT old.search_id
BEGIN
    SELECT RAISE(ABORT, 'verses_search is keyed by search_id: never renumber a translation');
END;

CREATE TRIGGER IF NOT EXISTS verses_search_ai AFTER INSERT ON verses BEGIN
    INSERT INTO verses_search(rowid, text_plain) VALUES (
        (SELECT search_id FROM translations WHERE id = new.translation_id) * 100000000
      + (SELECT book_order FROM books WHERE id = new.book_id) * 1000000
      + new.chapter * 1000 + new.verse,
        new.text_plain);
END;

CREATE TRIGGER IF NOT EXISTS verses_search_ad AFTER DELETE ON verses BEGIN
    DELETE FROM verses_search WHERE rowid =
        (SELECT search_id FROM translations WHERE id = old.translation_id) * 100000000
      + (SELECT book_order FROM books WHERE id = old.book_id) * 1000000
      + old.chapter * 1000 + old.verse;
END;

-- Scoped like verses_au: writing segments or words doesn't re-index the verse.
CREATE TRIGGER IF NOT EXISTS verses_search_au
    AFTER UPDATE OF translation_id, book_id, chapter, verse, text_plain ON verses
BEGIN
    DELETE FROM verses_search WHERE rowid =
        (SELECT search_id FROM translations WHERE id = old.translation_id) * 100000000
      + (SELECT book_order FROM books WHERE id = old.book_id) * 1000000
      + old.chapter * 1000 + old.verse;
    INSERT INTO verses_search(rowid, text_plain) VALUES (
        (SELECT search_id FROM translations WHERE id = new.translation_id) * 100000000
      + (SELECT book_order FROM books WHERE id = new.book_id) * 1000000
      + new.chapter * 1000 + new.verse,
        new.text_plain);
END;
