/**
 * Parse USFX XML files into structured JSON
 *
 * USFX (Unified Scripture Format XML) is a standard XML format for Bible texts.
 * The parsers live in src/lib: usfx-parse.ts for eBible's USFX zips and
 * usfm-parse.ts for the BSB publisher's USFM zip. This script only picks the
 * file in each zip, names the translation and records its source revision.
 */

import { mkdir, readdir, readFile, writeFile, access } from "fs/promises";
import { join, basename } from "path";
import { Open } from "unzipper";
import { parseUSFXBuffer } from "../../src/lib/usfx-parse.js";
import { bsbUsfmCleanup, parseUSFMBooks } from "../../src/lib/usfm-parse.js";
import { lockedByFile, readLock, revisionDate, sha256, type ParsedSource } from "./sources-lock.js";

const SOURCES_DIR = join(process.cwd(), "data", "sources");
const PARSED_DIR = join(process.cwd(), "data", "parsed");

interface Verse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

interface ParsedTranslation {
  id: string;
  name: string;
  language: string;
  /** The zip this was parsed from; seed and backfill record it on the translation. */
  source?: ParsedSource;
  verses: Verse[];
}

async function extractAndParseZip(zipPath: string, translationId: string): Promise<ParsedTranslation> {
  console.log(`\nParsing ${zipPath}...`);

  // Open the zip file
  const directory = await Open.file(zipPath);

  // An eBible zip holds one USFX file (*_usfx.xml); the BSB publisher's holds a .usfm per book.
  const usfxEntry = directory.files.find(f => f.path.endsWith("_usfx.xml"));
  if (usfxEntry) {
    console.log(`  Processing: ${usfxEntry.path}`);
    return parseUSFXBuffer(await usfxEntry.buffer(), translationId);
  }

  const usfmEntries = directory.files.filter((f) => f.path.endsWith(".usfm"));
  if (usfmEntries.length === 0) {
    throw new Error(`No USFX or USFM files found in ${zipPath}`);
  }
  console.log(`  Processing: ${usfmEntries.length} USFM books`);
  const books = await Promise.all(usfmEntries.map(async (entry) => ({ name: entry.path, content: (await entry.buffer()).toString("utf8") })));
  return parseUSFMBooks(books, translationId, translationId === "bsb" ? { cleanup: bsbUsfmCleanup } : {});
}

async function ensureDir(dir: string) {
  try {
    await access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

async function main() {
  console.log("USFX Parser");
  console.log("===========\n");

  await ensureDir(PARSED_DIR);

  // Find all zip files in sources directory
  let files: string[];
  try {
    files = await readdir(SOURCES_DIR);
  } catch {
    console.error("No source files found. Run 'npm run data:download' first.");
    process.exit(1);
  }

  const zipFiles = files.filter((f) => f.endsWith(".zip"));
  const lock = await readLock();
  if (zipFiles.length === 0) {
    console.error("No ZIP files found in data/sources/");
    process.exit(1);
  }

  for (const zipFile of zipFiles) {
    // Extract translation ID from filename
    // e.g., "engwebp_usfx.zip" -> "web", "eng-kjv_usfx.zip" -> "kjv"
    let translationId: string;
    if (zipFile.includes("web")) {
      translationId = "web";
    } else if (zipFile.includes("kjv")) {
      translationId = "kjv";
    } else if (zipFile.toLowerCase().includes("wlc")) {
      translationId = "wlc";
    } else if (
      zipFile.toLowerCase().includes("grctcgnt") ||
      zipFile.toLowerCase().includes("tcgnt")
    ) {
      translationId = "tcgnt";
    } else if (zipFile.toLowerCase().includes("engbsb") || zipFile === "bsb_usfm.zip") {
      translationId = "bsb";
    } else {
      translationId = basename(zipFile, ".zip").replace(/_usfx$/, "");
    }

    try {
      const zipPath = join(SOURCES_DIR, zipFile);
      const result = await extractAndParseZip(zipPath, translationId);
      const zip = await readFile(zipPath);
      result.source = { file: zipFile, revision: revisionDate(zip), sha256: sha256(zip) };
      const locked = lockedByFile(lock, zipFile)?.[1];
      if (locked?.sha256 !== result.source.sha256) {
        console.warn(`  Warning: ${zipFile} is not the revision in data/sources.lock.json; run 'npm run data:download'`);
      }

      // Set proper names
      if (translationId === "web") {
        result.name = "World English Bible";
      } else if (translationId === "kjv") {
        result.name = "King James Version";
      } else if (translationId === "wlc") {
        result.name = "Westminster Leningrad Codex";
        result.language = "he";
      } else if (translationId === "tcgnt") {
        result.name = "Text-Critical Greek New Testament";
        result.language = "grc";
      } else if (translationId === "bsb") {
        result.name = "Berean Standard Bible";
      }

      // Write parsed JSON
      const outputPath = join(PARSED_DIR, `${translationId}.json`);
      await writeFile(outputPath, JSON.stringify(result, null, 2));
      console.log(`  Wrote ${outputPath}`);
    } catch (err) {
      console.error(`  Error parsing ${zipFile}:`, err);
    }
  }

  console.log("\nDone! Run 'npm run db:seed' to seed the database.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
