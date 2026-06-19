/**
 * Read verse text from the wrangler local D1 SQLite database for anchor tests.
 */

import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

export interface VerseRow {
  translation_id: string;
  book_id: string;
  chapter: number;
  verse: number;
  text: string;
}

function resolveLocalD1Path(): string | undefined {
  const d1Dir = join(ROOT, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  try {
    const files = readdirSync(d1Dir);
    const dbFile = files.find((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
    return dbFile ? join(d1Dir, dbFile) : undefined;
  } catch {
    return undefined;
  }
}

let db: DatabaseSync | undefined;

function getDb(): DatabaseSync | undefined {
  if (db) return db;
  const path = resolveLocalD1Path();
  if (!path) return undefined;
  db = new DatabaseSync(path, { readOnly: true });
  return db;
}

export function isLocalD1Seeded(): boolean {
  const database = getDb();
  if (!database) return false;
  const row = database
    .prepare("SELECT COUNT(*) as count FROM verses WHERE translation_id = 'wlc'")
    .get() as { count: number } | undefined;
  return (row?.count ?? 0) >= 23_000;
}

export function fetchVerse(
  translationId: string,
  bookId: string,
  chapter: number,
  verse: number
): VerseRow | undefined {
  const database = getDb();
  if (!database) return undefined;

  return database
    .prepare(
      `SELECT translation_id, book_id, chapter, verse, text
       FROM verses
       WHERE translation_id = ?
         AND book_id = ?
         AND chapter = ?
         AND verse = ?
       LIMIT 1`
    )
    .get(translationId, bookId, chapter, verse) as VerseRow | undefined;
}