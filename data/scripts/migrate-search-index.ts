/**
 * Build the keyed search index, verses_search (src/lib/search-index.ts), in an existing D1.
 *   npm run db:migrate:search-index              # local
 *   npm run db:migrate:search-index -- --remote  # production: see docs/runbooks/search-index-prod-migration.md
 *
 * Additive and idempotent: adds translations.search_id, two small indexes, the verses_search
 * table and its triggers, then indexes each translation's verses that aren't indexed yet.
 * verses_fts is left as is. Every statement goes through the query API (--command), never
 * the import path (--file), so the database stays available.
 *
 * Cost on ~105,000 verses (measured locally): the fill reads about 316,000 rows (each verse, its
 * book and translation, and an "already indexed?" probe) and writes one row per verse, about
 * 105,000. That is over the free plan's 100,000 writes a day: run it on Workers Paid, or let
 * it stop and run it again the next day (it resumes). Verifying reads about 211,000 more
 * (each translation's verses, counted in both tables); --skip-verify leaves that out.
 */

import { spawn } from "child_process";
import { ALL_BOOKS } from "../../src/lib/books-data.js";
import { KEY_BOOK, KEY_CHAPTER, KEY_TRANSLATION, SEARCH_IDS, SEARCH_INDEX_DDL } from "../../src/lib/search-index.js";

const REMOTE = process.argv.includes("--remote");
const TARGET = REMOTE ? "--remote" : "--local";
const VERIFY = !process.argv.includes("--skip-verify");

interface Meta {
  rows_read?: number;
  rows_written?: number;
}

function runWrangler(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["wrangler", ...args], { shell: false });
    let stdout = "";
    let stderr = "";
    // Decode as a stream: a Hebrew/Greek character can straddle two chunks.
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    proc.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || stdout || `Wrangler exited with code ${code}`)));
    proc.on("error", reject);
  });
}

async function query<T = Record<string, unknown>>(sql: string): Promise<{ results: T[]; meta: Meta }> {
  const out = await runWrangler(["d1", "execute", "bible-db", TARGET, "--json", `--command=${sql}`]);
  const [first] = JSON.parse(out.trim()) as Array<{ results?: T[]; meta?: Meta }>;
  return { results: first?.results ?? [], meta: first?.meta ?? {} };
}

let totalRead = 0;
function tally(meta: Meta): string {
  totalRead += meta.rows_read ?? 0;
  return meta.rows_read === undefined ? "" : ` (${meta.rows_read} rows read, ${meta.rows_written ?? 0} written)`;
}

/** The keys encode book_order and testament ranges, so the database's books must match books-data. */
async function checkBooks(): Promise<void> {
  const { results, meta } = await query<{ id: string; testament: string; book_order: number }>(
    "SELECT id, testament, book_order FROM books ORDER BY book_order"
  );
  tally(meta);
  const expected = new Map(ALL_BOOKS.map((b) => [b.id, b]));
  const problems: string[] = [];
  for (const row of results) {
    const book = expected.get(row.id);
    if (!book) problems.push(`${row.id}: not in books-data`);
    else if (book.order !== row.book_order || book.testament !== row.testament) {
      problems.push(`${row.id}: database ${row.testament} #${row.book_order}, books-data ${book.testament} #${book.order}`);
    }
    if (row.book_order < 1 || row.book_order > 99) problems.push(`${row.id}: book_order ${row.book_order} outside 1-99`);
  }
  // A testament filter is one range of book_order, so each testament's books must be contiguous.
  const testaments = results.map((r) => r.testament);
  for (const t of new Set(testaments)) {
    if (testaments.lastIndexOf(t) - testaments.indexOf(t) + 1 !== testaments.filter((x) => x === t).length) {
      problems.push(`${t} books are not contiguous in book_order`);
    }
  }
  if (problems.length) throw new Error(`books table doesn't match what verses_search expects:\n  ${problems.join("\n  ")}`);
  console.log(`books: ${results.length} rows match books-data`);
}

