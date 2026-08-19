/**
 * Test database helpers — apply schema and seed minimal data for integration tests.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { toSearchPlainText } from "../../lib/hebrew.js";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS translations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    license TEXT,
    description TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    testament TEXT NOT NULL CHECK (testament IN ('OT', 'NT', 'AP')),
    book_order INTEGER NOT NULL,
    chapters INTEGER NOT NULL,
    aliases TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS verses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translation_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    text TEXT NOT NULL,
    text_plain TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (translation_id) REFERENCES translations(id),
    FOREIGN KEY (book_id) REFERENCES books(id),
    UNIQUE (translation_id, book_id, chapter, verse)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_verses_lookup ON verses(translation_id, book_id, chapter, verse)`,
  `CREATE INDEX IF NOT EXISTS idx_verses_translation ON verses(translation_id)`,
  `CREATE INDEX IF NOT EXISTS idx_verses_book ON verses(book_id)`,
  `CREATE INDEX IF NOT EXISTS idx_books_order ON books(book_order)`,
  `CREATE INDEX IF NOT EXISTS idx_books_testament ON books(testament)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
    text_plain,
    content='verses',
    content_rowid='id'
  )`,
  `CREATE TRIGGER IF NOT EXISTS verses_ai AFTER INSERT ON verses BEGIN
    INSERT INTO verses_fts(rowid, text_plain) VALUES (new.id, new.text_plain);
  END`,
  `CREATE TRIGGER IF NOT EXISTS verses_ad AFTER DELETE ON verses BEGIN
    INSERT INTO verses_fts(verses_fts, rowid, text_plain) VALUES ('delete', old.id, old.text_plain);
  END`,
  `CREATE TRIGGER IF NOT EXISTS verses_au AFTER UPDATE ON verses BEGIN
    INSERT INTO verses_fts(verses_fts, rowid, text_plain) VALUES ('delete', old.id, old.text_plain);
    INSERT INTO verses_fts(rowid, text_plain) VALUES (new.id, new.text_plain);
  END`,
];

export async function applyTestSchema(db: D1Database): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.prepare(statement).run();
  }
}

export async function seedTestData(db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO translations (id, name, language, license, description)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      "web",
      "World English Bible",
      "en",
      "Public Domain",
      "Test translation for integration tests"
    )
    .run();

  await db
    .prepare(
      `INSERT INTO translations (id, name, language, license, description)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      "wlc",
      "Westminster Leningrad Codex",
      "he",
      "Public Domain",
      "Hebrew OT test translation"
    )
    .run();

  await db
    .prepare(
      `INSERT INTO translations (id, name, language, license, description)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      "tcgnt",
      "Text-Critical Greek New Testament",
      "grc",
      "Public Domain",
      "Greek NT test translation"
    )
    .run();

  const books = [
    ["GEN", "Genesis", "OT", 1, 50, '["Gen","Ge","Gn"]'],
    ["EXO", "Exodus", "OT", 2, 40, '["Exod","Exo","Ex"]'],
    ["JHN", "John", "NT", 43, 21, '["Jhn","Jn"]'],
  ] as const;

  for (const [id, name, testament, bookOrder, chapters, aliases] of books) {
    await db
      .prepare(
        `INSERT INTO books (id, name, testament, book_order, chapters, aliases)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, name, testament, bookOrder, chapters, aliases)
      .run();
  }

  const verses = [
    ["web", "GEN", 1, 1, "In the beginning God created the heaven and the earth."],
    ["web", "GEN", 1, 2, "The earth was formless and empty."],
    ["web", "GEN", 1, 3, "God said, \"Let there be light,\" and there was light."],
    ["web", "JHN", 3, 16, "For God so loved the world, that he gave his only born Son."],
    ["web", "EXO", 1, 1, "Now these are the names of the sons of Israel."],
    [
      "wlc",
      "GEN",
      1,
      1,
      "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃",
    ],
    ["wlc", "GEN", 1, 2, "וְהָאָ֗רֶץ הָיְתָ֥ה תֹ֙הוּ֙ וָבֹ֔הוּ"],
    [
      "tcgnt",
      "JHN",
      3,
      16,
      "Οὕτω γὰρ ἠγάπησεν ὁ Θεὸς τὸν κόσμον, ὥστε τὸν υἱὸν αὐτοῦ τὸν μονογενῆ ἔδωκεν",
    ],
  ] as const;

  for (const [translationId, bookId, chapter, verse, text] of verses) {
    const textPlain = toSearchPlainText(translationId, text);
    await db
      .prepare(
        `INSERT INTO verses (translation_id, book_id, chapter, verse, text, text_plain)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(translationId, bookId, chapter, verse, text, textPlain)
      .run();
  }
}

export async function setupTestDatabase(db: D1Database): Promise<void> {
  await applyTestSchema(db);
  await seedTestData(db);
}