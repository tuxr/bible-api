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

// Root endpoint - HTML documentation page
app.get("/", (c) => {
  const baseUrl = new URL(c.req.url).origin;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bible API</title>
  <style>
    :root {
      --bg: #0d1117;
      --card: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --accent: #58a6ff;
      --green: #3fb950;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
      max-width: 900px;
      margin: 0 auto;
    }
    h1 { color: #fff; margin-bottom: 0.5rem; }
    .subtitle { color: var(--text-muted); margin-bottom: 2rem; font-size: 1.1rem; }
    h2 { color: #fff; margin: 2rem 0 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    h3 { color: var(--accent); margin: 1.5rem 0 0.5rem; font-size: 1rem; }
    p { margin-bottom: 1rem; }
    code {
      background: var(--card);
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    pre {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      overflow-x: auto;
      margin: 0.5rem 0 1rem;
    }
    pre code { background: none; padding: 0; }
    .endpoint {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      margin: 1rem 0;
    }
    .method {
      display: inline-block;
      background: var(--green);
      color: #000;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-weight: 600;
      font-size: 0.8rem;
      margin-right: 0.5rem;
    }
    .path { font-family: monospace; color: var(--accent); }
    .param { color: var(--text-muted); font-size: 0.9rem; margin-top: 0.5rem; }
    a { color: var(--accent); }
    .try-link { font-size: 0.85rem; margin-left: 1rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--border); }
    th { color: var(--text-muted); font-weight: 500; }
    .note {
      background: rgba(88, 166, 255, 0.1);
      border-left: 3px solid var(--accent);
      padding: 1rem;
      margin: 1rem 0;
      border-radius: 0 8px 8px 0;
    }
    footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>📖 Bible API</h1>
  <p class="subtitle">Free REST API for Bible verses with full-text search. Multiple translations, 80+ books including Apocrypha.</p>

  <h2>Quick Start</h2>
  <pre><code>curl "${baseUrl}/v1/verses/John%203:16"</code></pre>

  <h2>Endpoints</h2>

  <div class="endpoint">
    <span class="method">GET</span>
    <span class="path">/v1/verses/:reference</span>
    <a class="try-link" href="${baseUrl}/v1/verses/John%203:16" target="_blank">Try it →</a>
    <p class="param">Get verses by reference. Supports single verses, ranges, and full chapters.</p>
    <p class="param"><strong>Query:</strong> <code>translation</code> - Translation ID (default: web)</p>
  </div>

  <h3>Reference Formats</h3>
  <table>
    <tr><th>Format</th><th>Example</th><th>Try</th></tr>
    <tr><td>Single verse</td><td><code>John 3:16</code></td><td><a href="${baseUrl}/v1/verses/John%203:16">→</a></td></tr>
    <tr><td>Verse range</td><td><code>Romans 8:28-39</code></td><td><a href="${baseUrl}/v1/verses/Romans%208:28-39">→</a></td></tr>
    <tr><td>Full chapter</td><td><code>Psalm 23</code></td><td><a href="${baseUrl}/v1/verses/Psalm%2023">→</a></td></tr>
    <tr><td>Multi-chapter</td><td><code>Genesis 1:1-2:3</code></td><td><a href="${baseUrl}/v1/verses/Genesis%201:1-2:3">→</a></td></tr>
    <tr><td>With translation</td><td><code>John 3:16?translation=kjv</code></td><td><a href="${baseUrl}/v1/verses/John%203:16?translation=kjv">→</a></td></tr>
    <tr><td>Abbreviations</td><td><code>Jn 3:16</code>, <code>Gen 1:1</code></td><td><a href="${baseUrl}/v1/verses/Jn%203:16">→</a></td></tr>
  </table>

  <div class="endpoint">
    <span class="method">GET</span>
    <span class="path">/v1/search</span>
    <a class="try-link" href="${baseUrl}/v1/search?q=love" target="_blank">Try it →</a>
    <p class="param">Full-text search across all verses.</p>
    <p class="param">
      <strong>Query:</strong>
      <code>q</code> - Search query (required) •
      <code>translation</code> - Translation ID •
      <code>book</code> - Filter by book (e.g., ROM) •
      <code>testament</code> - Filter by OT, NT, or AP •
      <code>limit</code> - Results per page (default: 20) •
      <code>offset</code> - Pagination offset
    </p>
  </div>

  <div class="endpoint">
    <span class="method">GET</span>
    <span class="path">/v1/books</span>
    <a class="try-link" href="${baseUrl}/v1/books" target="_blank">Try it →</a>
    <p class="param">List all books with chapter counts and metadata.</p>
    <p class="param"><strong>Query:</strong> <code>testament</code> - Filter by OT, NT, or AP</p>
  </div>

  <div class="endpoint">
    <span class="method">GET</span>
    <span class="path">/v1/translations</span>
    <a class="try-link" href="${baseUrl}/v1/translations" target="_blank">Try it →</a>
    <p class="param">List available translations.</p>
  </div>

  <div class="endpoint">
    <span class="method">GET</span>
    <span class="path">/v1/random</span>
    <a class="try-link" href="${baseUrl}/v1/random" target="_blank">Try it →</a>
    <p class="param">Get a random verse.</p>
    <p class="param">
      <strong>Query:</strong>
      <code>translation</code> - Translation ID •
      <code>book</code> - Limit to specific book •
      <code>testament</code> - Limit to OT, NT, or AP
    </p>
  </div>

  <div class="endpoint">
    <span class="method">GET</span>
    <span class="path">/v1/health</span>
    <a class="try-link" href="${baseUrl}/v1/health" target="_blank">Try it →</a>
    <p class="param">Health check endpoint. Returns API status and database stats.</p>
  </div>

  <h2>Response Format</h2>
  <pre><code>{
  "reference": "John 3:16",
  "translation": {
    "id": "web",
    "name": "World English Bible"
  },
  "verses": [{
    "book": "JHN",
    "book_name": "John",
    "chapter": 3,
    "verse": 16,
    "text": "For God so loved the world..."
  }],
  "text": "For God so loved the world..."
}</code></pre>

  <h2>Translations</h2>
  <table>
    <tr><th>ID</th><th>Name</th><th>Notes</th></tr>
    <tr><td><code>web</code></td><td>World English Bible</td><td>Default. Modern English, public domain.</td></tr>
    <tr><td><code>kjv</code></td><td>King James Version</td><td>1769 edition, public domain.</td></tr>
  </table>

  <h2>Usage Guidelines</h2>
  <div class="note">
    <p>This is a <strong>free, public API</strong>. Please be respectful:</p>
    <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
      <li>Avoid automated bulk downloads or scraping</li>
      <li>Cache responses in your application when possible</li>
      <li>If you need the complete dataset, source files are available at <a href="https://ebible.org">ebible.org</a></li>
      <li>For use with AI assistants, see <a href="https://bible-mcp.dws-cloud.com">Bible MCP</a></li>
    </ul>
  </div>

  <footer>
    <p>Data sourced from <a href="https://ebible.org">eBible.org</a>. Both WEB and KJV are in the public domain.</p>
  </footer>
</body>
</html>`;

  return c.html(html);
});

// Mount routes under /v1
app.route("/v1/verses", verses);
app.route("/v1/search", search);
app.route("/v1/books", books);
app.route("/v1/translations", translations);
app.route("/v1/random", random);

// Health check endpoint
app.get("/v1/health", async (c) => {
  const [translationCount, verseCount] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as count FROM translations").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM verses").first<{ count: number }>(),
  ]);

  return c.json({
    status: "ok",
    translations: translationCount?.count ?? 0,
    verses: verseCount?.count ?? 0,
  });
});

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
