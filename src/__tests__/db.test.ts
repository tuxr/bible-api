/**
 * Unit tests for getVerses() — multi-chapter SQL, params, and row selection.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { getVerses, getVersesForMultipleReferences } from "../lib/db.js";
import { BOOKS_BY_ID } from "../lib/books-data.js";
import { setupTestDatabase } from "./helpers/test-db.js";
import type { ParsedReference } from "../lib/parser.js";
import type { VerseRow } from "../types.js";

const genesis = BOOKS_BY_ID.get("GEN")!;

function createMultiChapterRef(
  overrides: Partial<Omit<ParsedReference, "book">> & Pick<ParsedReference, "startChapter" | "endChapter">
): ParsedReference {
  return {
    book: genesis,
    startVerse: 1,
    endVerse: 1,
    ...overrides,
  };
}

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

function createGetVersesMockDb(results: VerseRow[] = []) {
  const queries: string[] = [];
  const bindArgs: unknown[][] = [];

  const db = {
    prepare: vi.fn((query: string) => {
      queries.push(normalizeQuery(query));
      return {
        bind: vi.fn((...args: unknown[]) => {
          bindArgs.push(args);
          return {
            all: vi.fn(async () => ({ results })),
          };
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, queries, bindArgs };
}

describe("getVerses multi-chapter SQL and params", () => {
  it("binds explicit endVerse with eight placeholders and no sentinel", async () => {
    const ref = createMultiChapterRef({
      startChapter: 1,
      startVerse: 1,
      endChapter: 2,
      endVerse: 3,
    });
    const { db, queries, bindArgs } = createGetVersesMockDb();

    const result = await getVerses(db, ref, "web");

    expect(result.success).toBe(true);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("(chapter = ? AND verse <= ?)");
    expect(queries[0]).not.toContain("999");
    expect(bindArgs[0]).toEqual(["web", "GEN", 1, 1, 1, 2, 2, 3]);
  });

  it("omits endVerse bind for adjacent chapters when endVerse is null", async () => {
    const ref = createMultiChapterRef({
      startChapter: 1,
      startVerse: 2,
      endChapter: 2,
      endVerse: null,
    });
    const { db, queries, bindArgs } = createGetVersesMockDb();

    await getVerses(db, ref, "web");

    expect(queries[0]).toContain("OR (chapter = ?)");
    expect(queries[0]).not.toMatch(/OR \(chapter = \? AND verse <= \?\)/);
    expect(bindArgs[0]).toEqual(["web", "GEN", 1, 2, 1, 2, 2]);
    expect(bindArgs[0]).not.toContain(999);
  });

  it("omits endVerse bind when endVerse is null and a middle chapter exists", async () => {
    const ref = createMultiChapterRef({
      startChapter: 1,
      startVerse: 1,
      endChapter: 3,
      endVerse: null,
    });
    const { db, queries, bindArgs } = createGetVersesMockDb();

    await getVerses(db, ref, "web");

    expect(queries[0]).toContain("OR (chapter > ? AND chapter < ?)");
    expect(queries[0]).toContain("OR (chapter = ?)");
    expect(queries[0]).not.toMatch(/OR \(chapter = \? AND verse <= \?\)/);
    expect(bindArgs[0]).toEqual(["web", "GEN", 1, 1, 1, 3, 3]);
  });

  it("uses startVerse 1 when startVerse is null on the start chapter", async () => {
    const ref = createMultiChapterRef({
      startChapter: 1,
      startVerse: null,
      endChapter: 2,
      endVerse: 2,
    });
    const { db, bindArgs } = createGetVersesMockDb();

    await getVerses(db, ref, "web");

    expect(bindArgs[0]?.[3]).toBe(1);
  });

  /**
   * Defensive contract test: parseReference() does not yet emit multi-chapter
   * ranges with endVerse: null (only chapter:verse-chapter:verse sets endVerse).
   * getVerses() still honors ParsedReference semantics so future parser support
   * (e.g. "Genesis 1-2") works without changing the query layer.
   */
  it("honors ParsedReference contract when endVerse is null (parser does not emit this yet)", async () => {
    const ref = createMultiChapterRef({
      startChapter: 1,
      startVerse: null,
      endChapter: 2,
      endVerse: null,
    });
    const { db, queries, bindArgs } = createGetVersesMockDb();

    const result = await getVerses(db, ref, "web");

    expect(result.success).toBe(true);
    expect(queries[0]).not.toContain("999");
    expect(bindArgs[0]).toEqual(["web", "GEN", 1, 1, 1, 2, 2]);
  });
});

