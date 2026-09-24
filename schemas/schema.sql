-- Bible API Database Schema
-- Uses SQLite with FTS5 for full-text search

-- Translations table
CREATE TABLE IF NOT EXISTS translations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    license TEXT,
    description TEXT
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

-- FTS5 virtual table for full-text search
-- Indexes text_plain (unpointed Hebrew for WLC; same as text for English)
CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
    text_plain,
    content='verses',
    content_rowid='id'
);

-- Triggers to keep FTS index in sync with verses table

-- After INSERT: add new verse to FTS index
CREATE TRIGGER IF NOT EXISTS verses_ai AFTER INSERT ON verses BEGIN
    INSERT INTO verses_fts(rowid, text_plain) VALUES (new.id, new.text_plain);
END;

-- After DELETE: remove verse from FTS index
CREATE TRIGGER IF NOT EXISTS verses_ad AFTER DELETE ON verses BEGIN
    INSERT INTO verses_fts(verses_fts, rowid, text_plain) VALUES ('delete', old.id, old.text_plain);
END;

-- After UPDATE of the indexed column: update verse in FTS index.
-- Scoped to text_plain so writing other columns (segments, words) doesn't re-index the verse.
CREATE TRIGGER IF NOT EXISTS verses_au AFTER UPDATE OF text_plain ON verses BEGIN
    INSERT INTO verses_fts(verses_fts, rowid, text_plain) VALUES ('delete', old.id, old.text_plain);
    INSERT INTO verses_fts(rowid, text_plain) VALUES (new.id, new.text_plain);
END;
