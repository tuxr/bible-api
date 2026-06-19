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