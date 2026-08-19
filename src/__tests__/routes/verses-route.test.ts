/**
 * Route-level tests for GET /v1/verses/:reference
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VerseRow } from "../../types.js";
import { parseMultipleReferences } from "../../lib/parser.js";
import { createRouteEnv, sampleTranslation } from "../helpers/route-test-helpers.js";

const sampleVerse: VerseRow = {
  id: 4,
  translation_id: "web",
  book_id: "JHN",
  chapter: 3,
  verse: 16,
  text: "For God so loved the world...",
};

const { getVerses, getVersesForMultipleReferences, getTranslation, getBookName } = vi.hoisted(() => ({
  getVerses: vi.fn(),
  getVersesForMultipleReferences: vi.fn(),
  getTranslation: vi.fn(),
  getBookName: vi.fn((bookId: string) => {
    if (bookId === "JHN") return "John";
    if (bookId === "ROM") return "Romans";
    return bookId;
  }),
}));

vi.mock("../../lib/db.js", () => ({
  getVerses,
  getVersesForMultipleReferences,
  getTranslation,
  getBookName,
}));

import verses from "../../routes/verses.js";

describe("GET /v1/verses/:reference route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslation.mockResolvedValue({ success: true, data: sampleTranslation });
  });

  it("returns 200 with verse data on success", async () => {
    getVerses.mockResolvedValue({ success: true, data: [sampleVerse] });

    const res = await verses.request("/John%203:16", {}, createRouteEnv());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      reference: "John 3:16",
      translation: { id: "web", name: "World English Bible", language: "en" },
      verses: [
        {
          book: "JHN",
          book_name: "John",
          chapter: 3,
          verse: 16,
          text: "For God so loved the world...",
        },
      ],
      text: "For God so loved the world...",
    });
  });

  it("returns 400 for invalid reference", async () => {
    const res = await verses.request("/not-a-reference", {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
    expect(getVerses).not.toHaveBeenCalled();
  });

  it("returns 404 when translation is not found", async () => {
    getTranslation.mockResolvedValue({ success: true, data: null });

    const res = await verses.request("/John%203:16?translation=missing", {}, createRouteEnv());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "Translation not found: missing",
    });
  });

  it.each([
    ["web", "World English Bible", "en"],
    ["kjv", "King James Version", "en"],
    ["wlc", "Westminster Leningrad Codex", "he"],
    ["tcgnt", "Text-Critical Greek New Testament", "grc"],
  ])("includes %s translation language", async (id, name, language) => {
    getTranslation.mockResolvedValue({
      success: true,
      data: { ...sampleTranslation, id, name, language },
    });
    getVerses.mockResolvedValue({ success: true, data: [sampleVerse] });

    const res = await verses.request(`/John%203:16?translation=${id}`, {}, createRouteEnv());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      translation: { id, name, language },
    });
  });

  it("returns 404 when no verses match", async () => {
    getVerses.mockResolvedValue({ success: true, data: [] });

    const res = await verses.request("/John%203:99", {}, createRouteEnv());

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining("No verses found"),
    });
  });

  it("returns 503 when getTranslation fails", async () => {
    getTranslation.mockResolvedValue({ success: false, error: "Database query failed" });

    const res = await verses.request("/John%203:16", {}, createRouteEnv());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Database query failed",
    });
  });

  it("returns 503 when getVerses fails", async () => {
    getVerses.mockResolvedValue({ success: false, error: "Database query failed" });

    const res = await verses.request("/John%203:16", {}, createRouteEnv());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Database query failed",
    });
  });

  it("returns 200 for comma-separated references via batched query", async () => {
    const romansVerse: VerseRow = {
      id: 5,
      translation_id: "web",
      book_id: "ROM",
      chapter: 8,
      verse: 28,
      text: "We know that all things work together for good.",
    };
    getVersesForMultipleReferences.mockResolvedValue({
      success: true,
      data: [sampleVerse, romansVerse],
    });

    const res = await verses.request("/John%203:16,%20Romans%208:28", {}, createRouteEnv());

    expect(res.status).toBe(200);
    expect(getVersesForMultipleReferences).toHaveBeenCalledTimes(1);
    const parsed = parseMultipleReferences("John 3:16, Romans 8:28");
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error(parsed.error);
    expect(getVersesForMultipleReferences).toHaveBeenCalledWith(
      expect.anything(),
      parsed.references,
      "web"
    );
    expect(getVerses).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      reference: "John 3:16, Romans 8:28",
      translation: { id: "web", name: "World English Bible", language: "en" },
      verses: [
        {
          book: "JHN",
          book_name: "John",
          chapter: 3,
          verse: 16,
          text: "For God so loved the world...",
        },
        {
          book: "ROM",
          book_name: "Romans",
          chapter: 8,
          verse: 28,
          text: "We know that all things work together for good.",
        },
      ],
      text: "For God so loved the world... We know that all things work together for good.",
    });
  });

  it("returns 200 with only matched verses when one reference has no results", async () => {
    getVersesForMultipleReferences.mockResolvedValue({ success: true, data: [sampleVerse] });

    const res = await verses.request("/John%203:16,%20Romans%208:99", {}, createRouteEnv());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      reference: "John 3:16, Romans 8:99",
      verses: [
        {
          book: "JHN",
          book_name: "John",
          chapter: 3,
          verse: 16,
          text: "For God so loved the world...",
        },
      ],
      text: "For God so loved the world...",
    });
  });

  it("returns 400 for invalid comma-separated reference", async () => {
    const res = await verses.request("/John%203:16,%20not-valid", {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
    expect(getVersesForMultipleReferences).not.toHaveBeenCalled();
  });

  it("returns 404 when batched query returns no verses", async () => {
    getVersesForMultipleReferences.mockResolvedValue({ success: true, data: [] });

    const res = await verses.request("/John%203:16,%20Romans%208:28", {}, createRouteEnv());

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining("No verses found"),
    });
  });

  it("returns 503 when getVersesForMultipleReferences fails", async () => {
    getVersesForMultipleReferences.mockResolvedValue({
      success: false,
      error: "Database query failed",
    });

    const res = await verses.request("/John%203:16,%20Romans%208:28", {}, createRouteEnv());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Database query failed",
    });
  });

  it("adds segments only for valid opt-in flags, including comma-separated references", async () => {
    const marked = { ...sampleVerse, segments: '[{"text":"For God so loved the world...","speaker":"jesus"}]' };
    getVerses.mockResolvedValue({ success: true, data: [marked] });
    const single = await verses.request("/John%203:16?segments=yes", {}, createRouteEnv());
    const singleBody = await single.json() as { verses: Array<{ segments: Array<{ text: string }> }> };
    expect(singleBody.verses[0]!.segments.map((segment) => segment.text).join("")).toBe(marked.text);

    getVersesForMultipleReferences.mockResolvedValue({ success: true, data: [marked] });
    const multiple = await verses.request("/John%203:16,%20Romans%208:28?segments=1", {}, createRouteEnv());
    const multipleBody = await multiple.json() as { verses: unknown[] };
    expect(multipleBody.verses[0]).toHaveProperty("segments");

    getTranslation.mockClear();
    const invalid = await verses.request("/John%203:16?segments=false", {}, createRouteEnv());
    expect(invalid.status).toBe(400);
    expect(getTranslation).not.toHaveBeenCalled();
  });

  it("omits malformed stored segments", async () => {
    getVerses.mockResolvedValue({ success: true, data: [{ ...sampleVerse, segments: "not-json" }] });
    const res = await verses.request("/John%203:16?segments=1", {}, createRouteEnv());
    const body = await res.json() as { verses: unknown[] };
    expect(body.verses[0]).not.toHaveProperty("segments");
  });

  it("omits segments for unmarked verses even when opted in", async () => {
    getVerses.mockResolvedValue({ success: true, data: [sampleVerse] });

    const res = await verses.request("/John%203:16?segments=1", {}, createRouteEnv());
    const body = await res.json() as { verses: Array<Record<string, unknown>> };

    expect(body.verses[0]).not.toHaveProperty("segments");
  });
});