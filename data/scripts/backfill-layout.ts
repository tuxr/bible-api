/**
 * Write each verse's layout (paragraphs, poetry lines, headings, titles) into verses.layout
 * from the current parse.
 *
 * A layout's text items partition its verse's text, so a layout is written only where the
 * stored text equals the parsed text exactly. A verse whose stored text differs (a pending
 * parser fix, or an older upstream revision) is left alone and reported: bring its text up to
 * date with db:backfill:words, which writes the layout with the text.
 *
 * Run `npm run db:migrate:layout` first (a --dry-run works without it, reading every stored
 * layout as empty). Idempotent: a second run reports zero writes.
 *   npm run db:backfill:layout              # local
 *   npm run db:backfill:layout -- --remote  # production (D1 query API, CLOUDFLARE_API_TOKEN)
 *   add --dry-run to report what would be written without writing
 *   add --translations=web,bsb to check only those; each reads all its stored verses once
 *
 * Writing layout does not touch the search index (its triggers watch text_plain and the key).
 */

import { readFile, writeFile, access } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { layoutText, type LayoutItem } from "../../src/lib/layout.js";
import { readLock, type ParsedSource } from "./sources-lock.js";
import { remoteExecute, remoteQuery } from "./d1-remote.js";

type ParsedVerse = { book: string; chapter: number; verse: number; text: string; layout?: LayoutItem[] };
type ParsedTranslation = { source?: ParsedSource; verses: ParsedVerse[] };
type StoredVerse = { book_id: string; chapter: number; verse: number; text: string; layout: string | null };

const parsedDir = join(process.cwd(), "data", "parsed");
const target = process.argv.includes("--remote") ? "--remote" : "--local";
const dryRun = process.argv.includes("--dry-run");
const allIds = ["web", "kjv", "wlc", "tcgnt", "bsb"];
const ids = process.argv.find((arg) => arg.startsWith("--translations="))?.slice("--translations=".length).split(",") ?? allIds;

function escapeSql(value: string): string { return value.replace(/'/g, "''"); }
function sqlText(value: string | null): string { return value === null ? "NULL" : `'${escapeSql(value)}'`; }
function key(book: string, chapter: number, verse: number): string { return `${book}:${chapter}:${verse}`; }
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

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
  if (target === "--remote") return (await remoteQuery<T>(sql))[0]?.results ?? [];
  const output = await runWrangler(["d1", "execute", "bible-db", target, "--json", `--command=${sql}`]);
  return (JSON.parse(output.trim()) as Array<{ results?: T[] }>)[0]?.results ?? [];
}

/** Write statements in batches: remote under D1's 100 KB query limit, local through --file. */
async function execute(label: string, statements: string[]) {
  if (dryRun) {
    if (statements.length) console.log(`  ${label}: would write ${statements.length} (${(statements.reduce((n, s) => n + Buffer.byteLength(s), 0) / 1e6).toFixed(1)} MB)`);
    return;
  }
  if (target === "--remote") return remoteExecute(label, statements);
  const BATCH_SIZE = 200;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const file = join(parsedDir, `_backfill_layout_${label}_${i / BATCH_SIZE}.sql`);
    await writeFile(file, statements.slice(i, i + BATCH_SIZE).join("\n"));
    await runWrangler(["d1", "execute", "bible-db", target, `--file=${file}`]);
  }
}

/** The JSON to store for a parsed verse: its layout, or NULL when it has none. */
function storedLayoutFor(verse: ParsedVerse): string | null {
  if (!verse.layout?.length) return null;
  if (layoutText(verse.layout) !== verse.text) {
    throw new Error(`${verse.book} ${verse.chapter}:${verse.verse}: parsed layout does not join to the parsed text; re-run 'npm run data:parse'`);
  }
  return JSON.stringify(verse.layout);
}

// Set in main(). A dry run before db:migrate:layout reads every stored layout as NULL, so the
// numbers can be reviewed before the column is added; a real run needs the column.
let layoutColumn = "layout";

async function backfill(id: string, lockSha: string | undefined): Promise<number> {
  const file = join(parsedDir, `${id}.json`);
  if (!(await exists(file))) { console.log(`Skipping ${id}: parsed JSON not found`); return 0; }
  const parsed = JSON.parse(await readFile(file, "utf8")) as ParsedTranslation;
  if (!parsed.source || parsed.source.sha256 !== lockSha) {
    throw new Error(`${id}: data/parsed/${id}.json is not parsed from the revision in data/sources.lock.json; run 'npm run data:download' and 'npm run data:parse'`);
  }

  // By book, so no single response carries a whole translation.
  const stored = new Map<string, StoredVerse>();
  for (const bookId of new Set(parsed.verses.map((verse) => verse.book))) {
    const rows = await query<StoredVerse>(`SELECT book_id, chapter, verse, text, ${layoutColumn} AS layout FROM verses WHERE translation_id = '${id}' AND book_id = '${bookId}'`);
    for (const row of rows) stored.set(key(row.book_id, row.chapter, row.verse), row);
  }

  const statements: string[] = [];
  const textDiffers: string[] = [];
  const missing: string[] = [];
  let withLayout = 0;
  let cleared = 0;
  for (const verse of parsed.verses) {
    const ref = `${verse.book} ${verse.chapter}:${verse.verse}`;
    const row = stored.get(key(verse.book, verse.chapter, verse.verse));
    if (!row) { missing.push(ref); continue; }
    const layout = storedLayoutFor(verse);
    if (row.layout === layout) continue;
    if (row.text !== verse.text) { textDiffers.push(ref); continue; }
    statements.push(`UPDATE verses SET layout = ${sqlText(layout)} WHERE translation_id = '${id}' AND book_id = '${verse.book}' AND chapter = ${verse.chapter} AND verse = ${verse.verse};`);
    if (layout === null) cleared++;
    else withLayout++;
  }

  await execute(id, statements);
  const verb = dryRun ? "to write" : "written";
  console.log(`${id}: ${withLayout} layouts ${verb}, ${cleared} cleared, ${stored.size} verses read`);
  if (textDiffers.length) {
    console.log(`  ${textDiffers.length} verses skipped: stored text differs from the parse (run db:backfill:words for them first; e.g. ${textDiffers.slice(0, 5).join(", ")})`);
  }
  if (missing.length) {
    console.log(`  ${missing.length} parsed verses are not stored (e.g. ${missing.slice(0, 5).join(", ")})`);
  }
  return statements.length;
}

async function main() {
  for (const id of ids) {
    if (!allIds.includes(id)) throw new Error(`Unknown translation '${id}' (expected ${allIds.join(", ")})`);
  }
  const columns = await query<{ name: string }>("PRAGMA table_info(verses)");
  if (!columns.some((column) => column.name === "layout")) {
    if (!dryRun) throw new Error("verses has no layout column; run 'npm run db:migrate:layout' first");
    console.log("verses has no layout column yet: reporting as if every stored layout were empty");
    layoutColumn = "NULL";
  }
  const lock = await readLock();
  let writes = 0;
  for (const id of ids) writes += await backfill(id, lock.texts[id]?.sha256);
  console.log(`Total writes: ${writes}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
