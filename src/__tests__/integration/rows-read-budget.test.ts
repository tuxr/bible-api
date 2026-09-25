/**
 * Row-read budgets for the hot request paths.
 *
 * D1 bills per row read, and on 2026-09-24 reads exhausted the free plan's daily limit.
 * A request should read about as many rows as it returns: an index lookup, never a scan.
 * The fixture is padded with ~5,000 filler verses and lexicon entries, so a query that
 * starts scanning (a dropped index, a new full-table COUNT) blows its budget here.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import app from "../../index.js";
import { setupTestDatabase } from "../helpers/test-db.js";
import { createRouteEnv, parseJson } from "../helpers/route-test-helpers.js";
import { SEARCH_RESULT_WINDOW } from "../../lib/db.js";
import type { ChapterApiResponse, SearchApiResponse } from "../../types.js";

const FILLER_ROWS = 5000;
// The web app's ceiling for any single request.
const MAX_ROWS_PER_REQUEST = 5000;
// Index bookkeeping and the translation lookup cost a few rows beyond what is returned.
const SLACK = 5;

/** Wrap a D1 binding so every statement adds its `meta.rows_read` to a running total. */
function meteredDb(db: D1Database) {
  const meter = { rowsRead: 0, statements: [] as { sql: string; rowsRead: number }[] };
  const record = (sql: string, rowsRead = 0) => {
    meter.rowsRead += rowsRead;
    meter.statements.push({ sql, rowsRead });
  };
  const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, prop) {
        if (prop === "bind") return (...values: unknown[]) => wrap(target.bind(...values), sql);
        if (prop === "all" || prop === "run") {
          return async () => {
            const result = await target[prop]();
            record(sql, result.meta.rows_read);
            return result;
          };
        }
        if (prop === "first") {
          // first() returns no meta: run the statement through all() to meter it.
          return async (column?: string) => {
            const result = await target.all<Record<string, unknown>>();
            record(sql, result.meta.rows_read);
            const row = result.results[0];
            return row === undefined ? null : column ? row[column] : row;
          };
        }
        return Reflect.get(target, prop);
      },
    });
  const metered = new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") return (sql: string) => wrap(target.prepare(sql), sql);
      return Reflect.get(target, prop);
    },
  });
  return { db: metered, meter };
}

async function measure(path: string) {
  const { db, meter } = meteredDb(env.DB);
  const res = await app.request(path, {}, createRouteEnv({ DB: db }));
  return { res, rowsRead: meter.rowsRead, statements: meter.statements };
}

beforeAll(async () => {
  await setupTestDatabase(env.DB);
  // Filler in chapters no test requests, so only a scan would touch it.
  await env.DB.prepare(
    `WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < ${FILLER_ROWS - 1})
     INSERT INTO verses (translation_id, book_id, chapter, verse, text, text_plain, words)
     SELECT CASE i % 2 WHEN 0 THEN 'web' ELSE 'tcgnt' END, 'JHN', 100 + i / 60, i % 60 + 1,
            'filler', 'filler', '[{"surface":"filler","strong":"G1"}]'
     FROM n`
  ).run();
  await env.DB.prepare(
    `WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < ${FILLER_ROWS - 1})
     INSERT INTO lexicon (id, language, entry) SELECT 'X' || i, 'grc', '{}' FROM n`
  ).run();
});

describe("rows read per request", () => {
  it("detects a scan (control: the meter and the filler work)", async () => {
    const { db, meter } = meteredDb(env.DB);
    await db.prepare("SELECT COUNT(*) AS n FROM verses").first();
    expect(meter.rowsRead).toBeGreaterThan(FILLER_ROWS);
  });

  it("GET /v1/chapters/John/3 (web) reads about the verses it returns", async () => {
    const { res, rowsRead } = await measure("/v1/chapters/John/3?translation=web");
    expect(res.status).toBe(200);
    const body = await parseJson<ChapterApiResponse>(res);
    expect(rowsRead).toBeLessThanOrEqual(body.verses.length + SLACK);
    expect(rowsRead).toBeLessThanOrEqual(MAX_ROWS_PER_REQUEST);
  });

  it("GET /v1/chapters/John/3?translation=tcgnt&segments=1&words=1 reads about the verses and lexicon entries it returns", async () => {
    const { res, rowsRead } = await measure("/v1/chapters/John/3?translation=tcgnt&segments=1&words=1");
    expect(res.status).toBe(200);
    const body = await parseJson<ChapterApiResponse>(res);
    const lexiconIds = new Set(body.verses.flatMap((v) => v.words ?? []).map((w) => w.strong).filter(Boolean));
    expect(lexiconIds.size).toBeGreaterThan(0);
    // The id-list lookup reads ~3 rows per id (json_each + primary-key probe); production
    // measured 981 rows for Luke 9's 327 ids.
    expect(rowsRead).toBeLessThanOrEqual(body.verses.length + 3 * lexiconIds.size + SLACK);
    expect(rowsRead).toBeLessThanOrEqual(MAX_ROWS_PER_REQUEST);
  });

  it("GET /v1/health counts verses at most once per isolate", async () => {
    await measure("/v1/health");
    const { res, rowsRead } = await measure("/v1/health");
    expect(res.status).toBe(200);
    expect(rowsRead).toBeLessThanOrEqual(SLACK);
  });

  describe("GET /v1/search reads the matches in scope, up to the window, and the page", () => {
    /**
     * The count reads one FTS row per match in scope (at most window + 1); the page reads the
     * offset's rows and then each result's FTS row, book and verse. The filler alternates web and
     * tcgnt, so a query reading another translation's matches, or sorting every match, blows it.
     */
    function searchBudget(body: SearchApiResponse, offset: number) {
      const counted = body.total_capped ? SEARCH_RESULT_WINDOW + 1 : body.total;
      return counted + offset + 3 * body.results.length + SEARCH_SLACK;
    }
    // The translation lookup, and each statement's translation, book and testament bounds.
    const SEARCH_SLACK = 30;

    it.each([
      ["a rare word", "q=loved&translation=web", 0],
      ["a common word (capped total)", "q=filler&translation=web", 0],
      ["the last page of the window", "q=filler&translation=web&offset=980&limit=20", 980],
      ["book and testament filters", "q=filler&translation=web&book=JHN&testament=NT&limit=100", 0],
      ["a testament with no matches", "q=filler&translation=web&testament=OT", 0],
    ])("%s", async (_name, query, offset) => {
      const { res, rowsRead } = await measure(`/v1/search?${query}`);
      expect(res.status).toBe(200);
      const body = await parseJson<SearchApiResponse>(res);
      expect(rowsRead).toBeLessThanOrEqual(searchBudget(body, offset));
      expect(rowsRead).toBeLessThanOrEqual(MAX_ROWS_PER_REQUEST);
    });

    it("caps the total of a common word", async () => {
      const { res } = await measure("/v1/search?q=filler&translation=web");
      expect(await parseJson<SearchApiResponse>(res)).toMatchObject({
        total: SEARCH_RESULT_WINDOW,
        total_capped: true,
      });
    });
  });

  it("GET /v1/search past the result window is rejected before searching", async () => {
    const { res, rowsRead } = await measure("/v1/search?q=filler&translation=web&offset=990&limit=20");
    expect(res.status).toBe(400);
    expect(rowsRead).toBeLessThanOrEqual(SLACK);
  });
});
