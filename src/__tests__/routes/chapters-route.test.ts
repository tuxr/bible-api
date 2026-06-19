/**
 * Route-level tests for GET /v1/chapters/:book/:chapter
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VerseRow } from "../../types.js";
import { createRouteEnv, parseJson, sampleTranslation } from "../helpers/route-test-helpers.js";
import type { ChapterApiResponse } from "../../types.js";

const genesisVerses: VerseRow[] = [
  { id: 1, translation_id: "web", book_id: "GEN", chapter: 1, verse: 1, text: "Verse 1" },
  { id: 2, translation_id: "web", book_id: "GEN", chapter: 1, verse: 2, text: "Verse 2" },
];

const { getChapterVerses, getTranslation } = vi.hoisted(() => ({
  getChapterVerses: vi.fn(),
  getTranslation: vi.fn(),
}));

vi.mock("../../lib/db.js", () => ({
  getChapterVerses,
  getTranslation,
}));

import chapters from "../../routes/chapters.js";

describe("GET /v1/chapters/:book/:chapter route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslation.mockResolvedValue({ success: true, data: sampleTranslation });
  });

  it("returns 200 with chapter data and navigation", async () => {
    getChapterVerses.mockResolvedValue({ success: true, data: genesisVerses });

    const res = await chapters.request("/Genesis/1", {}, createRouteEnv());

    expect(res.status).toBe(200);
    const body = await parseJson<ChapterApiResponse>(res);
    expect(body.book).toEqual({ id: "GEN", name: "Genesis", testament: "OT" });
    expect(body.chapter).toBe(1);
    expect(body.verse_count).toBe(2);
    expect(body.navigation.previous).toBeNull();
    expect(body.navigation.next).toEqual({ book: "GEN", chapter: 2, testament: "OT" });
  });

  it("returns 400 for unknown book", async () => {
    const res = await chapters.request("/NotABook/1", {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Unknown book: NotABook",
    });
  });

  it("returns 400 for invalid chapter number", async () => {
    const res = await chapters.request("/Genesis/0", {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid chapter: 0",
    });
  });

  it("returns 400 when chapter exceeds book length", async () => {
    const res = await chapters.request("/Genesis/999", {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining("Invalid chapter"),
    });
  });

  it("returns 404 when translation is not found", async () => {
    getTranslation.mockResolvedValue({ success: true, data: null });

    const res = await chapters.request("/Genesis/1?translation=missing", {}, createRouteEnv());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "Translation not found: missing",
    });
  });

  it("returns 404 when no verses exist for chapter", async () => {
    getChapterVerses.mockResolvedValue({ success: true, data: [] });

    const res = await chapters.request("/Genesis/1", {}, createRouteEnv());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "No verses found for Genesis 1",
    });
  });

  it("returns 503 when getChapterVerses fails", async () => {
    getChapterVerses.mockResolvedValue({ success: false, error: "Database query failed" });

    const res = await chapters.request("/Genesis/1", {}, createRouteEnv());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Database query failed",
    });
  });
});