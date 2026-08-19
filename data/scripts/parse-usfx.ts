/**
 * Parse USFX XML files into structured JSON
 *
 * USFX (Unified Scripture Format XML) is a standard XML format for Bible texts.
 * This parser extracts verses while handling the complex nested structure.
 */

import { createReadStream } from "fs";
import { mkdir, readdir, writeFile, access } from "fs/promises";
import { join, basename } from "path";
import sax from "sax";
import { Open } from "unzipper";

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
  verses: Verse[];
}

// USFX book ID mapping (some translations use different codes)
const BOOK_ID_MAP: Record<string, string> = {
  // Standard mappings
  GEN: "GEN", EXO: "EXO", LEV: "LEV", NUM: "NUM", DEU: "DEU",
  JOS: "JOS", JDG: "JDG", RUT: "RUT", "1SA": "1SA", "2SA": "2SA",
  "1KI": "1KI", "2KI": "2KI", "1CH": "1CH", "2CH": "2CH", EZR: "EZR",
  NEH: "NEH", EST: "EST", JOB: "JOB", PSA: "PSA", PRO: "PRO",
  ECC: "ECC", SNG: "SNG", ISA: "ISA", JER: "JER", LAM: "LAM",
  EZK: "EZK", DAN: "DAN", HOS: "HOS", JOL: "JOL", AMO: "AMO",
  OBA: "OBA", JON: "JON", MIC: "MIC", NAM: "NAM", HAB: "HAB",
  ZEP: "ZEP", HAG: "HAG", ZEC: "ZEC", MAL: "MAL",
  MAT: "MAT", MRK: "MRK", LUK: "LUK", JHN: "JHN", ACT: "ACT",
  ROM: "ROM", "1CO": "1CO", "2CO": "2CO", GAL: "GAL", EPH: "EPH",
  PHP: "PHP", COL: "COL", "1TH": "1TH", "2TH": "2TH", "1TI": "1TI",
  "2TI": "2TI", TIT: "TIT", PHM: "PHM", HEB: "HEB", JAS: "JAS",
  "1PE": "1PE", "2PE": "2PE", "1JN": "1JN", "2JN": "2JN", "3JN": "3JN",
  JUD: "JUD", REV: "REV",
  // Apocrypha
  TOB: "TOB", JDT: "JDT", ESG: "ESG", WIS: "WIS", SIR: "SIR",
  BAR: "BAR", LJE: "LJE", S3Y: "S3Y", SUS: "SUS", BEL: "BEL",
  "1MA": "1MA", "2MA": "2MA", "3MA": "3MA", "4MA": "4MA",
  "1ES": "1ES", "2ES": "2ES", MAN: "MAN", PS2: "PS2", ODA: "ODA", PSS: "PSS",
  // Alternate codes used in some translations
  "1SM": "1SA", "2SM": "2SA", "1KG": "1KI", "2KG": "2KI",
  "1CR": "1CH", "2CR": "2CH", SOS: "SNG", SOL: "SNG",
  "EZE": "EZK", JOE: "JOL", OBD: "OBA", NAH: "NAM",
  ZPH: "ZEP", ZCH: "ZEC", JOH: "JHN", JAN: "JHN",
  PHI: "PHP", "1TS": "1TH", "2TS": "2TH", "1TM": "1TI", "2TM": "2TI",
  PHL: "PHM", JAM: "JAS", "1PT": "1PE", "2PT": "2PE",
  "1JO": "1JN", "2JO": "2JN", "3JO": "3JN",
  // More variants
  GE: "GEN", EX: "EXO", LE: "LEV", NU: "NUM", DE: "DEU",
  JG: "JDG", RU: "RUT", "1S": "1SA", "2S": "2SA",
  PS: "PSA", PR: "PRO", EC: "ECC", CA: "SNG",
  LA: "LAM", DA: "DAN", HO: "HOS", AM: "AMO",
  OB: "OBA", JN: "JON", MI: "MIC", NA: "NAM",
  ZC: "ZEC", MT: "MAT", MK: "MRK", LK: "LUK",
  AC: "ACT", RO: "ROM", "1C": "1CO", "2C": "2CO",
  EP: "EPH", PH: "PHP", "1T": "1TH", "2T": "2TH",
  TI: "TIT", PM: "PHM", HE: "HEB", "1P": "1PE", "2P": "2PE",
  "1J": "1JN", "2J": "2JN", "3J": "3JN", JU: "JUD", RE: "REV",
};

