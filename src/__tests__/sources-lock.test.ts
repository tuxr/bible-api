import { describe, it, expect } from "vitest";
import lockJson from "../../data/sources.lock.json";
import { archiveUrl, revisionDate, revisionFileName, zipEntryTimes, type SourcesLock } from "../../data/scripts/sources-lock.js";

/** A zip's central directory + end record (all zipEntryTimes reads), one entry per spec. */
function zipWith(entries: Array<{ dos: { date: number; time: number }; utc?: number }>): Buffer {
  const records = entries.map(({ dos, utc }, index) => {
    const name = Buffer.from(`file${index}.xml`);
    const extra = Buffer.alloc(utc === undefined ? 0 : 9);
    if (utc !== undefined) {
      extra.writeUInt16LE(0x5455, 0);
      extra.writeUInt16LE(5, 2);
      extra.writeUInt8(1, 4); // mtime present
      extra.writeInt32LE(utc, 5);
    }
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(dos.time, 12);
    header.writeUInt16LE(dos.date, 14);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(extra.length, 30);
    return Buffer.concat([header, name, extra]);
  });
  const directory = Buffer.concat(records);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(0, 16);
  return Buffer.concat([directory, end]);
}

// 2026-09-21 18:23:16 as a DOS date/time (packager's local zone).
const dos = { date: ((2026 - 1980) << 9) | (9 << 5) | 21, time: (18 << 11) | (23 << 5) | 8 };

describe("zip revision dates", () => {
  it("prefers the UTC time from the UT extra field", () => {
    const utc = Date.UTC(2026, 8, 22, 4, 23, 15) / 1000;
    expect(zipEntryTimes(zipWith([{ dos, utc }]))[0]?.toISOString()).toBe("2026-09-22T04:23:15.000Z");
    expect(revisionDate(zipWith([{ dos, utc }]))).toBe("2026-09-22");
  });

  it("falls back to the DOS date and takes the newest entry", () => {
    const older = { date: ((2026 - 1980) << 9) | (8 << 5) | 8, time: 0 };
    expect(revisionDate(zipWith([{ dos: older }, { dos }]))).toBe("2026-09-21");
  });

  it("rejects a buffer that is not a zip", () => {
    expect(() => zipEntryTimes(Buffer.alloc(64))).toThrow(/not a zip/);
  });
});

describe("data/sources.lock.json", () => {
  const lock = lockJson as SourcesLock;

  it("pins every translation", () => {
    expect(Object.keys(lock.texts).sort()).toEqual(["kjv", "tcgnt", "web", "wlc"]);
  });

  it.each(Object.entries(lock.texts))("%s is a complete, consistent entry", (_id, text) => {
    expect(text.url).toBe(`https://ebible.org/Scriptures/${text.file}`);
    expect(text.revision).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(text.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(text.usfxSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(text.bytes).toBeGreaterThan(0);
    expect(text.archive).toBe(archiveUrl(text.file, text.revision, text.sha256));
  });

  it("names archived revisions by date and hash prefix", () => {
    expect(revisionFileName("engwebp_usfx.zip", "2026-09-22", "c883ea0b8c9b")).toBe("engwebp_usfx-2026-09-22-c883ea0b.zip");
  });
});
