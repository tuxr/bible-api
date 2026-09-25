/**
 * Route-level tests for GET /v1/translations
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRouteEnv } from "../helpers/route-test-helpers.js";

const { getTranslations } = vi.hoisted(() => ({
  getTranslations: vi.fn(),
}));

vi.mock("../../lib/db.js", () => ({
  getTranslations,
}));

import translations from "../../routes/translations.js";

describe("GET /v1/translations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns translations from DB", async () => {
    getTranslations.mockResolvedValue({
      success: true,
      data: [
        {
          id: "web",
          name: "World English Bible",
          language: "en",
          license: "Public Domain",
          description: "Test translation",
        },
      ],
    });

    const res = await translations.request("/", {}, createRouteEnv());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: "web",
        name: "World English Bible",
        language: "en",
        license: "Public Domain",
        description: "Test translation",
        revision: null,
      },
    ]);
  });

  it("returns the recorded source revision, not the other source columns", async () => {
    getTranslations.mockResolvedValue({
      success: true,
      data: [
        {
          id: "tcgnt",
          name: "Text-Critical Greek New Testament",
          language: "grc",
          license: "Public Domain",
          description: "Test translation",
          source_revision: "2026-09-24",
          source_sha256: "d0864502e2835d287caacc77f1c751fa834a4f90f91845596895d989040d835c",
          imported_at: "2026-09-25T00:00:00.000Z",
        },
      ],
    });

    const res = await translations.request("/", {}, createRouteEnv());

    expect(await res.json()).toEqual([
      {
        id: "tcgnt",
        name: "Text-Critical Greek New Testament",
        language: "grc",
        license: "Public Domain",
        description: "Test translation",
        revision: "2026-09-24",
      },
    ]);
  });

  it("returns 503 when getTranslations fails", async () => {
    getTranslations.mockResolvedValue({ success: false, error: "Database query failed" });

    const res = await translations.request("/", {}, createRouteEnv());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Database query failed",
    });
  });
});