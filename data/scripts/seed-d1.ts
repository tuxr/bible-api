/**
 * Seed D1 database with parsed Bible data
 *
 * This script reads the parsed JSON files and generates SQL statements: local D1 runs them as
 * wrangler files, production through D1's query API (CLOUDFLARE_API_TOKEN, D1 edit).
 * Run with: npm run db:seed
 *   npm run db:seed -- --production  # production
 *   npm run db:seed -- --only bsb    # just these translations (comma-separated); skips the lexicons
 */

import { readFile, readdir, writeFile, mkdir, access } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { remoteExecute } from "./d1-remote.js";
import { ALL_BOOKS, type BookData } from "../../src/lib/books-data.js";
import { SEARCH_IDS } from "../../src/lib/search-index.js";
import { toSearchPlainText } from "../../src/lib/hebrew.js";
import { TRANSLATION_META } from "./translation-meta.js";

const PARSED_DIR = join(process.cwd(), "data", "parsed");

interface ParsedVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  segments?: Array<{ text: string; speaker: "jesus" | "narrator" }>;
  words?: unknown[];
  layout?: unknown[];
}

interface ParsedTranslation {
  id: string;
  name: string;
  language: string;
  source?: { revision: string; sha256: string };
  verses: ParsedVerse[];
}

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

