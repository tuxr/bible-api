/**
 * Bring an existing D1 database up to date with the current parse + tag output:
 *   1. verse text with USFX section headings removed (plus text_plain and segments),
 *   2. per-word tags in verses.words,
 *   3. lexicon rows.
 *
 * Run `npm run db:migrate:words` first. Idempotent: a second run reports zero writes.
 *   npm run db:backfill:words              # local
 *   npm run db:backfill:words -- --remote  # production (D1 query API, CLOUDFLARE_API_TOKEN)
 *   add --dry-run to report what would be written without writing
 *   add --adopt-revision=tcgnt to also move verses stored from an older upstream revision to
 *   the current source (otherwise a tagged translation aborts, an untagged one is left alone)
 *   add --translations=tcgnt,wlc to check only those; each reads all its stored verses once
 *
 * Run `npm run db:migrate:sources` first too. Once a translation's stored text matches its
 * source exactly, the backfill records that source's revision on the translations row.
 */

import { readFile, readdir, writeFile, access } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { toSearchPlainText } from "../../src/lib/hebrew.js";
import { Open } from "unzipper";
import { parseUSFXBuffer } from "../../src/lib/usfx-parse.js";
import { readLock, sha256, type ParsedSource, type SourcesLock } from "./sources-lock.js";

type ParsedVerse = { book: string; chapter: number; verse: number; text: string; segments?: unknown[]; words?: unknown[] };
type ParsedTranslation = { source?: ParsedSource; verses: ParsedVerse[] };
type StoredVerse = { book_id: string; chapter: number; verse: number; text: string; segments: string | null; words: string | null };
const parsedDir = join(process.cwd(), "data", "parsed");
const target = process.argv.includes("--remote") ? "--remote" : "--local";
// --dry-run: compare and report, write nothing.
const dryRun = process.argv.includes("--dry-run");
// --adopt-revision=tcgnt,…: also replace stored verses that are an older upstream revision.
const adoptRevision = new Set(
  process.argv.find((arg) => arg.startsWith("--adopt-revision="))?.slice("--adopt-revision=".length).split(",") ?? []
);
const allIds = ["web", "kjv", "wlc", "tcgnt"];
// --translations=tcgnt,…: only these. D1 bills per row read, and every run reads each
// selected translation's verses once (about 120,000 rows for all four).
const ids = process.argv.find((arg) => arg.startsWith("--translations="))?.slice("--translations=".length).split(",") ?? allIds;
for (const id of [...ids, ...adoptRevision]) {
  if (!allIds.includes(id)) throw new Error(`Unknown translation '${id}' (expected ${allIds.join(", ")})`);
}
for (const id of adoptRevision) {
  if (!ids.includes(id)) throw new Error(`--adopt-revision=${id} needs ${id} in --translations`);
}

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
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

/**
 * Production goes through D1's query API, not wrangler: `wrangler d1 execute --remote --file`
 * uses the import path, which makes the database unavailable while each file imports, and
 * ~900 `--command` launches would take over an hour. Ids come from wrangler.toml; the token
 * from CLOUDFLARE_API_TOKEN (D1 edit).
 */