describe("getVerses multi-chapter results (D1)", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);

    const extraVerses = [
      ["web", "GEN", 2, 1, "Thus the heavens and the earth were finished."],
      ["web", "GEN", 2, 2, "On the seventh day God finished his work."],
      ["web", "GEN", 2, 3, "God blessed the seventh day."],
      ["web", "GEN", 3, 1, "Now the serpent was more subtle than any animal."],
      ["web", "GEN", 3, 2, "The woman said to the serpent."],
    ] as const;

    for (const [translationId, bookId, chapter, verse, text] of extraVerses) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO verses (translation_id, book_id, chapter, verse, text)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(translationId, bookId, chapter, verse, text)
        .run();
    }
  });

  it("returns verses for multi-chapter range with explicit endVerse", async () => {
    const ref = createMultiChapterRef({
      startChapter: 1,
      startVerse: 2,
      endChapter: 2,
      endVerse: 2,
    });

    const result = await getVerses(env.DB, ref, "web");

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data.map((row) => `${row.chapter}:${row.verse}`)).toEqual([
      "1:2",
      "1:3",
      "2:1",
      "2:2",
    ]);
  });

  it("returns all verses in adjacent chapters when endVerse is null", async () => {
    const ref = createMultiChapterRef({
      startChapter: 1,
      startVerse: 2,
      endChapter: 2,
      endVerse: null,
    });

    const result = await getVerses(env.DB, ref, "web");

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data.map((row) => `${row.chapter}:${row.verse}`)).toEqual([
      "1:2",
      "1:3",
      "2:1",
      "2:2",
      "2:3",
    ]);
  });

  it("includes middle chapter verses when endVerse is null", async () => {
    const ref = createMultiChapterRef({
      startChapter: 1,
      startVerse: 3,
      endChapter: 3,
      endVerse: null,
    });

    const result = await getVerses(env.DB, ref, "web");

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data.map((row) => `${row.chapter}:${row.verse}`)).toEqual([
      "1:3",
      "2:1",
      "2:2",
      "2:3",
      "3:1",
      "3:2",
    ]);
  });

  it("delegates to getVerses for a single reference", async () => {
    const john = BOOKS_BY_ID.get("JHN")!;
    const ref: ParsedReference = {
      book: john,
      startChapter: 3,
      startVerse: 16,
      endChapter: 3,
      endVerse: 16,
    };

    const result = await getVersesForMultipleReferences(env.DB, [ref], "web");

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ book_id: "JHN", chapter: 3, verse: 16 });
  });

  it("returns verses in reference order across multiple books via batched query", async () => {
    const john = BOOKS_BY_ID.get("JHN")!;
    const refs: ParsedReference[] = [
      {
        book: genesis,
        startChapter: 1,
        startVerse: 1,
        endChapter: 1,
        endVerse: 1,
      },
      {
        book: john,
        startChapter: 3,
        startVerse: 16,
        endChapter: 3,
        endVerse: 16,
      },
    ];

    const result = await getVersesForMultipleReferences(env.DB, refs, "web");

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data.map((row) => `${row.book_id}:${row.chapter}:${row.verse}`)).toEqual([
      "GEN:1:1",
      "JHN:3:16",
    ]);
  });

  it("orders whole-chapter references with intra-chapter verse order", async () => {
    const refs: ParsedReference[] = [
      {
        book: genesis,
        startChapter: 1,
        startVerse: null,
        endChapter: 1,
        endVerse: null,
      },
      {
        book: genesis,
        startChapter: 2,
        startVerse: null,
        endChapter: 2,
        endVerse: null,
      },
    ];

    const result = await getVersesForMultipleReferences(env.DB, refs, "web");

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data.map((row) => `${row.book_id}:${row.chapter}:${row.verse}`)).toEqual([
      "GEN:1:1",
      "GEN:1:2",
      "GEN:1:3",
      "GEN:2:1",
      "GEN:2:2",
      "GEN:2:3",
    ]);
  });

  it("orders three references by comma-separated position", async () => {
    const john = BOOKS_BY_ID.get("JHN")!;
    const exodus = BOOKS_BY_ID.get("EXO")!;
    const refs: ParsedReference[] = [
      {
        book: genesis,
        startChapter: 1,
        startVerse: 1,
        endChapter: 1,
        endVerse: 1,
      },
      {
        book: john,
        startChapter: 3,
        startVerse: 16,
        endChapter: 3,
        endVerse: 16,
      },
      {
        book: exodus,
        startChapter: 1,
        startVerse: 1,
        endChapter: 1,
        endVerse: 1,
      },
    ];

    const result = await getVersesForMultipleReferences(env.DB, refs, "web");

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data.map((row) => `${row.book_id}:${row.chapter}:${row.verse}`)).toEqual([
      "GEN:1:1",
      "JHN:3:16",
      "EXO:1:1",
    ]);
  });

  it("preserves chapter/verse order within each batched reference", async () => {
    const john = BOOKS_BY_ID.get("JHN")!;
    const refs: ParsedReference[] = [
      createMultiChapterRef({
        startChapter: 1,
        startVerse: 2,
        endChapter: 2,
        endVerse: 2,
      }),
      {
        book: john,
        startChapter: 3,
        startVerse: 16,
        endChapter: 3,
        endVerse: 16,
      },
    ];

    const result = await getVersesForMultipleReferences(env.DB, refs, "web");

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.data.map((row) => `${row.book_id}:${row.chapter}:${row.verse}`)).toEqual([
      "GEN:1:2",
      "GEN:1:3",
      "GEN:2:1",
      "GEN:2:2",
      "JHN:3:16",
    ]);
  });
});

