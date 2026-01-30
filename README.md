# Bible API

A self-hosted Bible API built on Cloudflare Workers with D1 (SQLite + FTS5). Supports multiple translations, full-text search, and includes both canonical books and Apocrypha (~80 books total).

## Live API

**Base URL:** https://bible-api.dws-cloud.com

**Interactive Docs:** Visit the base URL in a browser for interactive API documentation with "Try it" links.

```bash
# Try it
curl "https://bible-api.dws-cloud.com/v1/verses/John%203:16"
```

## Features

- **Multiple Translations**: Includes WEB (World English Bible) and KJV (King James Version)
- **Full-Text Search**: Powered by SQLite FTS5 for fast, relevant search results
- **Comprehensive**: 66 canonical books plus Apocrypha/Deuterocanonical books
- **Flexible References**: Supports various formats (abbreviations, numbered books, URL-encoded)
- **Case-Insensitive**: Translation and testament parameters accept any case (e.g., `KJV`, `kjv`, `Kjv`)
- **Edge Deployment**: Runs on Cloudflare Workers for low-latency responses worldwide

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
- With translation: `/v1/verses/John%203:16?translation=kjv`

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
    "next": { "book": "GEN", "chapter": 2 }
  }
}
```

### Search
```
GET /v1/search?q=love&translation=web&book=ROM&testament=NT&limit=20
```

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

Returns API status and database stats (translations count, verses count).

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

## Development

### Prerequisites
- Node.js 18+
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
