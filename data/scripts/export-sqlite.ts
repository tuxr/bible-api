/**
 * Build the read-only scripture databases for the iOS app, from data/parsed/*.json. D1 is
 * never touched.
 *
 * - dist/bible.sqlite, bundled in the app: what db:seed writes to D1, with the same schema
 *   (schemas/schema.sql) and search index, so the app's search behaves like /v1/search. The
 *   word tags are left out (`verses.words` is NULL and `lexicon` is empty): they are about
 *   three quarters of the data, and word study ships later.
 * - dist/bible-words.sqlite, for on-demand download when the app adds word study:
 *   `verse_words` (the `words` JSON per verse) and `lexicon`.
 *
 * Each has a `meta` table: the schema version, the build time and each translation's source
 * revision from data/sources.lock.json.
 *
 * Run after data:download, data:parse and data:tag:
 *   npm run data:export-sqlite
 *
 * Publish both as assets of the `bible-db` release, named as the script prints, with their
 * SHA-256; see "Bundled database for the iOS app" in AGENTS.md.
 */

import { createHash } from "crypto";
import { readFile, readdir, mkdir, rm, rename, stat } from "fs/promises";
import { dirname, join } from "path";
import { DatabaseSync } from "node:sqlite";
import { ALL_BOOKS } from "../../src/lib/books-data.js";
import { SEARCH_IDS } from "../../src/lib/search-index.js";
import { toSearchPlainText } from "../../src/lib/hebrew.js";
import { readLock, type ParsedSource } from "./sources-lock.js";
import { TRANSLATION_META } from "./translation-meta.js";

/**
 * Bump when the app would need a code change to read the file: a table or column added,
 * removed or reinterpreted. The app pins a file by version in bible-ios/Data/bible-db.lock.json.
 */
export const SCHEMA_VERSION = 1;

const PARSED_DIR = join(process.cwd(), "data", "parsed");
const SCHEMA_PATH = join(process.cwd(), "schemas", "schema.sql");
const OUT_DIR = join(process.cwd(), "dist");

interface ParsedVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  segments?: Array<{ text: string; speaker: "jesus" | "narrator" }>;
  words?: unknown[];
}

interface ParsedTranslation {
  id: string;
  name: string;
  language: string;
  source?: ParsedSource;
  verses: ParsedVerse[];
}

const META_DDL = `CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
)`;

/** bible-words.sqlite: the word tags left out of bible.sqlite, keyed like `verses`. */
const WORDS_DDL = `
CREATE TABLE verse_words (
    translation_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    words TEXT NOT NULL, -- verses.words: JSON array of per-word tags
    UNIQUE (translation_id, book_id, chapter, verse)
);
CREATE TABLE lexicon (
    id TEXT PRIMARY KEY,
    language TEXT NOT NULL,
    entry TEXT NOT NULL
);`;

async function readParsedTranslations(): Promise<ParsedTranslation[]> {
  let files: string[];
  try {
    files = (await readdir(PARSED_DIR)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    throw new Error("No parsed files found. Run 'npm run data:parse' and 'npm run data:tag' first.");
  }
  if (files.length === 0) throw new Error("No JSON files found in data/parsed/");
  const translations: ParsedTranslation[] = [];
  for (const file of files) {
    translations.push(JSON.parse(await readFile(join(PARSED_DIR, file), "utf-8")) as ParsedTranslation);
  }
  return translations;
}

async function readLexicons(): Promise<Array<{ language: string; entries: Array<{ strong: string }> }>> {
  const lexiconDir = join(PARSED_DIR, "lexicon");
  const files = (await readdir(lexiconDir)).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new Error("No lexicons in data/parsed/lexicon. Run 'npm run data:tag' first.");
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(join(lexiconDir, f), "utf-8"))));
}

function count(db: DatabaseSync, sql: string, ...params: Array<string | number>): number {
  return Number((db.prepare(sql).get(...params) as { n: number | bigint }).n);
}