describe("getVersesForMultipleReferences", () => {
  const john = BOOKS_BY_ID.get("JHN")!;

  const mockVerseRows: VerseRow[] = [
    {
      id: 1,
      translation_id: "web",
      book_id: "JHN",
      chapter: 3,
      verse: 16,
      text: "For God so loved the world...",
    },
    {
      id: 2,
      translation_id: "web",
      book_id: "GEN",
      chapter: 1,
      verse: 2,
      text: "The earth was formless and empty.",
    },
  ];

  function createGetVersesForMultipleMockDb(
    results: VerseRow[] = [],
    options?: { allError?: Error }
  ) {
    const queries: string[] = [];
    const bindArgs: unknown[][] = [];

    const db = {
      prepare: vi.fn((query: string) => {
        queries.push(normalizeQuery(query));
        return {
          bind: vi.fn((...args: unknown[]) => {
            bindArgs.push(args);
            return {
              all: vi.fn(async () => {
                if (options?.allError) {
                  throw options.allError;
                }
                return {
                  results: results.map((row, index) => ({ ...row, ref_index: index })),
                };
              }),
            };
          }),
        };
      }),
    } as unknown as D1Database;

    return { db, queries, bindArgs };
  }

  it("returns empty array without querying when refs is empty", async () => {
    const prepare = vi.fn();
    const db = { prepare } as unknown as D1Database;

    const result = await getVersesForMultipleReferences(db, [], "web");

    expect(result).toEqual({ success: true, data: [] });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("skips UNION ALL for a single reference", async () => {
    const ref: ParsedReference = {
      book: john,
      startChapter: 3,
      startVerse: 16,
      endChapter: 3,
      endVerse: 16,
    };
    const { db, queries } = createGetVersesForMultipleMockDb(mockVerseRows);

    await getVersesForMultipleReferences(db, [ref], "web");

    expect(queries).toHaveLength(1);
    expect(queries[0]).not.toContain("UNION ALL");
    expect(queries[0]).not.toContain("ref_index");
    expect(queries[0]).toContain("ORDER BY verse");
  });

  it("builds a single UNION ALL query for multiple references including multi-chapter", async () => {
    const refs: ParsedReference[] = [
      {
        book: john,
        startChapter: 3,
        startVerse: 16,
        endChapter: 3,
        endVerse: 16,
      },
      createMultiChapterRef({
        startChapter: 1,
        startVerse: 2,
        endChapter: 2,
        endVerse: 2,
      }),
      {
        book: genesis,
        startChapter: 1,
        startVerse: 1,
        endChapter: 1,
        endVerse: 1,
      },
    ];
    const { db, queries, bindArgs } = createGetVersesForMultipleMockDb(mockVerseRows);

    const result = await getVersesForMultipleReferences(db, refs, "web");

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("UNION ALL");
    expect(queries[0]).toContain("ref_index");
    expect(queries[0]).toContain("(chapter = ? AND verse <= ?)");
    expect(queries[0]).toContain("ORDER BY ref_index, chapter, verse");
    expect(bindArgs[0]).toEqual([
      0,
      "web",
      "JHN",
      3,
      16,
      16,
      1,
      "web",
      "GEN",
      1,
      2,
      1,
      2,
      2,
      2,
      2,
      "web",
      "GEN",
      1,
      1,
      1,
    ]);
    expect(result.data).toEqual(mockVerseRows);
    expect(result.data[0]).not.toHaveProperty("ref_index");
    expect(result.data[1]).not.toHaveProperty("ref_index");
  });

  it("returns database error when UNION ALL query fails", async () => {
    const refs: ParsedReference[] = [
      {
        book: john,
        startChapter: 3,
        startVerse: 16,
        endChapter: 3,
        endVerse: 16,
      },
      {
        book: genesis,
        startChapter: 1,
        startVerse: 1,
        endChapter: 1,
        endVerse: 1,
      },
    ];
    const { db } = createGetVersesForMultipleMockDb([], { allError: new Error("query failed") });

    const result = await getVersesForMultipleReferences(db, refs, "web");

    expect(result).toEqual({ success: false, error: "Database query failed" });
  });
});