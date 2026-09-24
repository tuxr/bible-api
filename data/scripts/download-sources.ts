/**
 * Download USFX Bible files from ebible.org
 * These are XML files containing the full text of various Bible translations
 */

import { mkdir, writeFile, access } from "fs/promises";
import { join } from "path";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";

const SOURCES_DIR = join(process.cwd(), "data", "sources");

// Translations to download
const TRANSLATIONS = [
  {
    id: "web",
    name: "World English Bible",
    url: "https://ebible.org/Scriptures/engwebp_usfx.zip",
    filename: "engwebp_usfx.zip",
  },
  {
    id: "kjv",
    name: "King James Version",
    url: "https://ebible.org/Scriptures/eng-kjv_usfx.zip",
    filename: "eng-kjv_usfx.zip",
  },
  {
    id: "wlc",
    name: "Westminster Leningrad Codex",
    url: "https://ebible.org/Scriptures/hboWLC_usfx.zip",
    filename: "hboWLC_usfx.zip",
  },
  {
    id: "tcgnt",
    name: "Text-Critical Greek New Testament",
    url: "https://ebible.org/Scriptures/grctcgnt_usfx.zip",
    filename: "grctcgnt_usfx.zip",
  },
];

// Word-tagging sources, pinned to commits so a re-import is reproducible.
const STEPBIBLE = "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/b99716b0cddb648ddb95cc786a197180f2f97d48";
const BYZTXT = "https://raw.githubusercontent.com/byztxt/byzantine-majority-text/27a45ff1b7be6c17ccbfeac414f3f55732ae8e28";
const STRONGS = "https://raw.githubusercontent.com/openscriptures/strongs/0acd2f251c2d35ff8db2dece4e0593979d3ac223";
const BYZTXT_BOOKS = [
  "MAT", "MAR", "LUK", "JOH", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH",
  "1TI", "2TI", "TIT", "PHM", "HEB", "JAM", "1PE", "2PE", "1JO", "2JO", "3JO", "JUD", "REV",
];
const stepFile = (dir: string, name: string) => `${STEPBIBLE}/${dir}/${encodeURIComponent(name)}`;

const WORD_SOURCES_DIR = join(SOURCES_DIR, "words");
const WORD_SOURCES: Array<{ filename: string; url: string }> = [
  ...BYZTXT_BOOKS.map((book) => ({
    filename: `byztxt-${book}.csv`,
    url: `${BYZTXT}/csv-unicode/strongs/with-parsing/${book}.csv`,
  })),
  ...["Mat-Jhn", "Act-Rev"].map((range) => ({
    filename: `TAGNT-${range}.txt`,
    url: stepFile("Translators Amalgamated OT+NT", `TAGNT ${range} - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt`),
  })),
  ...["Gen-Deu", "Jos-Est", "Job-Sng", "Isa-Mal"].map((range) => ({
    filename: `TAHOT-${range}.txt`,
    url: stepFile("Translators Amalgamated OT+NT", `TAHOT ${range} - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt`),
  })),
  {
    filename: "TBESG.txt",
    url: stepFile("Lexicons", "TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt"),
  },
  {
    filename: "TBESH.txt",
    url: stepFile("Lexicons", "TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt"),
  },
  { filename: "strongsgreek.xml", url: `${STRONGS}/greek/StrongsGreekDictionaryXML_1.4/strongsgreek.xml` },
  { filename: "StrongHebrewG.xml", url: `${STRONGS}/hebrew/StrongHebrewG.xml` },
];

async function ensureDir(dir: string) {
  try {
    await access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`Downloading ${url}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await writeFile(destPath, Buffer.from(buffer));

  console.log(`  Saved to ${destPath}`);
}

async function main() {
  console.log("Bible Source Downloader");
  console.log("=======================\n");

  await ensureDir(SOURCES_DIR);

  for (const translation of TRANSLATIONS) {
    const destPath = join(SOURCES_DIR, translation.filename);

    try {
      await access(destPath);
      console.log(`${translation.name} already downloaded, skipping...`);
    } catch {
      await downloadFile(translation.url, destPath);
    }
  }

  await ensureDir(WORD_SOURCES_DIR);
  console.log("\nWord-tagging sources");
  for (const source of WORD_SOURCES) {
    const destPath = join(WORD_SOURCES_DIR, source.filename);
    try {
      await access(destPath);
    } catch {
      await downloadFile(source.url, destPath);
    }
  }

  console.log("\nDone! Run 'npm run data:parse' to parse the downloaded files.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
