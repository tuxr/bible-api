/**
 * Health endpoint integration test when database is unavailable.
 */

import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("GET /v1/health (degraded)", () => {
  it("returns 503 when database tables are missing", async () => {
    const res = await SELF.fetch("http://localhost/v1/health");
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body).toEqual({
      status: "degraded",
      error: "Database unavailable",
      translations: 0,
      verses: 0,
    });
  });
});