async function addSearchIds(): Promise<string[]> {
  const columns = await query<{ name: string }>("PRAGMA table_info(translations)");
  if (!columns.results.some((c) => c.name === "search_id")) {
    await query("ALTER TABLE translations ADD COLUMN search_id INTEGER");
    console.log("Added translations.search_id");
  }
  const { results, meta } = await query<{ id: string; search_id: number | null }>("SELECT id, search_id FROM translations ORDER BY id");
  tally(meta);
  for (const row of results) {
    const searchId = SEARCH_IDS[row.id];
    if (searchId === undefined) throw new Error(`Translation ${row.id} has no search id: add it to SEARCH_IDS in src/lib/search-index.ts`);
    if (row.search_id === null) {
      await query(`UPDATE translations SET search_id = ${searchId} WHERE id = '${row.id}' AND search_id IS NULL`);
      console.log(`${row.id}: search_id ${searchId}`);
    } else if (row.search_id !== searchId) {
      throw new Error(`${row.id} has search_id ${row.search_id}, SEARCH_IDS says ${searchId}`);
    }
  }
  return results.map((r) => r.id);
}

function range(translationId: string): [number, number] {
  const lo = SEARCH_IDS[translationId]! * KEY_TRANSLATION;
  return [lo, lo + KEY_TRANSLATION - 1];
}

/** Index the translation's verses that aren't indexed yet (all of them on a first run). */
async function fill(translationId: string): Promise<void> {
  if (!/^[a-z0-9]+$/.test(translationId)) throw new Error(`Unexpected translation id: ${translationId}`);
  const key = `tr.search_id * ${KEY_TRANSLATION} + b.book_order * ${KEY_BOOK} + v.chapter * ${KEY_CHAPTER} + v.verse`;
  const { meta } = await query(`INSERT INTO verses_search(rowid, text_plain)
    SELECT ${key}, v.text_plain
    FROM verses v
    JOIN translations tr ON tr.id = v.translation_id
    JOIN books b ON b.id = v.book_id
    WHERE v.translation_id = '${translationId}'
      AND NOT EXISTS (SELECT 1 FROM verses_search s WHERE s.rowid = ${key})`);
  // rows_written counts the verses indexed (changes also counts FTS5's own table writes).
  console.log(`${translationId}: ${meta.rows_written === undefined ? "indexed" : `indexed ${meta.rows_written} new verses`}${tally(meta)}`);
}

/** Every verse indexed once, and sample searches agree with verses_fts. */
async function verify(translationId: string): Promise<void> {
  const [lo, hi] = range(translationId);
  const counts = await query<{ verses: number; indexed: number }>(`SELECT
    (SELECT COUNT(*) FROM verses WHERE translation_id = '${translationId}') AS verses,
    (SELECT COUNT(*) FROM verses_search WHERE rowid BETWEEN ${lo} AND ${hi}) AS indexed`);
  const { verses, indexed } = counts.results[0]!;
  console.log(`${translationId}: ${verses} verses, ${indexed} indexed${tally(counts.meta)}`);
  if (verses !== indexed) throw new Error(`${translationId}: verses_search holds ${indexed} rows for ${verses} verses`);
}

const SAMPLES: Record<string, string> = { web: "love", kjv: "grace", wlc: "בראשית", tcgnt: "κοσμον" };

async function compareSample(translationId: string): Promise<void> {
  const word = SAMPLES[translationId];
  if (!word) return;
  const [lo, hi] = range(translationId);
  const match = `'"${word}"'`;
  const { results, meta } = await query<{ old: number; new: number }>(`SELECT
    (SELECT COUNT(*) FROM verses_fts JOIN verses v ON v.id = verses_fts.rowid
      WHERE v.translation_id = '${translationId}' AND verses_fts MATCH ${match}) AS old,
    (SELECT COUNT(*) FROM verses_search WHERE verses_search MATCH ${match} AND rowid BETWEEN ${lo} AND ${hi}) AS new`);
  const counts = results[0]!;
  console.log(`${translationId}: "${word}" matches ${counts.old} in verses_fts, ${counts.new} in verses_search${tally(meta)}`);
  if (counts.old !== counts.new) throw new Error(`${translationId}: the two indexes disagree on "${word}"`);
}

async function main() {
  console.log(`Building verses_search on the ${REMOTE ? "PRODUCTION" : "local"} database\n`);
  await checkBooks();
  const translations = await addSearchIds();
  for (const statement of SEARCH_INDEX_DDL) await query(statement);
  console.log("Indexes, verses_search and triggers exist");
  for (const id of translations) await fill(id);
  if (VERIFY) {
    for (const id of translations) {
      await verify(id);
      await compareSample(id);
    }
  }
  console.log(`\nDone.${totalRead ? ` ${totalRead} rows read in total.` : ""}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
