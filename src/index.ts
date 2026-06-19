/**
 * Bible API - Cloudflare Worker Entry Point
 *
 * A self-hosted Bible API with full-text search, supporting multiple translations
 * including canonical books and Apocrypha.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types.js";
import { CACHE_NONE, notFound, serverError } from "./lib/response.js";

// Import route handlers
import verses from "./routes/verses.js";
import chapters from "./routes/chapters.js";
import search from "./routes/search.js";
import books from "./routes/books.js";
import translations from "./routes/translations.js";
import random from "./routes/random.js";

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use("*", cors());

// Root endpoint - API info with link to documentation
app.get("/", (c) => {
  return c.json(
    {
      name: "Bible API",
      version: "1.0.0",
      description: "Free REST API for Bible verses with full-text search",
      documentation: "https://tuxr.github.io/bible-api",
      endpoints: {
        verses: "/v1/verses/:reference",
        chapters: "/v1/chapters/:book/:chapter",
        search: "/v1/search?q=:query",
        books: "/v1/books",
        translations: "/v1/translations",
        random: "/v1/random",
        health: "/v1/health",
      },
    },
    {
      headers: { "Cache-Control": "public, max-age=86400" },
    }
  );
});

// Mount routes under /v1
app.route("/v1/verses", verses);
app.route("/v1/chapters", chapters);
app.route("/v1/search", search);
app.route("/v1/books", books);
app.route("/v1/translations", translations);
app.route("/v1/random", random);

// Health check endpoint - must never crash
app.get("/v1/health", async (c) => {
  try {
    const [translationCount, verseCount] = await Promise.all([
      c.env.DB.prepare("SELECT COUNT(*) as count FROM translations").first<{ count: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) as count FROM verses").first<{ count: number }>(),
    ]);

    return c.json(
      {
        status: "ok",
        translations: translationCount?.count ?? 0,
        verses: verseCount?.count ?? 0,
      },
      {
        headers: { "Cache-Control": CACHE_NONE },
      }
    );
  } catch (err) {
    console.error("Health check database error:", err);
    return c.json(
      {
        status: "degraded",
        error: "Database unavailable",
        translations: 0,
        verses: 0,
      },
      {
        status: 503,
        headers: { "Cache-Control": CACHE_NONE },
      }
    );
  }
});

// 404 handler
app.notFound((c) => {
  return notFound(c, "Not found", "See https://tuxr.github.io/bible-api for documentation");
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return serverError(c);
});

export default app;
