/**
 * Rate limiting middleware using Cloudflare Workers Rate Limiting bindings
 */

import { createMiddleware } from "hono/factory";
import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../types.js";
import { tooManyRequests } from "./response.js";

export interface RateLimitConfig {
  limit: number;
  period: 10 | 60;
}

/** Search is DB-heavy (FTS5); keep stricter than random. */
export const SEARCH_RATE_LIMIT: RateLimitConfig = { limit: 30, period: 60 };

/** Random hits the DB but is lighter than full-text search. */
export const RANDOM_RATE_LIMIT: RateLimitConfig = { limit: 60, period: 60 };

export function getClientIp(c: Context): string {
  const cfIp = c.req.header("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }

  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return "unknown";
}

function rateLimitHeaders(
  config: RateLimitConfig,
  remaining?: number
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(config.limit),
  };

  if (remaining !== undefined) {
    headers["X-RateLimit-Remaining"] = String(remaining);
  }

  return headers;
}

export function rateLimitMiddleware(
  getLimiter: (env: Env) => RateLimit,
  config: RateLimitConfig
): MiddlewareHandler<{ Bindings: Env }> {
  return createMiddleware(async (c, next) => {
    const limiter = getLimiter(c.env);
    const key = getClientIp(c);

    try {
      const { success } = await limiter.limit({ key });

      if (!success) {
        return tooManyRequests(c, "Rate limit exceeded", {
          ...rateLimitHeaders(config, 0),
          "Retry-After": String(config.period),
        });
      }

      for (const [name, value] of Object.entries(rateLimitHeaders(config))) {
        c.header(name, value);
      }
    } catch (err) {
      // Fail open: allow the request if the rate limiter binding is unavailable
      console.error("Rate limiter error:", err);
    }

    await next();
  });
}