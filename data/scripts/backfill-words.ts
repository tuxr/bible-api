/**
 * Bring an existing D1 database up to date with the current parse + tag output:
 *   1. verse text with USFX section headings removed (plus text_plain and segments),
 *   2. per-word tags in verses.words,
 *   3. lexicon rows.
 *
 * Run `npm run db:migrate:words` first. Idempotent: a second run reports zero writes.
 *   npm run db:backfill:words              # local
 *   npm run db:backfill:words -- --remote  # production
 */

import { readFile, readdir, writeFile, access } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { toSearchPlainText } from "../../src/lib/hebrew.js";
import { repairEscapedMarkup } from "../../src/lib/usfx-parse.js";

type ParsedVerse = { book: string; chapter: number; verse: number; text: string; segments?: unknown[]; words?: unknown[] };
type StoredVerse = { book_id: string; chapter: number; verse: number; text: string; segments: string | null; words: string | null };
const parsedDir = join(process.cwd(), "data", "parsed");
const target = process.argv.includes("--remote") ? "--remote" : "--local";
const ids = ["web", "kjv", "wlc", "tcgnt"];

function escapeSql(value: string): string { return value.replace(/'/g, "''"); }
function sqlText(value: string | null): string { return value === null ? "NULL" : `'${escapeSql(value)}'`; }
function key(book: string, chapter: number, verse: number): string { return `${book}:${chapter}:${verse}`; }
function runWrangler(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["wrangler", ...args], { shell: false });
    let stdout = ""; let stderr = "";
    // Decode as a stream: a Hebrew/Greek character can straddle two chunks.
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    proc.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `Wrangler exited with code ${code}`)));
    proc.on("error", reject);
  });
}
async function query<T>(sql: string): Promise<T[]> {
  const output = await runWrangler(["d1", "execute", "bible-db", target, "--json", `--command=${sql}`]);
  return (JSON.parse(output.trim()) as Array<{ results?: T[] }>)[0]?.results ?? [];
}
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

/** Statements go through --file: a words UPDATE can be several KB, too long for one argv entry. */
async function execute(label: string, statements: string[]) {
  const BATCH_SIZE = 200;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const file = join(parsedDir, `_backfill_${label}_${i / BATCH_SIZE}.sql`);
    await writeFile(file, statements.slice(i, i + BATCH_SIZE).join("\n"));
    await runWrangler(["d1", "execute", "bible-db", target, `--file=${file}`]);
  }
}

/**
 * The only text changes this backfill makes are the parser fixes: deleting leaked headings
 * and deleting escaped markup inside WLC words. Anything else means the stored and parsed
 * texts disagree for some other reason, and nothing is written.
 */
function isParserFix(stored: string, parsed: string): boolean {
  return onlyRemovesWords(repairEscapedMarkup(stored), parsed);
}

function onlyRemovesWords(stored: string, parsed: string): boolean {
  const storedWords = stored.split(/\s+/);
  let i = 0;
  for (const word of parsed.split(/\s+/)) {
    while (i < storedWords.length && storedWords[i] !== word) i++;
    if (i === storedWords.length) return false;
    i++;
  }
  return true;
}

async function backfillVerses(id: string): Promise<number> {
  const file = join(parsedDir, `${id}.json`);
  if (!(await exists(file))) { console.log(`Skipping ${id}: parsed JSON not found`); return 0; }
  const parsed = JSON.parse(await readFile(file, "utf8")) as { verses: ParsedVerse[] };

  // Query by book so Wrangler never serializes a whole translation's words in one response.
  const stored = new Map<string, StoredVerse>();
  for (const bookId of new Set(parsed.verses.map((verse) => verse.book))) {
    const rows = await query<StoredVerse>(`SELECT book_id, chapter, verse, text, segments, words FROM verses WHERE translation_id = '${id}' AND book_id = '${bookId}'`);
    for (const row of rows) stored.set(key(row.book_id, row.chapter, row.verse), row);
  }
  if (stored.size !== parsed.verses.length) {
    throw new Error(`${id}: verse count parsed=${parsed.verses.length} stored=${stored.size}`);
  }

  const unexpected: string[] = [];
  const statements: string[] = [];
  let textUpdates = 0;
  let wordUpdates = 0;
  for (const verse of parsed.verses) {
    const ref = `${verse.book} ${verse.chapter}:${verse.verse}`;
    const row = stored.get(key(verse.book, verse.chapter, verse.verse));
    if (!row) { unexpected.push(`${ref} missing`); continue; }
    const where = `WHERE translation_id = '${id}' AND book_id = '${verse.book}' AND chapter = ${verse.chapter} AND verse = ${verse.verse}`;

    if (row.text !== verse.text) {
      if (!isParserFix(row.text, verse.text)) { unexpected.push(ref); continue; }
      const segments = verse.segments?.length ? JSON.stringify(verse.segments) : null;
      statements.push(`UPDATE verses SET text = ${sqlText(verse.text)}, text_plain = ${sqlText(toSearchPlainText(id, verse.text))}, segments = ${sqlText(segments)} ${where};`);
      textUpdates++;
    }
    const words = verse.words?.length ? JSON.stringify(verse.words) : null;
    if (row.words !== words) {
      statements.push(`UPDATE verses SET words = ${sqlText(words)} ${where};`);
      wordUpdates++;
    }
  }
  if (unexpected.length) {
    throw new Error(`${id}: parsed text differs from stored text by more than the parser fixes: ${unexpected.slice(0, 20).join(", ")}`);
  }
  await execute(id, statements);
  console.log(`${id}: ${textUpdates} verse texts updated, ${wordUpdates} word rows updated`);
  return statements.length;
}

async function backfillLexicons(): Promise<number> {
  const lexiconDir = join(parsedDir, "lexicon");
  if (!(await exists(lexiconDir))) { console.log("Skipping lexicon: run 'npm run data:tag' first"); return 0; }
  let writes = 0;
  for (const file of (await readdir(lexiconDir)).filter((f) => f.endsWith(".json"))) {
    const { language, entries } = JSON.parse(await readFile(join(lexiconDir, file), "utf8")) as { language: string; entries: Array<{ strong: string }> };
    const existing = new Map(
      (await query<{ id: string; entry: string }>(`SELECT id, entry FROM lexicon WHERE language = '${escapeSql(language)}'`)).map((row) => [row.id, row.entry])
    );
    const statements = entries
      .filter((entry) => existing.get(entry.strong) !== JSON.stringify(entry))
      .map((entry) => `INSERT OR REPLACE INTO lexicon (id, language, entry) VALUES ('${entry.strong}', '${escapeSql(language)}', ${sqlText(JSON.stringify(entry))});`);
    await execute(`lexicon_${language}`, statements);
    console.log(`lexicon ${language}: ${statements.length} entries written`);
    writes += statements.length;
  }
  return writes;
}

async function main() {
  let writes = 0;
  for (const id of ids) writes += await backfillVerses(id);
  writes += await backfillLexicons();
  console.log(`Total writes: ${writes}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
