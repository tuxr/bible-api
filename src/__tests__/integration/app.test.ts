/**
 * HTTP integration tests via SELF.fetch() with real D1 database.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { env, SELF } from "cloudflare:test";
import app from "../../index.js";
import { setupTestDatabase } from "../helpers/test-db.js";
import { parseJson } from "../helpers/route-test-helpers.js";
import type {
  BookApiResponse,
  ChapterApiResponse,
  SearchApiResponse,
  VersesApiResponse,
} from "../../types.js";

// Test-only route to exercise the global onError handler (not deployed; tests are not bundled).
app.get("/v1/__test__/throw", () => {
  throw new Error("intentional test error");
});

describe("API integration (SELF.fetch)", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  describe("GET /", () => {
    it("returns API info JSON", async () => {
      const res = await SELF.fetch("http://localhost/");
      expect(res.status).toBe(200);

      const body = await parseJson<Record<string, unknown>>(res);
      expect(body).toMatchObject({
        name: "Bible API",
        version: "1.0.0",
        endpoints: {
          verses: "/v1/verses/:reference",
          chapters: "/v1/chapters/:book/:chapter",
          search: "/v1/search?q=:query",
          books: "/v1/books",
          translations: "/v1/translations",
          random: "/v1/random",
          health: "/v1/health",
        },
      });
    });
  });

  describe("GET /v1/health", () => {
    it("returns ok status with counts when DB is seeded", async () => {
      const res = await SELF.fetch("http://localhost/v1/health");
      expect(res.status).toBe(200);

      const body = await parseJson<{ status: string; translations: number; verses: number }>(res);
      expect(body).toEqual({
        status: "ok",
        translations: 1,
        verses: 5,
      });
    });
  });

  describe("GET /v1/verses/:reference", () => {
    it("returns John 3:16 from seeded data", async () => {
      const res = await SELF.fetch("http://localhost/v1/verses/John%203:16");
      expect(res.status).toBe(200);

      const body = await parseJson<VersesApiResponse>(res);
      expect(body.reference).toBe("John 3:16");
      expect(body.translation).toEqual({ id: "web", name: "World English Bible" });
      expect(body.verses).toHaveLength(1);
      expect(body.verses[0]).toMatchObject({
        book: "JHN",
        book_name: "John",
        chapter: 3,
        verse: 16,
      });
      expect(body.text).toContain("God so loved");
    });

    it("returns 400 for invalid reference", async () => {
      const res = await SELF.fetch("http://localhost/v1/verses/not-a-reference");
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: expect.any(String) });
    });

    it("returns 404 for unknown translation", async () => {
      const res = await SELF.fetch("http://localhost/v1/verses/John%203:16?translation=missing");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: "Translation not found: missing",
      });
    });

    it("returns 404 when verses are not found", async () => {
      const res = await SELF.fetch("http://localhost/v1/verses/John%203:99");
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: expect.stringContaining("No verses found") });
    });

    it("returns comma-separated references in order from seeded data", async () => {
      const res = await SELF.fetch("http://localhost/v1/verses/Genesis%201:1,%20John%203:16");
      expect(res.status).toBe(200);

      const body = await parseJson<VersesApiResponse>(res);
      expect(body.reference).toBe("Genesis 1:1, John 3:16");
      expect(body.verses).toHaveLength(2);
      expect(body.verses[0]).toMatchObject({ book: "GEN", chapter: 1, verse: 1 });
      expect(body.verses[1]).toMatchObject({ book: "JHN", chapter: 3, verse: 16 });
      expect(body.text).toContain("In the beginning");
      expect(body.text).toContain("God so loved");
    });
  });

  describe("GET /v1/chapters/:book/:chapter", () => {
    it("returns Genesis 1 with verses and navigation", async () => {
      const res = await SELF.fetch("http://localhost/v1/chapters/Genesis/1");
      expect(res.status).toBe(200);

      const body = await parseJson<ChapterApiResponse>(res);
      expect(body.book).toEqual({ id: "GEN", name: "Genesis", testament: "OT" });
      expect(body.chapter).toBe(1);
      expect(body.verse_count).toBe(3);
      expect(body.verses).toHaveLength(3);
      expect(body.navigation.previous).toBeNull();
      expect(body.navigation.next).toEqual({ book: "GEN", chapter: 2, testament: "OT" });
    });

    it("returns 400 for unknown book", async () => {
      const res = await SELF.fetch("http://localhost/v1/chapters/NotABook/1");
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Unknown book: NotABook",
      });
    });

    it("returns 400 for invalid chapter", async () => {
      const res = await SELF.fetch("http://localhost/v1/chapters/Genesis/999");
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        error: expect.stringContaining("Invalid chapter"),
      });
    });

    it("returns 404 for unknown translation", async () => {
      const res = await SELF.fetch("http://localhost/v1/chapters/Genesis/1?translation=missing");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: "Translation not found: missing",
      });
    });
  });

  describe("GET /v1/search", () => {
    it("returns search results for seeded verses", async () => {
      const res = await SELF.fetch("http://localhost/v1/search?q=loved");
      expect(res.status).toBe(200);

      const body = await parseJson<SearchApiResponse>(res);
      expect(body.query).toBe("loved");
      expect(body.translation).toBe("web");
      expect(body.total).toBeGreaterThanOrEqual(1);
      expect(body.results.length).toBeGreaterThanOrEqual(1);
      expect(body.results[0]).toMatchObject({
        book: "JHN",
        book_name: "John",
        chapter: 3,
        verse: 16,
        reference: "John 3:16",
      });
    });

    it("returns 400 when q is missing", async () => {
      const res = await SELF.fetch("http://localhost/v1/search");
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Missing required parameter: q",
      });
    });

    it("returns 400 for unknown book filter", async () => {
      const res = await SELF.fetch("http://localhost/v1/search?q=God&book=NotABook");
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Unknown book: NotABook",
      });
    });

    it("returns 400 for invalid testament filter", async () => {
      const res = await SELF.fetch("http://localhost/v1/search?q=God&testament=XX");
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Testament must be OT, NT, or AP",
      });
    });
  });

  describe("GET /v1/books", () => {
    it("returns all books", async () => {
      const res = await SELF.fetch("http://localhost/v1/books");
      expect(res.status).toBe(200);

      const body = await parseJson<BookApiResponse[]>(res);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(60);
      expect(body[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        testament: expect.stringMatching(/^(OT|NT|AP)$/),
        chapters: expect.any(Number),
        aliases: expect.any(Array),
      });
    });

    it("returns 400 for invalid testament filter", async () => {
      const res = await SELF.fetch("http://localhost/v1/books?testament=invalid");
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Testament must be OT, NT, or AP",
      });
    });
  });

  describe("GET /v1/translations", () => {
    it("returns translations from DB", async () => {
      const res = await SELF.fetch("http://localhost/v1/translations");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual([
        {
          id: "web",
          name: "World English Bible",
          language: "en",
          license: "Public Domain",
          description: "Test translation for integration tests",
        },
      ]);
    });
  });

  describe("GET /v1/random", () => {
    it("returns a random verse from seeded data", async () => {
      const res = await SELF.fetch("http://localhost/v1/random");
      expect(res.status).toBe(200);

      const body = await parseJson<VersesApiResponse>(res);
      expect(body.translation).toEqual({ id: "web", name: "World English Bible" });
      expect(body.verses).toHaveLength(1);
      expect(body.text).toBeTruthy();
      expect(body.reference).toMatch(/^(Genesis|Exodus|John) \d+:\d+$/);
    });

    it("returns 400 for unknown book filter", async () => {
      const res = await SELF.fetch("http://localhost/v1/random?book=NotABook");
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Unknown book: NotABook",
      });
    });

    it("returns 404 for unknown translation", async () => {
      const res = await SELF.fetch("http://localhost/v1/random?translation=missing");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: "Translation not found: missing",
      });
    });
  });

  describe("404 handler", () => {
    it("returns 404 with hint for unknown routes", async () => {
      const res = await SELF.fetch("http://localhost/v1/nonexistent");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: "Not found",
        hint: "See https://tuxr.github.io/bible-api for documentation",
      });
    });
  });

  describe("onError handler", () => {
    it("returns 500 with error JSON and no body status field", async () => {
      const res = await SELF.fetch("http://localhost/v1/__test__/throw");
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Internal server error" });
    });
  });
});