let remoteApi: { url: string; token: string } | undefined;
async function remoteQuery<T>(sql: string): Promise<Array<{ results?: T[] }>> {
  if (!remoteApi) {
    const toml = await readFile(join(process.cwd(), "wrangler.toml"), "utf8");
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? toml.match(/^account_id\s*=\s*"([^"]+)"/m)?.[1];
    const databaseId = toml.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1];
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !databaseId || !token) throw new Error("--remote needs CLOUDFLARE_API_TOKEN and account_id/database_id in wrangler.toml");
    remoteApi = { url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, token };
  }
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(remoteApi.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${remoteApi.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    });
    const body = (await response.json().catch(() => ({}))) as { success?: boolean; result?: Array<{ results?: T[] }>; errors?: unknown };
    if (response.ok && body.success) return body.result ?? [];
    // Retry rate limits and server errors; SQL errors fail straight away.
    if (attempt < 5 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`D1 query failed (${response.status}): ${JSON.stringify(body.errors ?? body)}`);
  }
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
  if (target === "--remote") {
    const MAX_BYTES = 90_000;
    let batch: string[] = [];
    let bytes = 0;
    let written = 0;
    const flush = async () => {
      if (!batch.length) return;
      await remoteQuery(batch.join("\n"));
      written += batch.length;
      console.log(`  ${label}: ${written}/${statements.length}`);
      batch = [];
      bytes = 0;
    };
    for (const statement of statements) {
      const size = Buffer.byteLength(statement);
      if (bytes + size > MAX_BYTES) await flush();
      batch.push(statement);
      bytes += size;
    }
    await flush();
    return;
  }
  const BATCH_SIZE = 200;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const file = join(parsedDir, `_backfill_${label}_${i / BATCH_SIZE}.sql`);
    await writeFile(file, statements.slice(i, i + BATCH_SIZE).join("\n"));
    await runWrangler(["d1", "execute", "bible-db", target, `--file=${file}`]);
  }
}

const SOURCE_ZIPS: Record<string, string> = {
  web: "engwebp_usfx.zip",
  kjv: "eng-kjv_usfx.zip",
  wlc: "hboWLC_usfx.zip",
  tcgnt: "grctcgnt_usfx.zip",
};

/**
 * What the parser produced before the heading and escaped-markup fixes, from the same
 * source files. A stored verse is only rewritten when it equals this: then the difference
 * is exactly those fixes, never an upstream revision that happens to look like one.
 */
async function legacyTexts(id: string, source: ParsedSource): Promise<Map<string, string>> {
  const path = join(process.cwd(), "data", "sources", SOURCE_ZIPS[id]!);
  if (sha256(await readFile(path)) !== source.sha256) {
    throw new Error(`${id}: ${SOURCE_ZIPS[id]} is not the zip data/parsed/${id}.json was parsed from; run 'npm run data:parse'`);
  }
  const zip = await Open.file(path);
  const entry = zip.files.find((file) => file.path.endsWith("_usfx.xml"));
  if (!entry) throw new Error(`${id}: no USFX file in ${SOURCE_ZIPS[id]}`);
  const legacy = parseUSFXBuffer(await entry.buffer(), id, { legacy: true });
  return new Map(legacy.verses.map((verse) => [key(verse.book, verse.chapter, verse.verse), verse.text]));
}

