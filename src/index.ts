/**
 * Bible API - Cloudflare Worker Entry Point
 *
 * A self-hosted Bible API with full-text search, supporting multiple translations
 * including canonical books and Apocrypha.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types.js";

// Import route handlers
import verses from "./routes/verses.js";
import search from "./routes/search.js";
import books from "./routes/books.js";
import translations from "./routes/translations.js";
import random from "./routes/random.js";

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use("*", cors());

// Root endpoint - API info
app.get("/", (c) => {
  return c.json({
    name: "Bible API",
    version: "1.0.0",
    description: "Self-hosted Bible API with full-text search",
    endpoints: {
      verses: "GET /v1/verses/:reference",
      search: "GET /v1/search?q=...",
      books: "GET /v1/books",
      translations: "GET /v1/translations",
      random: "GET /v1/random",
    },
    examples: {
      single_verse: "/v1/verses/John%203:16",
      verse_range: "/v1/verses/Romans%208:28-39",
      chapter: "/v1/verses/Psalm%2023",
      search: "/v1/search?q=love",
      with_translation: "/v1/verses/John%203:16?translation=kjv",
    },
  });
});

// Mount routes under /v1
app.route("/v1/verses", verses);
app.route("/v1/search", search);
app.route("/v1/books", books);
app.route("/v1/translations", translations);
app.route("/v1/random", random);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: "Not found",
      status: 404,
      hint: "See / for available endpoints",
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      error: "Internal server error",
      status: 500,
    },
    500
  );
});

export default app;
