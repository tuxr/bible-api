/**
 * Route-level tests for GET /v1/random
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VerseRow } from "../types.js";
import {
  createMockLimiter,
  createRouteEnv,
  sampleTranslation,
} from "./helpers/route-test-helpers.js";
import { RANDOM_RATE_LIMIT } from "../lib/rate-limit.js";

const sampleVerse: VerseRow = {
  id: 42,
  translation_id: "web",
  book_id: "GEN",
  chapter: 1,
  verse: 1,
  text: "In the beginning...",
};

const { getRandomVerse, getTranslation, getBookName } = vi.hoisted(() => ({
  getRandomVerse: vi.fn(),
  getTranslation: vi.fn(),
  getBookName: vi.fn((bookId: string) => (bookId === "GEN" ? "Genesis" : bookId)),
}));

vi.mock("../lib/db.js", () => ({
  getRandomVerse,
  getTranslation,
  getBookName,
}));

import random from "../routes/random.js";

describe("GET /v1/random route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslation.mockResolvedValue({ success: true, data: sampleTranslation });
  });

  it("returns 200 with the expected JSON on success", async () => {
    getRandomVerse.mockResolvedValue({ success: true, data: sampleVerse });

    const res = await random.request("/", {}, createRouteEnv());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      reference: "Genesis 1:1",
      translation: { id: "web", name: "World English Bible", language: "en" },
      verses: [
        {
          book: "GEN",
          book_name: "Genesis",
          chapter: 1,
          verse: 1,
          text: "In the beginning...",
        },
      ],
      text: "In the beginning...",
    });
    expect(getRandomVerse).toHaveBeenCalledWith({}, "web", {
      bookId: undefined,
      testament: undefined,
    });
  });

  it("returns 400 for unknown book filter", async () => {
    const res = await random.request("/?book=NotABook", {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Unknown book: NotABook",
    });
    expect(getRandomVerse).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid testament filter", async () => {
    const res = await random.request("/?testament=XX", {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Testament must be OT, NT, or AP",
    });
  });

  it("returns 404 when translation is not found", async () => {
    getTranslation.mockResolvedValue({ success: true, data: null });

    const res = await random.request("/?translation=missing", {}, createRouteEnv());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "Translation not found: missing",
    });
  });

  it("returns 404 when no verses match filters", async () => {
    getRandomVerse.mockResolvedValue({ success: true, data: null });

    const res = await random.request("/", {}, createRouteEnv());

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No verses found" });
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const limiter = createMockLimiter(false);
    const res = await random.request(
      "/",
      { headers: { "cf-connecting-ip": "203.0.113.1" } },
      createRouteEnv({ RANDOM_RATE_LIMITER: limiter })
    );

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Rate limit exceeded",
    });
    expect(res.headers.get("Retry-After")).toBe(String(RANDOM_RATE_LIMIT.period));
    expect(getRandomVerse).not.toHaveBeenCalled();
  });

  it("returns 503 when getRandomVerse fails", async () => {
    getRandomVerse.mockResolvedValue({ success: false, error: "Database query failed" });

    const res = await random.request("/", {}, createRouteEnv());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Database query failed",
    });
  });

  it("returns 503 when getTranslation fails", async () => {
    getTranslation.mockResolvedValue({ success: false, error: "Database query failed" });

    const res = await random.request("/", {}, createRouteEnv());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Database query failed",
    });
  });
});