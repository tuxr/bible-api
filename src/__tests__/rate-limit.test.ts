/**
 * Tests for rate limiting middleware
 */

import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types.js";
import {
  getClientIp,
  rateLimitMiddleware,
  SEARCH_RATE_LIMIT,
  RANDOM_RATE_LIMIT,
} from "../lib/rate-limit.js";

function createMockLimiter(success: boolean) {
  return {
    limit: vi.fn().mockResolvedValue({ success }),
  } satisfies RateLimit;
}

function createTestApp(limiter: RateLimit, config = SEARCH_RATE_LIMIT) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", rateLimitMiddleware(() => limiter, config));
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

function createEnv(limiter: RateLimit): Env {
  return {
    DB: {} as D1Database,
    SEARCH_RATE_LIMITER: limiter,
    RANDOM_RATE_LIMITER: limiter,
  };
}

describe("getClientIp", () => {
  it("prefers cf-connecting-ip", async () => {
    const app = new Hono();
    app.get("/", (c) => c.json({ ip: getClientIp(c) }));

    const res = await app.request("/", {
      headers: {
        "cf-connecting-ip": "203.0.113.1",
        "x-forwarded-for": "198.51.100.2",
      },
    });

    expect(await res.json()).toEqual({ ip: "203.0.113.1" });
  });

  it("falls back to the first x-forwarded-for address", async () => {
    const app = new Hono();
    app.get("/", (c) => c.json({ ip: getClientIp(c) }));

    const res = await app.request("/", {
      headers: { "x-forwarded-for": "198.51.100.2, 203.0.113.9" },
    });

    expect(await res.json()).toEqual({ ip: "198.51.100.2" });
  });

  it("uses unknown when no IP headers are present", async () => {
    const app = new Hono();
    app.get("/", (c) => c.json({ ip: getClientIp(c) }));

    const res = await app.request("/");

    expect(await res.json()).toEqual({ ip: "unknown" });
  });
});

describe("rateLimitMiddleware", () => {
  it("allows requests when the limiter succeeds", async () => {
    const limiter = createMockLimiter(true);
    const app = createTestApp(limiter);

    const res = await app.request("/", {
      headers: { "cf-connecting-ip": "203.0.113.1" },
    }, createEnv(limiter));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(limiter.limit).toHaveBeenCalledWith({ key: "203.0.113.1" });
    expect(res.headers.get("X-RateLimit-Limit")).toBe(String(SEARCH_RATE_LIMIT.limit));
  });

  it("returns 429 with consistent JSON when the limiter fails", async () => {
    const limiter = createMockLimiter(false);
    const app = createTestApp(limiter);

    const res = await app.request("/", {
      headers: { "cf-connecting-ip": "203.0.113.1" },
    }, createEnv(limiter));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Rate limit exceeded",
    });
    expect(res.headers.get("Retry-After")).toBe(String(SEARCH_RATE_LIMIT.period));
    expect(res.headers.get("X-RateLimit-Limit")).toBe(String(SEARCH_RATE_LIMIT.limit));
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("fails open when the limiter throws", async () => {
    const limiter = {
      limit: vi.fn().mockRejectedValue(new Error("binding unavailable")),
    } satisfies RateLimit;
    const app = createTestApp(limiter);

    const res = await app.request("/", {
      headers: { "cf-connecting-ip": "203.0.113.1" },
    }, createEnv(limiter));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("uses different bindings per route configuration", async () => {
    const searchLimiter = createMockLimiter(true);
    const randomLimiter = createMockLimiter(true);

    const searchApp = createTestApp(searchLimiter, SEARCH_RATE_LIMIT);
    const randomApp = createTestApp(randomLimiter, RANDOM_RATE_LIMIT);

    await searchApp.request("/", {
      headers: { "cf-connecting-ip": "203.0.113.1" },
    }, createEnv(searchLimiter));
    await randomApp.request("/", {
      headers: { "cf-connecting-ip": "203.0.113.1" },
    }, createEnv(randomLimiter));

    expect(searchLimiter.limit).toHaveBeenCalledOnce();
    expect(randomLimiter.limit).toHaveBeenCalledOnce();
  });
});