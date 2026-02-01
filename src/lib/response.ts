/**
 * Response utilities for consistent API responses
 */

import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// Cache control headers for different content types
// For immutable Bible content (verses, chapters, books, translations)
export const CACHE_IMMUTABLE = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400";
// For search results (stable but query-dependent)
export const CACHE_SHORT = "public, max-age=300, s-maxage=3600";
// For dynamic/random content
export const CACHE_NONE = "no-cache, no-store";

export function errorResponse(c: Context, status: ContentfulStatusCode, message: string) {
  return c.json({ error: message, status }, status);
}

export function notFound(c: Context, message = "Not found") {
  return errorResponse(c, 404, message);
}

export function badRequest(c: Context, message: string) {
  return errorResponse(c, 400, message);
}

export function serverError(c: Context, message = "Internal server error") {
  return errorResponse(c, 500, message);
}

export function serviceUnavailable(c: Context, message = "Service temporarily unavailable") {
  return errorResponse(c, 503, message);
}

/**
 * Return JSON response with Cache-Control header
 */
export function jsonWithCache<T>(c: Context, data: T, cacheControl: string) {
  return c.json(data, {
    headers: { "Cache-Control": cacheControl },
  });
}
