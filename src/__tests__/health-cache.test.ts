/**
 * /v1/health must not count every verse on each call: COUNT(*) over verses reads
 * ~105k billed rows, and the endpoint is unauthenticated and not rate limited.
 */

import { describe, it, expect } from "vitest";
import app from "../index.js";
import { createRouteEnv, parseJson } from "./helpers/route-test-helpers.js";

function countingDb(counts: Record<string, number>) {
  const queries: string[] = [];
  const db = {
    prepare(sql: string) {
      queries.push(sql);
      const table = sql.includes("FROM verses") ? "verses" : "translations";
      return { first: async () => ({ count: counts[table] }) };
    },
  } as unknown as D1Database;
  return { db, queries };
}

describe("GET /v1/health verse count", () => {
  it("queries the database on every call but counts verses only once per isolate", async () => {
    const { db, queries } = countingDb({ translations: 4, verses: 105488 });
    const env = createRouteEnv({ DB: db });

    for (let i = 0; i < 3; i++) {
      const res = await app.request("/v1/health", {}, env);
      expect(res.status).toBe(200);
      expect(await parseJson(res)).toEqual({ status: "ok", translations: 4, verses: 105488 });
    }

    expect(queries.filter((sql) => sql.includes("FROM translations"))).toHaveLength(3);
    expect(queries.filter((sql) => sql.includes("FROM verses"))).toHaveLength(1);
  });

  it("still reports degraded when the database fails, even with a cached count", async () => {
    const db = {
      prepare() {
        return { first: async () => { throw new Error("D1_ERROR: limit exceeded"); } };
      },
    } as unknown as D1Database;

    const res = await app.request("/v1/health", {}, createRouteEnv({ DB: db }));
    expect(res.status).toBe(503);
    expect(await parseJson(res)).toMatchObject({ status: "degraded", error: "Database unavailable" });
  });
});