function runWrangler(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["wrangler", ...args], {
      stdio: "inherit",
      shell: false,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Wrangler command failed with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

async function ensureDir(dir: string) {
  try {
    await access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Run statements against D1: production through the query API (d1-remote.ts: `--remote --file`
 * would make the database unavailable while each file imports), local through wrangler files.
 */
async function write(label: string, statements: string[], isProduction: boolean) {
  if (isProduction) return remoteExecute(label, statements);
  const BATCH_SIZE = 500;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const batchFile = join(PARSED_DIR, `_${label}_${i / BATCH_SIZE}.sql`);
    await writeFile(batchFile, statements.slice(i, i + BATCH_SIZE).join("\n"));
    await runWrangler(["d1", "execute", "bible-db", "--local", `--file=${batchFile}`]);
    console.log(`  ${label}: ${Math.min(i + BATCH_SIZE, statements.length)}/${statements.length}`);
  }
}

/** Load data/parsed/lexicon/*.json (written by data:tag) into the lexicon table. */
async function seedLexicons(isProduction: boolean) {
  const lexiconDir = join(PARSED_DIR, "lexicon");
  let files: string[];
  try {
    files = (await readdir(lexiconDir)).filter((f) => f.endsWith(".json"));
  } catch {
    console.log("\nNo lexicons found (run 'npm run data:tag' to build them), skipping...");
    return;
  }

  for (const file of files) {
    const { language, entries } = JSON.parse(await readFile(join(lexiconDir, file), "utf-8")) as {
      language: string;
      entries: Array<{ strong: string }>;
    };
    console.log(`\nInserting ${entries.length} ${language} lexicon entries...`);
    const statements = entries.map(
      (entry) => `INSERT OR REPLACE INTO lexicon (id, language, entry) VALUES ('${entry.strong}', '${escapeSql(language)}', '${escapeSql(JSON.stringify(entry))}');`
    );
    await write(`lexicon_${language}`, statements, isProduction);
  }
}

async function main() {
  console.log("D1 Database Seeder");
  console.log("==================\n");

  const isProduction = process.argv.includes("--production");
  console.log(`Mode: ${isProduction ? "PRODUCTION (remote)" : "LOCAL"}\n`);

  // Read parsed files
  let files: string[];
  try {
    files = await readdir(PARSED_DIR);
  } catch {
    console.error("No parsed files found. Run 'npm run data:parse' first.");
    process.exit(1);
  }

  // --only <ids>: seed just these translations, so adding one doesn't re-insert every other.
  const onlyAt = process.argv.indexOf("--only");
  const only = onlyAt === -1 ? undefined : (process.argv[onlyAt + 1] ?? "").split(",").filter(Boolean);
  const jsonFiles = files.filter((f) => f.endsWith(".json") && (!only || only.includes(f.replace(".json", ""))));
  if (jsonFiles.length === 0 || (only && jsonFiles.length !== only.length)) {
    console.error(only ? `Not every translation in --only ${only.join(",")} is in data/parsed/` : "No JSON files found in data/parsed/");
    process.exit(1);
  }

  // Insert books first (only once)
  console.log("Inserting books...");
  const bookStatements: string[] = [];

  for (const book of ALL_BOOKS) {
    const aliasesJson = JSON.stringify(book.aliases);
    const stmt = `INSERT OR IGNORE INTO books (id, name, testament, book_order, chapters, aliases) VALUES ('${book.id}', '${escapeSql(book.name)}', '${book.testament}', ${book.order}, ${book.chapters}, '${escapeSql(aliasesJson)}');`;
    bookStatements.push(stmt);
  }

  await write("books", bookStatements, isProduction);
  console.log(`  Inserted ${ALL_BOOKS.length} books`);

  // Process each translation
  for (const jsonFile of jsonFiles) {
    const translationId = jsonFile.replace(".json", "");
    console.log(`\nProcessing ${translationId}...`);

    const filePath = join(PARSED_DIR, jsonFile);
    const content = await readFile(filePath, "utf-8");
    const data: ParsedTranslation = JSON.parse(content);

    const meta = TRANSLATION_META[translationId] ?? {
      name: data.name,
      language: data.language || "en",
      license: "Unknown",
      description: "",
    };

    // Insert translation. The source revision is recorded only for a new translation: verses
    // are INSERT OR IGNORE, so re-seeding leaves an existing translation's text (and revision) as is.
    const source = data.source
      ? `'${data.source.revision}', '${data.source.sha256}', '${new Date().toISOString()}'`
      : "NULL, NULL, NULL";
    // search_id keys the search index (src/lib/search-index.ts); verses can't be inserted without it.
    const searchId = SEARCH_IDS[translationId];
    if (searchId === undefined) {
      throw new Error(`Translation ${translationId} has no search id: add it to SEARCH_IDS in src/lib/search-index.ts`);
    }
    const translationSql = `INSERT INTO translations (id, name, language, license, description, source_revision, source_sha256, imported_at, search_id) VALUES ('${translationId}', '${escapeSql(meta.name)}', '${meta.language}', '${escapeSql(meta.license)}', '${escapeSql(meta.description)}', ${source}, ${searchId}) ON CONFLICT (id) DO UPDATE SET name = excluded.name, language = excluded.language, license = excluded.license, description = excluded.description, search_id = COALESCE(translations.search_id, excluded.search_id);`;

    await write(`${translationId}_translation`, [translationSql], isProduction);
    console.log(`  Inserted translation: ${meta.name}`);

    const verseStatements = data.verses.map((verse) => {
      const textPlain = toSearchPlainText(translationId, verse.text);
      const segments = verse.segments ? `'${escapeSql(JSON.stringify(verse.segments))}'` : "NULL";
      const words = verse.words?.length ? `'${escapeSql(JSON.stringify(verse.words))}'` : "NULL";
      const layout = verse.layout?.length ? `'${escapeSql(JSON.stringify(verse.layout))}'` : "NULL";
      return `INSERT OR IGNORE INTO verses (translation_id, book_id, chapter, verse, text, text_plain, segments, words, layout) VALUES ('${translationId}', '${verse.book}', ${verse.chapter}, ${verse.verse}, '${escapeSql(verse.text)}', '${escapeSql(textPlain)}', ${segments}, ${words}, ${layout});`;
    });
    console.log(`  Inserting ${data.verses.length} verses...`);
    await write(`${translationId}_verses`, verseStatements, isProduction);
  }

  if (!only) await seedLexicons(isProduction);

  console.log("\n✓ Database seeding complete!");
  console.log("\nRun 'npm run data:validate' to verify the data.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
