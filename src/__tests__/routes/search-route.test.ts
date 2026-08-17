/**
 * Route-level tests for GET /v1/search
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VerseRow } from "../../types.js";
import { createMockLimiter, createRouteEnv, sampleTranslation } from "../helpers/route-test-helpers.js";
import { SEARCH_RATE_LIMIT } from "../../lib/rate-limit.js";

const sampleResult: VerseRow = {
  id: 4,
  translation_id: "web",
  book_id: "JHN",
  chapter: 3,
  verse: 16,
  text: "For God so loved the world...",
};

const { searchVerses, getTranslation, getBookName } = vi.hoisted(() => ({
  searchVerses: vi.fn(),
  getTranslation: vi.fn(),
  getBookName: vi.fn((bookId: string) => (bookId === "JHN" ? "John" : bookId)),
}));

vi.mock("../../lib/db.js", () => ({
  searchVerses,
  getTranslation,
  getBookName,
}));

import search from "../../routes/search.js";

describe("GET /v1/search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslation.mockResolvedValue({ success: true, data: sampleTranslation });
    searchVerses.mockResolvedValue({
      success: true,
      data: { results: [sampleResult], total: 1 },
    });
  });

  it("returns 200 with search results on success", async () => {
    const res = await search.request("/?q=loved", {}, createRouteEnv());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      query: "loved",
      translation: "web",
      total: 1,
      results: [
        {
          book: "JHN",
          book_name: "John",
          chapter: 3,
          verse: 16,
          text: "For God so loved the world...",
          reference: "John 3:16",
        },
      ],
    });
  });

  it("returns 400 when q is missing", async () => {
    const res = await search.request("/", {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Missing required parameter: q",
    });
  });

  it("returns 400 when query is too long", async () => {
    const res = await search.request(`/?q=${"a".repeat(501)}`, {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Query too long (max 500 characters)",
    });
  });

  it("returns 404 when translation is not found", async () => {
    getTranslation.mockResolvedValue({ success: true, data: null });

    const res = await search.request("/?q=loved&translation=missing", {}, createRouteEnv());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "Translation not found: missing",
    });
    expect(searchVerses).not.toHaveBeenCalled();
  });

  it("returns 400 for unknown book filter", async () => {
    const res = await search.request("/?q=God&book=NotABook", {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Unknown book: NotABook",
    });
  });

  it("returns 400 for invalid testament filter", async () => {
    const res = await search.request("/?q=God&testament=XX", {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Testament must be OT, NT, or AP",
    });
  });

  it("returns 400 for a limit with trailing non-numeric characters", async () => {
    const res = await search.request("/?q=loved&limit=3foo", {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid limit: 3foo",
    });
    expect(searchVerses).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-numeric search limit", async () => {
    const res = await search.request("/?q=loved&limit=abc", {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid limit: abc",
    });
    expect(searchVerses).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const limiter = createMockLimiter(false);
    const res = await search.request(
      "/?q=loved",
      { headers: { "cf-connecting-ip": "203.0.113.1" } },
      createRouteEnv({ SEARCH_RATE_LIMITER: limiter })
    );

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Rate limit exceeded",
    });
    expect(res.headers.get("Retry-After")).toBe(String(SEARCH_RATE_LIMIT.period));
    expect(searchVerses).not.toHaveBeenCalled();
  });

  it("returns 503 when searchVerses fails", async () => {
    searchVerses.mockResolvedValue({ success: false, error: "Search query failed" });

    const res = await search.request("/?q=loved", {}, createRouteEnv());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Search query failed",
    });
  });

  it("returns 503 when getTranslation fails", async () => {
    getTranslation.mockResolvedValue({ success: false, error: "Database query failed" });

    const res = await search.request("/?q=loved", {}, createRouteEnv());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Database query failed",
    });
    expect(searchVerses).not.toHaveBeenCalled();
  });
});