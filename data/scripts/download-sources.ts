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

  console.log("\nDone! Run 'npm run data:parse' to parse the downloaded files.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