function normalizeBookId(id: string): string | null {
  const upper = id.toUpperCase();
  return BOOK_ID_MAP[upper] ?? null;
}

function parseUSFXBuffer(buffer: Buffer, translationId: string): ParsedTranslation {
  const parser = sax.parser(true, { trim: false });
  const verses: Verse[] = [];

  let currentBook: string | null = null;
  let currentChapter = 0;
  let currentVerse = 0;
  let verseText = "";
  let inVerse = false;
  let inNote = false;
  let translationName = "";
  let translationLang = "en";

  parser.onopentag = (node) => {
    const tagName = node.name.toLowerCase();

    switch (tagName) {
      case "book":
        const bookId = node.attributes.id as string;
        if (bookId) {
          currentBook = normalizeBookId(bookId);
          if (!currentBook && bookId !== "FRT" && bookId !== "GLO" && bookId !== "DAG" && bookId !== "BAK" && bookId !== "INT") {
            console.log(`  Unknown book ID: ${bookId}`);
          }
        }
        currentChapter = 0;
        currentVerse = 0;
        break;

      case "c": // Chapter
        const chapterNum = node.attributes.id as string;
        if (chapterNum) {
          // Save any in-progress verse BEFORE updating chapter
          // This prevents the last verse of a chapter being saved as verse 0 of the next chapter
          if (inVerse && verseText.trim() && currentBook && currentChapter > 0) {
            verses.push({
              book: currentBook,
              chapter: currentChapter,
              verse: currentVerse,
              text: cleanText(verseText),
            });
            verseText = "";
            inVerse = false;
          }
          currentChapter = parseInt(chapterNum, 10);
          currentVerse = 0;
        }
        break;

      case "v": // Verse
        const verseNum = node.attributes.id as string;
        if (verseNum && currentBook && currentChapter > 0) {
          // Save any previous verse
          if (inVerse && verseText.trim()) {
            verses.push({
              book: currentBook,
              chapter: currentChapter,
              verse: currentVerse,
              text: cleanText(verseText),
            });
          }

          currentVerse = parseInt(verseNum, 10);
          verseText = "";
          inVerse = true;
        }
        break;

      case "f": // Footnote
      case "x": // Cross-reference
      case "fe": // End footnote
      case "note":
        inNote = true;
        break;
    }
  };

  parser.onclosetag = (tagName) => {
    const tag = tagName.toLowerCase();

    switch (tag) {
      case "f":
      case "x":
      case "fe":
      case "note":
        inNote = false;
        break;

      case "book":
        // Save last verse of book
        if (inVerse && verseText.trim() && currentBook) {
          verses.push({
            book: currentBook,
            chapter: currentChapter,
            verse: currentVerse,
            text: cleanText(verseText),
          });
        }
        inVerse = false;
        currentBook = null;
        break;

      case "p": // Paragraph - add space
      case "q": // Poetry line
      case "q1":
      case "q2":
        if (inVerse) {
          verseText += " ";
        }
        break;
    }
  };

  parser.ontext = (text) => {
    if (inVerse && !inNote && text) {
      verseText += text;
    }
  };

  // Parse the buffer as a string
  parser.write(buffer.toString("utf-8")).close();

  // Save any remaining verse
  if (inVerse && verseText.trim() && currentBook) {
    verses.push({
      book: currentBook,
      chapter: currentChapter,
      verse: currentVerse,
      text: cleanText(verseText),
    });
  }

  console.log(`  Parsed ${verses.length} verses`);

  return {
    id: translationId,
    name: translationName || translationId.toUpperCase(),
    language: translationLang,
    verses,
  };
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/\s([.,;:!?])/g, "$1") // Remove space before punctuation
    .trim();
}

async function extractAndParseZip(zipPath: string, translationId: string): Promise<ParsedTranslation> {
  console.log(`\nParsing ${zipPath}...`);

  // Open the zip file
  const directory = await Open.file(zipPath);

  // Find the main USFX XML file (ends with _usfx.xml)
  const usfxEntry = directory.files.find(f => f.path.endsWith("_usfx.xml"));

  if (!usfxEntry) {
    throw new Error(`No USFX file found in ${zipPath}`);
  }

  console.log(`  Processing: ${usfxEntry.path}`);

  // Read the file content
  const buffer = await usfxEntry.buffer();

  return parseUSFXBuffer(buffer, translationId);
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
    } else {
      translationId = basename(zipFile, ".zip").replace(/_usfx$/, "");
    }

    try {
      const result = await extractAndParseZip(join(SOURCES_DIR, zipFile), translationId);

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
