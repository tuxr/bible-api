/**
 * The keyed search index (src/lib/search-index.ts): triggers keep verses_search in step with
 * verses, and verses the key can't encode are rejected rather than indexed under a wrong rowid.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setupTestDatabase } from "../helpers/test-db.js";
import { searchVerses } from "../../lib/db.js";
import { ALL_BOOKS } from "../../lib/books-data.js";
import { KEY_BOOK, KEY_TRANSLATION, SEARCH_IDS } from "../../lib/search-index.js";

async function search(q: string, translation = "web", options?: Parameters<typeof searchVerses>[3]) {
  const result = await searchVerses(env.DB, q, translation, options);
  if (!result.success) throw new Error(result.error);
  return result.data;
}

const insertVerse = (translation: string, book: string, chapter: number, verse: number, text: string) =>
  env.DB.prepare(
    `INSERT INTO verses (translation_id, book_id, chapter, verse, text, text_plain) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(translation, book, chapter, verse, text, text)
    .run();

beforeAll(async () => {
  await setupTestDatabase(env.DB);
});

describe("verses_search triggers", () => {
  it("indexes an inserted verse under its canonical key", async () => {
    await insertVerse("web", "GEN", 50, 26, "keyedinsert");
    const { n } = (await env.DB.prepare(
      "SELECT rowid AS n FROM verses_search WHERE verses_search MATCH 'keyedinsert'"
    ).first<{ n: number }>())!;
    expect(n).toBe(SEARCH_IDS.web! * KEY_TRANSLATION + 1 * KEY_BOOK + 50_026);
    expect((await search("keyedinsert")).results.map((v) => [v.book_id, v.chapter, v.verse])).toEqual([["GEN", 50, 26]]);
  });

  it("re-indexes a text change and drops a deleted verse", async () => {
    await insertVerse("web", "EXO", 40, 38, "keyedbefore");
    await env.DB.prepare(
      "UPDATE verses SET text_plain = 'keyedafter' WHERE translation_id = 'web' AND book_id = 'EXO' AND chapter = 40 AND verse = 38"
    ).run();
    expect((await search("keyedbefore")).total).toBe(0);
    expect((await search("keyedafter")).total).toBe(1);

    await env.DB.prepare("DELETE FROM verses WHERE translation_id = 'web' AND book_id = 'EXO' AND chapter = 40 AND verse = 38").run();
    expect((await search("keyedafter")).total).toBe(0);
  });

  it("returns matches in canonical order with the filters as ranges", async () => {
    await insertVerse("web", "JHN", 21, 25, "keyedorder");
    await insertVerse("web", "GEN", 1, 31, "keyedorder");
    await insertVerse("web", "EXO", 3, 14, "keyedorder");
    await insertVerse("wlc", "GEN", 1, 31, "keyedorder");

    const order = (data: Awaited<ReturnType<typeof search>>) => data.results.map((v) => v.book_id);
    expect(order(await search("keyedorder"))).toEqual(["GEN", "EXO", "JHN"]);
    expect(order(await search("keyedorder", "web", { testament: "OT" }))).toEqual(["GEN", "EXO"]);
    expect(order(await search("keyedorder", "web", { bookId: "JHN" }))).toEqual(["JHN"]);
    expect(await search("keyedorder", "web", { bookId: "JHN", testament: "OT" })).toEqual({ results: [], total: 0, totalCapped: false });
    expect((await search("keyedorder", "wlc")).total).toBe(1);
    expect(order(await search("keyedorder", "web", { offset: 1, limit: 1 }))).toEqual(["EXO"]);
  });
});

describe("verses_search guards", () => {
  it("rejects a verse whose translation has no search_id", async () => {
    await env.DB.prepare("INSERT INTO translations (id, name, language) VALUES ('unkeyed', 'Unkeyed', 'en')").run();
    await expect(insertVerse("unkeyed", "GEN", 1, 1, "x")).rejects.toThrow(/search_id/);
  });

  it("rejects a chapter or verse the key can't hold", async () => {
    await expect(insertVerse("web", "GEN", 1000, 1, "x")).rejects.toThrow(/0-999/);
  });

  it("refuses to change a book's order or a translation's search_id", async () => {
    await expect(env.DB.prepare("UPDATE books SET book_order = 50 WHERE id = 'GEN'").run()).rejects.toThrow(/rebuild/);
    await expect(env.DB.prepare("UPDATE translations SET search_id = 9 WHERE id = 'web'").run()).rejects.toThrow(/renumber/);
  });
});

describe("key layout", () => {
  it("fits every book and gives each translation its own range", () => {
    expect(Math.max(...ALL_BOOKS.map((b) => b.order))).toBeLessThanOrEqual(99);
    const ids = Object.values(SEARCH_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.max(...ids) * KEY_TRANSLATION + 99 * KEY_BOOK + 999_999).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it("keeps each testament's books contiguous, so a testament is one range", () => {
    const testaments = ALL_BOOKS.map((b) => b.testament);
    for (const t of new Set(testaments)) {
      const orders = ALL_BOOKS.filter((b) => b.testament === t).map((b) => b.order).sort((a, b) => a - b);
      expect(orders.at(-1)! - orders[0]! + 1).toBe(orders.length);
    }
  });
});
