/**
 * data/sources.lock.json: the eBible source zips each translation is built from.
 *
 * eBible serves only the latest revision of a text at an unversioned URL, so the lock pins
 * each adopted zip by SHA-256, and every locked zip is archived (see `archive`) so it can be
 * fetched and re-parsed after eBible has moved on.
 */

import { createHash } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { Open } from "unzipper";

export const LOCK_PATH = join(process.cwd(), "data", "sources.lock.json");
export const SOURCES_DIR = join(process.cwd(), "data", "sources");
/** Zips that are not the locked revision (older copies, newer eBible revisions). Not parsed. */
export const OTHER_REVISIONS_DIR = join(SOURCES_DIR, "archive");

/** Where locked zips are archived: assets of one GitHub release. */
export const ARCHIVE_BASE = "https://github.com/tuxr/bible-api/releases/download/source-archive";

export interface LockedText {
  /** File name in data/sources/ and at `url`. */
  file: string;
  /** eBible's unversioned download URL (always the latest revision). */
  url: string;
  /** Date of the newest file in the zip (YYYY-MM-DD, UTC): eBible's revision date. */
  revision: string;
  /** SHA-256 of the zip: the revision's identity. */
  sha256: string;
  bytes: number;
  /** SHA-256 of the USFX XML inside the zip; tells a re-zip apart from a text change. */
  usfxSha256: string;
  /** Archived copy of exactly these bytes. */
  archive: string;
}

export interface SourcesLock {
  texts: Record<string, LockedText>;
}

export interface ZipInfo {
  sha256: string;
  bytes: number;
  revision: string;
  usfxSha256: string;
}

/** What a parsed translation records about the zip it was parsed from. */
export interface ParsedSource {
  file: string;
  revision: string;
  sha256: string;
}

export async function readLock(): Promise<SourcesLock> {
  return JSON.parse(await readFile(LOCK_PATH, "utf8")) as SourcesLock;
}

export async function writeLock(lock: SourcesLock): Promise<void> {
  await writeFile(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`);
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Archive name of a revision: `engwebp_usfx.zip` → `engwebp_usfx-2026-09-22-c883ea0b.zip`. */
export function revisionFileName(file: string, revision: string, sha: string): string {
  return file.replace(/\.zip$/, `-${revision}-${sha.slice(0, 8)}.zip`);
}

export function archiveUrl(file: string, revision: string, sha: string): string {
  return `${ARCHIVE_BASE}/${revisionFileName(file, revision, sha)}`;
}

/**
 * Modification times of a zip's entries, from its central directory. eBible's DOS timestamps
 * are in the packager's local zone (a day behind UTC in the evening), so the UTC time from
 * the "UT" extra field (0x5455) wins when present.
 */
export function zipEntryTimes(zip: Buffer): Date[] {
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("not a zip: no end of central directory");
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const times: Date[] = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error("bad central directory entry");
    const time = zip.readUInt16LE(offset + 12);
    const date = zip.readUInt16LE(offset + 14);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    let utc: Date | undefined;
    const extraEnd = offset + 46 + nameLength + extraLength;
    for (let p = offset + 46 + nameLength; p + 4 <= extraEnd; ) {
      const id = zip.readUInt16LE(p);
      const size = zip.readUInt16LE(p + 2);
      if (id === 0x5455 && size >= 5 && (zip.readUInt8(p + 4) & 1)) utc = new Date(zip.readInt32LE(p + 5) * 1000);
      p += 4 + size;
    }
    times.push(utc ?? new Date(Date.UTC(
      (date >> 9) + 1980, ((date >> 5) & 0x0f) - 1, date & 0x1f, time >> 11, (time >> 5) & 0x3f, (time & 0x1f) * 2
    )));
    offset = extraEnd + commentLength;
  }
  return times;
}

/** eBible's revision date: the newest entry's UTC date, YYYY-MM-DD. */
export function revisionDate(zip: Buffer): string {
  const newest = Math.max(...zipEntryTimes(zip).map((date) => date.getTime()));
  if (!Number.isFinite(newest)) throw new Error("zip has no entries");
  return new Date(newest).toISOString().slice(0, 10);
}

export async function zipInfo(buffer: Buffer): Promise<ZipInfo> {
  const zip = await Open.buffer(buffer);
  const usfx = zip.files.find((entry) => entry.path.endsWith("_usfx.xml"));
  if (!usfx) throw new Error("no *_usfx.xml in zip");
  return {
    sha256: sha256(buffer),
    bytes: buffer.length,
    revision: revisionDate(buffer),
    usfxSha256: sha256(await usfx.buffer()),
  };
}

/** The locked text whose zip is `file`, if any. */
export function lockedByFile(lock: SourcesLock, file: string): [id: string, text: LockedText] | undefined {
  return Object.entries(lock.texts).find(([, text]) => text.file === file);
}
