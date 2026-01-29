/**
 * Response utilities for consistent API responses
 */

import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

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
