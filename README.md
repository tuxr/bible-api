# Bible API

A self-hosted Bible API built on Cloudflare Workers with D1 (SQLite + FTS5). Supports multiple translations, full-text search, and includes both canonical books and Apocrypha (~80 books total).

## Live API

**Base URL:** https://bible-api.dws-cloud.com

**Documentation:** https://tuxr.github.io/bible-api

**Wiki:** https://github.com/tuxr/bible-api/wiki (architecture, data pipeline, adding translations)

> **Note:** This is a free, public instance you can use immediately. For production applications with high traffic, consider [deploying your own instance](#deploy-your-own).

```bash
# Try it
curl "https://bible-api.dws-cloud.com/v1/verses/John%203:16"
```

## Features

- **Multiple Translations**: Includes WEB (World English Bible), KJV (King James Version), and WLC (Westminster Leningrad Codex — Hebrew Old Testament)
- **Full-Text Search**: Powered by SQLite FTS5 for fast, relevant search results
- **Comprehensive**: 66 canonical books plus Apocrypha/Deuterocanonical books
- **Flexible References**: Supports various formats (abbreviations, numbered books, URL-encoded, comma-separated with context inheritance)
- **Case-Insensitive**: Translation and testament parameters accept any case (e.g., `KJV`, `kjv`, `Kjv`)
- **Edge Deployment**: Runs on Cloudflare Workers for low-latency responses worldwide
- **Aggressive Caching**: Cache-Control headers for CDN and browser caching (immutable Bible content cached for 30 days at edge)

## Architecture

```mermaid
graph LR
    Client([Client]) -->|HTTPS| Worker[Cloudflare Worker]
    Worker -->|SQL| D1[(D1)]
```

## API Endpoints

### Get Verses
```
GET /v1/verses/:reference?translation=web
```

**Examples:**
- Single verse: `/v1/verses/John%203:16`
- Verse range: `/v1/verses/Romans%208:28-39`
- Full chapter: `/v1/verses/Psalm%2023`
- Multi-chapter: `/v1/verses/Genesis%201:1-2:3`
- Comma-separated: `/v1/verses/Romans%2014:14,%2022-23`
- With translation: `/v1/verses/John%203:16?translation=kjv`
- Hebrew OT: `/v1/verses/Genesis%201:1?translation=wlc`

**Comma-separated references** support context inheritance — subsequent segments inherit the book and/or chapter from the previous reference:
- `Romans 14:14, 22-23` → Romans 14:14 + Romans 14:22-23 (inherits book and chapter)
- `Psalm 23, 24` → Psalms 23 + Psalms 24 (inherits book)
- `Genesis 1:1, 2:3` → Genesis 1:1 + Genesis 2:3 (inherits book, new chapter)
- `John 3:16, Romans 8:28` → two independent references

### Get Chapter (with Navigation)
```
GET /v1/chapters/:book/:chapter?translation=web
```

Designed for sequential reading apps. Returns a full chapter with `navigation.previous` and `navigation.next` hints for page turning.

**Examples:**
- `/v1/chapters/Genesis/1`
- `/v1/chapters/John/3?translation=kjv`
- `/v1/chapters/GEN/1` (book IDs also work)

**Response includes:**
```json
{
  "navigation": {
    "previous": null,
    "next": { "book": "GEN", "chapter": 2, "testament": "OT" }
  }
}
```

Navigation includes `testament` (OT/NT/AP) so clients can handle boundaries (e.g., stop at Revelation or continue into Apocrypha).

### Search
```
GET /v1/search?q=love&translation=web&book=ROM&testament=NT&limit=20
```

Hebrew search (WLC) uses unpointed (consonantal) text — queries with or without niqqud/cantillation both work:
```
GET /v1/search?q=בראשית&translation=wlc
```

**WLC scope:** Old Testament only (~23,000 verses). New Testament books return 404 for verse/chapter lookups.

### List Books
```
GET /v1/books?testament=NT
```

### List Translations
```
GET /v1/translations
```

### Random Verse
```
GET /v1/random?translation=web&book=PSA&testament=OT
```

Optional filters:
- `book` - Limit to specific book (e.g., `PSA`, `John`, `ROM`)
- `testament` - Limit to testament (`OT`, `NT`, or `AP`)

### Health Check
```
GET /v1/health
```

Returns API status and database stats. Returns `status: "ok"` normally, or `status: "degraded"` with HTTP 503 if the database is unavailable.

## Caching

All endpoints include appropriate `Cache-Control` headers for optimal performance:

| Endpoint | Cache Strategy | Edge TTL |
|----------|---------------|----------|
| `/v1/verses/*` | Immutable content | 30 days |
| `/v1/chapters/*` | Immutable content | 30 days |
| `/v1/books` | Immutable content | 30 days |
| `/v1/translations` | Immutable content | 30 days |
| `/v1/search` | Short cache | 1 hour |
| `/v1/random` | No cache | - |
| `/v1/health` | No cache | - |

Bible content is immutable, so aggressive caching is safe. Cloudflare's edge network caches responses globally, reducing database load and improving response times.

## Error Handling

The API returns appropriate HTTP status codes with JSON error messages. The status code is conveyed via the HTTP response status line only — it is not duplicated in the JSON body.

| Status | Meaning |
|--------|---------|
| `400` | Bad request (invalid reference, unknown book, verse 0, etc.) |
| `404` | Not found (no verses match, unknown translation) |
| `429` | Too many requests (rate limit exceeded on `/v1/search` or `/v1/random`) |
| `503` | Service unavailable (database error) |

Example error response (HTTP 400):
```json
{
  "error": "Verse number must be at least 1"
}
```

Unknown routes return HTTP 404 with an optional `hint` field:
```json
{
  "error": "Not found",
  "hint": "See https://tuxr.github.io/bible-api for documentation"
}
```

## Rate Limiting

Per-IP rate limits protect the database-heavy endpoints:

| Endpoint | Limit |
|----------|-------|
| `/v1/search` | 30 requests per 60 seconds |
| `/v1/random` | 60 requests per 60 seconds |

When a limit is exceeded, the API returns HTTP `429` with a JSON body:

```json
{
  "error": "Rate limit exceeded"
}
```

Response headers on rate-limited endpoints:

| Header | When present | Meaning |
|--------|--------------|---------|
| `X-RateLimit-Limit` | All responses | Maximum requests allowed in the window |
| `X-RateLimit-Remaining` | `429` responses | Requests remaining (`0` when limited) |
| `Retry-After` | `429` responses | Seconds until the window resets |

## Response Example

```json
{
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
}
```

## Deploy Your Own

Want to run your own instance? The API runs on Cloudflare's free tier.

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
- Node.js 22+
- Wrangler CLI: `npm install -g wrangler`

### Quick Deploy

```bash
# Clone the repository
git clone https://github.com/tuxr/bible-api.git
cd bible-api

# Install dependencies
npm install

# Login to Cloudflare
wrangler login

# Create your D1 database
wrangler d1 create bible-db

# Update wrangler.toml with your new database_id from the output above

# Download and parse Bible data
npm run data:download
npm run data:parse

# Apply schema and seed your database
npm run db:schema
npm run db:seed -- --production

# Deploy
npm run deploy
```

Your API will be live at `https://bible-api.<your-subdomain>.workers.dev`.

To use a custom domain, update the `routes` section in `wrangler.toml` and configure DNS in your Cloudflare dashboard.

### Cost

Cloudflare Workers free tier includes:
- 100,000 requests/day
- 10ms CPU time per request
- D1 database with 5GB storage

This is more than sufficient for personal projects and moderate traffic.

## Development

### Prerequisites
- Node.js 22+
- Wrangler CLI (`npm install -g wrangler`)

### Setup

```bash
# Install dependencies
npm install

# Download Bible source files
npm run data:download

# Parse USFX XML to JSON
npm run data:parse

# Apply database schema (local)
npm run db:schema:local

# Seed database with parsed data
npm run db:seed

# Start development server
npm run dev
```

### Security

Run `npm audit` to check for dependency vulnerabilities. As of the latest dependency updates, the project reports **0 vulnerabilities**. Dev tooling was upgraded to Vitest 4 and `@cloudflare/vitest-pool-workers` 0.16.x to resolve transitive issues in miniflare/wrangler (undici, ws, esbuild).

### Testing

```bash
# Run all tests
npm test

# Run tests once
npm run test:run

# Type check
npm run typecheck
```

## Deployment

```bash
# Create production D1 database
wrangler d1 create bible-db

# Update wrangler.toml with the database ID

# Apply schema to production
npm run db:schema

# Seed production database
npm run db:seed -- --production

# Deploy
npm run deploy
```

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: D1 (SQLite)
- **Search**: FTS5 (Full-Text Search)
- **Testing**: Vitest with `@cloudflare/vitest-pool-workers`

## Data Sources

Bible texts are sourced from [eBible.org](https://ebible.org/) in USFX (Unified Scripture Format XML) format. Both WEB and KJV are in the public domain.

## License

MIT
