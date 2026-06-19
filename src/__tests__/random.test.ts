/**
 * Tests for scalable random verse selection
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { getRandomVerse } from "../lib/db.js";
import type { VerseRow } from "../types.js";

const sampleVerse: VerseRow = {
  id: 42,
  translation_id: "web",
  book_id: "GEN",
  chapter: 1,
  verse: 1,
  text: "In the beginning...",
};

function createMockDb(config: {
  count: number | string;
  verseAtOffset: (offset: number) => VerseRow | null;
  countError?: Error;
  selectError?: Error;
}) {
  const queries: string[] = [];
  const bindArgs: unknown[][] = [];

  const db = {
    prepare: vi.fn((query: string) => {
      queries.push(query);
      const isCountQuery = query.includes("COUNT(*)");
      return {
        bind: vi.fn((...args: unknown[]) => {
          bindArgs.push(args);
          return {
            first: vi.fn(async () => {
              if (isCountQuery) {
                if (config.countError) {
                  throw config.countError;
                }
                return { count: config.count };
              }
              if (config.selectError) {
                throw config.selectError;
              }
              const offset = args[args.length - 1] as number;
              return config.verseAtOffset(offset);
            }),
          };
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, queries, bindArgs };
}

describe("getRandomVerse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses COUNT and OFFSET instead of ORDER BY RANDOM()", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { db, queries, bindArgs } = createMockDb({
      count: 4,
      verseAtOffset: (offset) => ({ ...sampleVerse, id: offset + 1 }),
    });

    const result = await getRandomVerse(db, "web");

    expect(result).toEqual({ success: true, data: { ...sampleVerse, id: 3 } });
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain("COUNT(*)");
    expect(queries[0]).not.toContain("RANDOM()");
    expect(queries[0]).not.toContain("INNER JOIN books");
    expect(queries[1]).toContain("ORDER BY v.id");
    expect(queries[1]).toContain("OFFSET");
    expect(queries[1]).not.toContain("RANDOM()");
    expect(queries[1]).not.toContain("INNER JOIN books");
    expect(bindArgs[1]).toEqual(["web", 2]);
  });

  it("maps Math.random() near 1 to offset count - 1", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const { db, bindArgs } = createMockDb({
      count: 10,
      verseAtOffset: (offset) => ({ ...sampleVerse, id: offset + 1 }),
    });

    await getRandomVerse(db, "web");

    expect(bindArgs[1]).toEqual(["web", 9]);
  });

  it("always uses offset 0 when count is 1 regardless of Math.random()", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.75);
    const { db, queries, bindArgs } = createMockDb({
      count: 1,
      verseAtOffset: () => sampleVerse,
    });

    const result = await getRandomVerse(db, "web");

    expect(result).toEqual({ success: true, data: sampleVerse });
    expect(queries).toHaveLength(2);
    expect(bindArgs[1]).toEqual(["web", 0]);
  });

  it("applies book-only filter without books JOIN on both queries", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { db, queries, bindArgs } = createMockDb({
      count: 3,
      verseAtOffset: () => sampleVerse,
    });

    const result = await getRandomVerse(db, "web", { bookId: "GEN" });

    expect(result).toEqual({ success: true, data: sampleVerse });
    expect(bindArgs[0]).toEqual(["web", "GEN"]);
    expect(bindArgs[1]).toEqual(["web", "GEN", 0]);
    expect(queries[0]).toContain("v.book_id = ?");
    expect(queries[0]).not.toContain("INNER JOIN books");
    expect(queries[1]).not.toContain("INNER JOIN books");
  });

  it("returns null when no verses match filters", async () => {
    const { db, queries } = createMockDb({
      count: 0,
      verseAtOffset: () => null,
    });

    const result = await getRandomVerse(db, "web", { bookId: "GEN" });

    expect(result).toEqual({ success: true, data: null });
    expect(queries).toHaveLength(1);
    expect(queries[0]).not.toContain("INNER JOIN books");
  });

  it("coerces string COUNT results from the driver", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { db, bindArgs } = createMockDb({
      count: "3",
      verseAtOffset: () => sampleVerse,
    });

    const result = await getRandomVerse(db, "web");

    expect(result).toEqual({ success: true, data: sampleVerse });
    expect(bindArgs[1]).toEqual(["web", 0]);
  });

  it("returns null for non-finite COUNT values", async () => {
    const { db, queries } = createMockDb({
      count: "not-a-number",
      verseAtOffset: () => sampleVerse,
    });

    const result = await getRandomVerse(db, "web");

    expect(result).toEqual({ success: true, data: null });
    expect(queries).toHaveLength(1);
  });

  it("applies testament-only filter with books JOIN on both queries", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { db, queries, bindArgs } = createMockDb({
      count: 2,
      verseAtOffset: () => sampleVerse,
    });

    await getRandomVerse(db, "web", { testament: "NT" });

    expect(bindArgs[0]).toEqual(["web", "NT"]);
    expect(bindArgs[1]).toEqual(["web", "NT", 0]);
    expect(queries[0]).toContain("INNER JOIN books");
    expect(queries[0]).toContain("b.testament = ?");
    expect(queries[0]).not.toContain("v.book_id = ?");
    expect(queries[1]).toContain("INNER JOIN books");
    expect(queries[1]).toContain("b.testament = ?");
  });

  it("applies book and testament filters to both queries", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { db, queries, bindArgs } = createMockDb({
      count: 1,
      verseAtOffset: () => sampleVerse,
    });

    await getRandomVerse(db, "kjv", { bookId: "GEN", testament: "OT" });

    expect(bindArgs[0]).toEqual(["kjv", "GEN", "OT"]);
    expect(bindArgs[1]).toEqual(["kjv", "GEN", "OT", 0]);
    expect(queries[0]).toContain("v.book_id = ?");
    expect(queries[0]).toContain("b.testament = ?");
    expect(queries[1]).toContain("v.book_id = ?");
    expect(queries[1]).toContain("b.testament = ?");
  });

  it("returns database error when count query fails", async () => {
    const { db } = createMockDb({
      count: 0,
      verseAtOffset: () => null,
      countError: new Error("count failed"),
    });

    const result = await getRandomVerse(db, "web");

    expect(result).toEqual({ success: false, error: "Database query failed" });
  });

  it("returns database error when select query fails", async () => {
    const { db, queries } = createMockDb({
      count: 3,
      verseAtOffset: () => sampleVerse,
      selectError: new Error("select failed"),
    });

    const result = await getRandomVerse(db, "web");

    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain("COUNT(*)");
    expect(result).toEqual({ success: false, error: "Database query failed" });
  });
});