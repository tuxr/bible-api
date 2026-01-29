/**
 * Seed D1 database with parsed Bible data
 *
 * This script reads the parsed JSON files and generates SQL files for wrangler to execute.
 * Run with: npm run db:seed
 */

import { readFile, readdir, writeFile, mkdir, access } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { ALL_BOOKS, type BookData } from "../../src/lib/books-data.js";

const PARSED_DIR = join(process.cwd(), "data", "parsed");

interface ParsedVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

interface ParsedTranslation {
  id: string;
  name: string;
  language: string;
  verses: ParsedVerse[];
}

// Translation metadata
const TRANSLATION_META: Record<string, { name: string; language: string; license: string; description: string }> = {
  web: {
    name: "World English Bible",
    language: "en",
    license: "Public Domain",
    description: "A modern English translation in the public domain",
  },
  kjv: {
    name: "King James Version",
    language: "en",
    license: "Public Domain",
    description: "The 1769 edition of the King James Bible",
  },
};

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

async function main() {
  console.log("D1 Database Seeder");
  console.log("==================\n");

  const isProduction = process.argv.includes("--production");
  const flags = isProduction ? [] : ["--local"];
  console.log(`Mode: ${isProduction ? "PRODUCTION" : "LOCAL"}\n`);

  // Read parsed files
  let files: string[];
  try {
    files = await readdir(PARSED_DIR);
  } catch {
    console.error("No parsed files found. Run 'npm run data:parse' first.");
    process.exit(1);
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  if (jsonFiles.length === 0) {
    console.error("No JSON files found in data/parsed/");
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

  // Execute book inserts
  const booksSql = bookStatements.join("\n");
  const booksFile = join(PARSED_DIR, "_books.sql");
  await writeFile(booksFile, booksSql);
  await runWrangler(["d1", "execute", "bible-db", ...flags, `--file=${booksFile}`]);
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

    // Insert translation
    const translationSql = `INSERT OR REPLACE INTO translations (id, name, language, license, description) VALUES ('${translationId}', '${escapeSql(meta.name)}', '${meta.language}', '${escapeSql(meta.license)}', '${escapeSql(meta.description)}');`;

    const transFile = join(PARSED_DIR, `_${translationId}_translation.sql`);
    await writeFile(transFile, translationSql);
    await runWrangler(["d1", "execute", "bible-db", ...flags, `--file=${transFile}`]);
    console.log(`  Inserted translation: ${meta.name}`);

    // Insert verses in batches
    const BATCH_SIZE = 500;
    const batches: string[][] = [];
    let currentBatch: string[] = [];

    for (const verse of data.verses) {
      const stmt = `INSERT OR IGNORE INTO verses (translation_id, book_id, chapter, verse, text) VALUES ('${translationId}', '${verse.book}', ${verse.chapter}, ${verse.verse}, '${escapeSql(verse.text)}');`;
      currentBatch.push(stmt);

      if (currentBatch.length >= BATCH_SIZE) {
        batches.push(currentBatch);
        currentBatch = [];
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    console.log(`  Inserting ${data.verses.length} verses in ${batches.length} batches...`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (!batch) continue;

      const batchSql = batch.join("\n");
      const batchFile = join(PARSED_DIR, `_${translationId}_verses_${i}.sql`);
      await writeFile(batchFile, batchSql);
      await runWrangler(["d1", "execute", "bible-db", ...flags, `--file=${batchFile}`]);

      // Progress indicator
      if ((i + 1) % 10 === 0 || i === batches.length - 1) {
        console.log(`    Batch ${i + 1}/${batches.length} complete`);
      }
    }
  }

  console.log("\n✓ Database seeding complete!");
  console.log("\nRun 'npm run data:validate' to verify the data.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
