/**
 * Download USFX Bible files from ebible.org, plus the pinned word-tagging sources.
 *
 * The Bible texts are the revisions in data/sources.lock.json. A zip on disk is kept only if
 * its SHA-256 matches the lock; otherwise it moves to data/sources/archive/. eBible serves only
 * its latest revision, so once that moves on the locked zip comes from the archive instead.
 *   npm run data:download                 # the locked revisions
 *   npm run data:download -- --refresh    # eBible's current revisions; updates the lock
 */

import { mkdir, writeFile, access, readFile, rm } from "fs/promises";
import { join } from "path";
import {
  OTHER_REVISIONS_DIR, SOURCES_DIR, archiveUrl, readLock, revisionFileName, sha256, writeLock, zipInfo,
  type LockedText, type SourcesLock,
} from "./sources-lock.js";

// --refresh: download eBible's current revision of every text and move the lock to it.
const refresh = process.argv.includes("--refresh");

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

async function fetchBuffer(url: string): Promise<Buffer> {
  console.log(`Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  await writeFile(destPath, await fetchBuffer(url));
  console.log(`  Saved to ${destPath}`);
}

async function readIfExists(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch {
    return undefined;
  }
}

/** Keep a zip that isn't the locked revision in data/sources/archive/, named by revision. */
async function keepOtherRevision(buffer: Buffer, file: string): Promise<string> {
  const info = await zipInfo(buffer);
  await ensureDir(OTHER_REVISIONS_DIR);
  const path = join(OTHER_REVISIONS_DIR, revisionFileName(file, info.revision, info.sha256));
  await writeFile(path, buffer);
  return path;
}

/** Make data/sources/<file> the locked revision: from disk, eBible, or the archive. */
async function ensureLocked(id: string, text: LockedText): Promise<void> {
  const destPath = join(SOURCES_DIR, text.file);
  const onDisk = await readIfExists(destPath);
  if (onDisk) {
    const info = await zipInfo(onDisk);
    if (info.sha256 === text.sha256) {
      console.log(`${id}: ${text.file} is the locked revision (${text.revision})`);
      return;
    }
    // Possibly the only copy of an older revision (the one a database was seeded from): keep it.
    await keepOtherRevision(onDisk, text.file);
    await rm(destPath);
    console.log(`${id}: ${text.file} on disk is revision ${info.revision} (${info.sha256.slice(0, 8)}), not the locked one; moved to data/sources/archive/`);
  }

  const latest = await fetchBuffer(text.url).catch((error: Error) => {
    console.log(`  ${id}: ${error.message}; fetching the locked revision from the archive`);
    return undefined;
  });
  if (latest && sha256(latest) === text.sha256) {
    await writeFile(destPath, latest);
    console.log(`  ${id}: saved the locked revision (${text.revision})`);
    return;
  }
  if (latest) {
    const kept = await keepOtherRevision(latest, text.file);
    console.log(`  ${id}: eBible now serves a different revision, not adopted (kept in ${kept}); fetching the locked one from the archive`);
  }
  const archived = await fetchBuffer(text.archive).catch((error: Error) => {
    throw new Error(`${id}: the locked revision is no longer on eBible and not in the archive (${error.message}). Archive it with 'npm run data:archive' from a checkout that still has the zip.`);
  });
  const archivedSha = sha256(archived);
  if (archivedSha !== text.sha256) {
    throw new Error(`${id}: archive ${text.archive} has SHA-256 ${archivedSha}, lock says ${text.sha256}`);
  }
  await writeFile(destPath, archived);
  console.log(`  ${id}: saved the locked revision (${text.revision}) from the archive`);
}

/** Move the lock to eBible's current revision of a text. Returns whether it changed. */
async function refreshLocked(id: string, text: LockedText, lock: SourcesLock): Promise<boolean> {
  const destPath = join(SOURCES_DIR, text.file);
  const latest = await fetchBuffer(text.url);
  const info = await zipInfo(latest);
  if (info.sha256 === text.sha256) {
    console.log(`  ${id}: unchanged (${text.revision})`);
    await writeFile(destPath, latest);
    return false;
  }
  const previous = await readIfExists(destPath);
  // Keep the replaced revision so the two can be compared.
  if (previous && sha256(previous) !== info.sha256) await keepOtherRevision(previous, text.file);
  await writeFile(destPath, latest);
  lock.texts[id] = {
    ...text,
    revision: info.revision,
    sha256: info.sha256,
    bytes: info.bytes,
    usfxSha256: info.usfxSha256,
    archive: archiveUrl(text.file, info.revision, info.sha256),
  };
  const usfx = info.usfxSha256 === text.usfxSha256 ? " (same USFX text, re-zipped)" : "";
  console.log(`  ${id}: ${text.revision} (${text.sha256.slice(0, 8)}) -> ${info.revision} (${info.sha256.slice(0, 8)})${usfx}`);
  return true;
}

async function main() {
  console.log("Bible Source Downloader");
  console.log("=======================\n");

  await ensureDir(SOURCES_DIR);
  const lock = await readLock();

  if (refresh) {
    let changed = 0;
    for (const [id, text] of Object.entries(lock.texts)) {
      if (await refreshLocked(id, text, lock)) changed++;
    }
    if (changed) {
      await writeLock(lock);
      console.log(`\nUpdated data/sources.lock.json (${changed} changed). Push it to archive the new zips, then review before adopting.`);
    }
  } else {
    for (const [id, text] of Object.entries(lock.texts)) await ensureLocked(id, text);
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