async function backfillVerses(id: string, lock: SourcesLock): Promise<number> {
  const file = join(parsedDir, `${id}.json`);
  if (!(await exists(file))) { console.log(`Skipping ${id}: parsed JSON not found`); return 0; }
  const parsed = JSON.parse(await readFile(file, "utf8")) as ParsedTranslation;
  const source = parsed.source;
  // The revision recorded on the row must be one production can be compared with: the lock's.
  if (!source || source.sha256 !== lock.texts[id]?.sha256) {
    throw new Error(`${id}: data/parsed/${id}.json is not parsed from the revision in data/sources.lock.json; run 'npm run data:download' and 'npm run data:parse'`);
  }

  // Query by book so Wrangler never serializes a whole translation's words in one response.
  const stored = new Map<string, StoredVerse>();
  for (const bookId of new Set(parsed.verses.map((verse) => verse.book))) {
    const rows = await query<StoredVerse>(`SELECT book_id, chapter, verse, text, segments, words FROM verses WHERE translation_id = '${id}' AND book_id = '${bookId}'`);
    for (const row of rows) stored.set(key(row.book_id, row.chapter, row.verse), row);
  }
  if (stored.size !== parsed.verses.length) {
    throw new Error(`${id}: verse count parsed=${parsed.verses.length} stored=${stored.size}`);
  }

  const legacy = await legacyTexts(id, source);
  const unexpected: string[] = [];
  const otherRevision: string[] = [];
  const statements: string[] = [];
  let textUpdates = 0;
  let revisionUpdates = 0;
  let wordUpdates = 0;
  // Word tags are aligned to the parsed text, so a tagged translation must match it exactly.
  const tagged = parsed.verses.some((verse) => verse.words?.length);
  for (const verse of parsed.verses) {
    const ref = `${verse.book} ${verse.chapter}:${verse.verse}`;
    const row = stored.get(key(verse.book, verse.chapter, verse.verse));
    if (!row) { unexpected.push(`${ref} missing`); continue; }
    const where = `WHERE translation_id = '${id}' AND book_id = '${verse.book}' AND chapter = ${verse.chapter} AND verse = ${verse.verse}`;

    if (row.text !== verse.text) {
      const isParserFix = row.text === legacy.get(key(verse.book, verse.chapter, verse.verse));
      if (!isParserFix && adoptRevision.has(id)) revisionUpdates++;
      else if (!isParserFix) {
        // An untagged translation stored from an older upstream revision (eBible revises
        // WEB): leave that text alone. Updating it is a separate decision from this backfill.
        if (tagged) unexpected.push(ref);
        else otherRevision.push(ref);
        continue;
      }
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
    throw new Error(
      `${id}: ${unexpected.length} stored verses are a different source revision, so their word tags would not match the served text: ${unexpected.slice(0, 20).join(", ")}`
    );
  }
  if (textUpdates) {
    // Rewriting text invalidates a revision recorded for another zip. Clear it first, so a run
    // that fails partway leaves the row unrecorded rather than claiming the old revision.
    statements.unshift(`UPDATE translations SET source_revision = NULL, source_sha256 = NULL, imported_at = NULL WHERE id = '${id}' AND source_sha256 != '${source.sha256}';`);
  }
  await execute(id, statements);
  const verb = dryRun ? "to update" : "updated";
  console.log(`${id}: ${textUpdates} verse texts ${verb} (${revisionUpdates} of them to the current source revision), ${wordUpdates} word rows ${verb}`);
  if (otherRevision.length) {
    console.log(`  ${otherRevision.length} verses left unchanged: stored text is a different source revision (e.g. ${otherRevision.slice(0, 5).join(", ")})`);
    return statements.length;
  }
  // Every stored verse now matches the source: record its revision (after the verse writes
  // succeeded, so a failed run never claims a revision it didn't finish adopting).
  return statements.length + (await recordRevision(id, source));
}

async function recordRevision(id: string, source: ParsedSource): Promise<number> {
  const [row] = await query<{ source_revision: string | null; source_sha256: string | null }>(
    `SELECT source_revision, source_sha256 FROM translations WHERE id = '${id}'`
  );
  if (!row) throw new Error(`${id}: no translations row`);
  if (row.source_sha256 === source.sha256) return 0;
  await execute(`${id}_source`, [
    `UPDATE translations SET source_revision = '${source.revision}', source_sha256 = '${source.sha256}', imported_at = '${new Date().toISOString()}' WHERE id = '${id}';`,
  ]);
  const from = row.source_sha256 ? `${row.source_revision} (${row.source_sha256.slice(0, 8)})` : "unrecorded";
  console.log(`  source revision ${dryRun ? "to record" : "recorded"}: ${from} -> ${source.revision} (${source.sha256.slice(0, 8)})`);
  return 1;
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
    console.log(`lexicon ${language}: ${statements.length} entries ${dryRun ? "to write" : "written"}`);
    writes += statements.length;
  }
  return writes;
}

async function main() {
  const columns = await query<{ name: string }>("PRAGMA table_info(translations)");
  if (!columns.some((column) => column.name === "source_sha256")) {
    throw new Error("translations has no source columns; run 'npm run db:migrate:sources' first");
  }
  const lock = await readLock();
  let writes = 0;
  for (const id of ids) writes += await backfillVerses(id, lock);
  writes += await backfillLexicons();
  console.log(`Total writes: ${writes}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