/** Opens a new database at `<out>.building`; `finish` renames it, so a failed run leaves no partial file. */
async function create(out: string): Promise<DatabaseSync> {
  await mkdir(dirname(out), { recursive: true });
  await rm(`${out}.building`, { force: true });
  const db = new DatabaseSync(`${out}.building`);
  db.exec("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;");
  return db;
}

/** Checks integrity, compacts, moves the file into place, and prints its size and SHA-256. */
async function finish(db: DatabaseSync, out: string, assetName: string): Promise<void> {
  const integrity = (db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
  if (integrity !== "ok") {
    db.close();
    throw new Error(`${out}: integrity_check: ${integrity}; ${out}.building left for inspection`);
  }
  // A rollback journal: the app opens the file read-only inside its bundle, where it couldn't
  // create a WAL file.
  db.exec("VACUUM");
  db.exec("PRAGMA journal_mode = DELETE");
  db.close();
  await rename(`${out}.building`, out);

  const bytes = (await stat(out)).size;
  const sha = createHash("sha256").update(await readFile(out)).digest("hex");
  console.log(`\n✓ Wrote ${out}`);
  console.log(`  Size:    ${(bytes / 1024 / 1024).toFixed(1)} MB (${bytes} bytes)`);
  console.log(`  SHA-256: ${sha}`);
  console.log(`  Release asset name: ${assetName}`);
}

async function main() {
  console.log("SQLite Exporter");
  console.log("===============\n");

  const lock = await readLock();
  const translations = await readParsedTranslations();
  const lexicons = await readLexicons();

  // Every translation must be parsed from its locked zip, so meta's revisions describe the text.
  for (const t of translations) {
    const locked = lock.texts[t.id];
    if (!locked) throw new Error(`${t.id}: not in data/sources.lock.json`);
    if (t.source?.sha256 !== locked.sha256) {
      throw new Error(`${t.id}: data/parsed/${t.id}.json is not parsed from the revision in data/sources.lock.json; run 'npm run data:download' and 'npm run data:parse'`);
    }
    if (SEARCH_IDS[t.id] === undefined) {
      throw new Error(`Translation ${t.id} has no search id: add it to SEARCH_IDS in src/lib/search-index.ts`);
    }
    if (!TRANSLATION_META[t.id]) throw new Error(`Translation ${t.id} has no entry in data/scripts/translation-meta.ts`);
  }

  const db = await create(join(OUT_DIR, "bible.sqlite"));
  const wordsDb = await create(join(OUT_DIR, "bible-words.sqlite"));

  // The same tables, indexes and search triggers as D1. The triggers fill verses_search with
  // the same rowid keys as production.
  db.exec(await readFile(SCHEMA_PATH, "utf-8"));
  db.exec(META_DDL);
  wordsDb.exec(WORDS_DDL);
  wordsDb.exec(META_DDL);

  const builtAt = new Date().toISOString();
  db.exec("BEGIN");
  wordsDb.exec("BEGIN");

  const insertBook = db.prepare(
    "INSERT INTO books (id, name, testament, book_order, chapters, aliases) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const book of ALL_BOOKS) {
    insertBook.run(book.id, book.name, book.testament, book.order, book.chapters, JSON.stringify(book.aliases));
  }
  console.log(`Inserted ${ALL_BOOKS.length} books`);

  const insertTranslation = db.prepare(
    `INSERT INTO translations (id, name, language, license, description, source_revision, source_sha256, imported_at, search_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // Matches db:seed, which keeps the first of any duplicate verse.
  const insertVerse = db.prepare(
    `INSERT OR IGNORE INTO verses (translation_id, book_id, chapter, verse, text, text_plain, segments, words)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertWords = wordsDb.prepare(
    "INSERT OR IGNORE INTO verse_words (translation_id, book_id, chapter, verse, words) VALUES (?, ?, ?, ?, ?)",
  );
  const insertMeta = [db, wordsDb].map((d) => d.prepare("INSERT INTO meta (key, value) VALUES (?, ?)"));
  const meta = (key: string, value: string) => insertMeta.forEach((stmt) => stmt.run(key, value));
  meta("schema_version", String(SCHEMA_VERSION));
  meta("built_at", builtAt);

  const expected = new Map<string, { verses: number; tagged: number }>();
  for (const t of translations) {
    const info = TRANSLATION_META[t.id]!;
    const locked = lock.texts[t.id]!;
    insertTranslation.run(t.id, info.name, info.language, info.license, info.description, locked.revision, locked.sha256, builtAt, SEARCH_IDS[t.id]!);
    meta(`source_revision:${t.id}`, locked.revision);
    meta(`source_sha256:${t.id}`, locked.sha256);

    let inserted = 0;
    let tagged = 0;
    for (const v of t.verses) {
      const segments = v.segments ? JSON.stringify(v.segments) : null;
      const result = insertVerse.run(t.id, v.book, v.chapter, v.verse, v.text, toSearchPlainText(t.id, v.text), segments, null);
      if (!result.changes) continue;
      inserted++;
      if (v.words?.length) {
        insertWords.run(t.id, v.book, v.chapter, v.verse, JSON.stringify(v.words));
        tagged++;
      }
    }
    expected.set(t.id, { verses: inserted, tagged });
    const skipped = t.verses.length - inserted;
    console.log(`Inserted ${inserted} ${t.id} verses${tagged ? `, ${tagged} with word tags` : ""}${skipped ? ` (${skipped} duplicates skipped, as db:seed does)` : ""}`);
  }

  const insertLexicon = wordsDb.prepare("INSERT OR REPLACE INTO lexicon (id, language, entry) VALUES (?, ?, ?)");
  for (const { language, entries } of lexicons) {
    for (const entry of entries) insertLexicon.run(entry.strong, language, JSON.stringify(entry));
    console.log(`Inserted ${entries.length} ${language} lexicon entries`);
  }

  db.exec("COMMIT");
  wordsDb.exec("COMMIT");

  // Checks: every verse is stored and indexed once, and the file is sound.
  console.log("\nChecking...");
  let errors = 0;
  for (const [id, n] of expected) {
    const stored = count(db, "SELECT COUNT(*) AS n FROM verses WHERE translation_id = ?", id);
    const base = SEARCH_IDS[id]! * 100_000_000;
    const indexed = count(db, "SELECT COUNT(*) AS n FROM verses_search WHERE rowid BETWEEN ? AND ?", base, base + 99_999_999);
    const tagged = count(wordsDb, "SELECT COUNT(*) AS n FROM verse_words WHERE translation_id = ?", id);
    const ok = stored === n.verses && indexed === n.verses && tagged === n.tagged;
    if (!ok) errors++;
    console.log(`  ${ok ? "✓" : "✗"} ${id}: ${stored} verses, ${indexed} indexed, ${tagged} tagged (expected ${n.verses}, ${n.tagged})`);
  }
  try {
    db.exec("INSERT INTO verses_search(verses_search, rank) VALUES('integrity-check', 0)");
    console.log("  ✓ verses_search integrity-check");
  } catch (err) {
    console.error(`  ✗ verses_search integrity-check: ${(err as Error).message}`);
    errors++;
  }
  if (errors > 0) {
    db.close();
    wordsDb.close();
    throw new Error(`${errors} check(s) failed; the .building files in ${OUT_DIR} are left for inspection`);
  }

  db.exec("INSERT INTO verses_search(verses_search) VALUES('optimize')");
  const date = builtAt.slice(0, 10);
  await finish(db, join(OUT_DIR, "bible.sqlite"), `bible-${SCHEMA_VERSION}-${date}.sqlite`);
  await finish(wordsDb, join(OUT_DIR, "bible-words.sqlite"), `bible-words-${SCHEMA_VERSION}-${date}.sqlite`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
