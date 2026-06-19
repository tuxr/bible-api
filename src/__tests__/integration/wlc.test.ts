/**
 * WLC (Hebrew) integration tests — search and OT-only boundaries.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase } from "../helpers/test-db.js";
import { parseJson } from "../helpers/route-test-helpers.js";
import type { SearchApiResponse, VersesApiResponse } from "../../types.js";

describe("WLC integration (SELF.fetch)", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  describe("GET /v1/verses (OT-only boundary)", () => {
    it("returns Genesis 1:1 in pointed Hebrew", async () => {
      const res = await SELF.fetch(
        "http://localhost/v1/verses/Genesis%201:1?translation=wlc"
      );
      expect(res.status).toBe(200);

      const body = await parseJson<VersesApiResponse>(res);
      expect(body.translation).toEqual({
        id: "wlc",
        name: "Westminster Leningrad Codex",
      });
      expect(body.text.length).toBeGreaterThan(10);
      expect(body.verses[0]?.book).toBe("GEN");
    });

    it("returns 404 for New Testament book (John 3:16)", async () => {
      const res = await SELF.fetch(
        "http://localhost/v1/verses/John%203:16?translation=wlc"
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        error: expect.stringContaining("No verses found"),
      });
    });
  });

  describe("GET /v1/chapters (OT-only boundary)", () => {
    it("returns Genesis 1 for WLC", async () => {
      const res = await SELF.fetch(
        "http://localhost/v1/chapters/Genesis/1?translation=wlc"
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        book: { id: "GEN", testament: "OT" },
        chapter: 1,
        translation: { id: "wlc" },
      });
    });

    it("returns 404 for New Testament chapter", async () => {
      const res = await SELF.fetch(
        "http://localhost/v1/chapters/John/3?translation=wlc"
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /v1/search (Hebrew FTS)", () => {
    it("finds verses with unpointed Hebrew query", async () => {
      const res = await SELF.fetch(
        "http://localhost/v1/search?q=%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA&translation=wlc"
      );
      expect(res.status).toBe(200);

      const body = await parseJson<SearchApiResponse>(res);
      expect(body.translation).toBe("wlc");
      expect(body.total).toBeGreaterThanOrEqual(1);
      expect(body.results[0]).toMatchObject({
        book: "GEN",
        chapter: 1,
        verse: 1,
      });
      expect(body.results[0]?.text.length).toBeGreaterThan(10);
    });

    it("returns zero results for NT testament filter", async () => {
      const res = await SELF.fetch(
        "http://localhost/v1/search?q=%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA&translation=wlc&testament=NT"
      );
      expect(res.status).toBe(200);

      const body = await parseJson<SearchApiResponse>(res);
      expect(body.total).toBe(0);
      expect(body.results).toHaveLength(0);
    });
  });
});