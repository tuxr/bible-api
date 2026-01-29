# Bible API Project Plan

## Overview

Build a self-hosted, public Bible API on Cloudflare Workers with D1 (SQLite) storage. This API will serve as the backend for the existing `bible-mcp` MCP server and be available for public use.

## Goals

- Replace dependency on bible-api.com with self-hosted solution
- Provide fast, reliable Bible verse lookups
- Support multiple public domain translations
- Enable full-text search across verses
- Make API publicly available for others to use
- Host entirely on Cloudflare (Workers + D1)

---

## Architecture

```
┌─────────────────┐         ┌──────────────────────────────────┐
│   bible-mcp     │────────▶│          bible-api               │
│    (Worker)     │  HTTP   │           (Worker)               │
│                 │         │                                  │
│  MCP Protocol   │         │   GET /v1/verses/:ref            │
│  for Claude.ai  │         │   GET /v1/search?q=...           │
└─────────────────┘         │   GET /v1/books                  │
                            │   GET /v1/translations           │
                            └───────────────┬──────────────────┘
                                            │
                                            ▼
                            ┌──────────────────────────────────┐
                            │              D1                   │
                            │      (SQLite + FTS5 Search)      │
                            │                                  │
                            │  tables: verses, books,          │
                            │          translations            │
                            └──────────────────────────────────┘
```

---

## Repository Structure

```
bible-api/
├── src/
│   ├── index.ts              # Worker entry point, routing
│   ├── routes/
│   │   ├── verses.ts         # GET /v1/verses/:reference
│   │   ├── search.ts         # GET /v1/search
│   │   ├── books.ts          # GET /v1/books
│   │   ├── translations.ts   # GET /v1/translations
│   │   └── random.ts         # GET /v1/random
│   ├── lib/
│   │   ├── parser.ts         # Reference parsing ("John 3:16" → {book, chapter, verse})
│   │   ├── db.ts             # D1 query helpers
│   │   └── response.ts       # Standardized JSON response helpers
│   └── types.ts              # TypeScript interfaces
├── data/
│   ├── scripts/
│   │   ├── download-sources.ts   # Download from ebible.org
│   │   ├── parse-usfx.ts         # Parse USFX XML to JSON
│   │   ├── seed-d1.ts            # Seed D1 database
│   │   └── validate.ts           # Validate imported data
│   └── sources/                  # Downloaded files (gitignored)
├── schema.sql                # D1 database schema
├── wrangler.toml             # Cloudflare Worker config
├── package.json
├── tsconfig.json
└── README.md                 # Public API documentation
```

---

## Database Schema

```sql
-- Translations metadata
CREATE TABLE translations (
  id TEXT PRIMARY KEY,           -- 'web', 'kjv', 'webbe'
  name TEXT NOT NULL,            -- 'World English Bible'
  language TEXT NOT NULL,        -- 'en'
  license TEXT DEFAULT 'Public Domain',
  source_url TEXT,
  description TEXT
);

-- Books metadata  
CREATE TABLE books (
  id TEXT PRIMARY KEY,           -- 'GEN', 'EXO', 'PSA', 'MAT', 'JHN'
  name TEXT NOT NULL,            -- 'Genesis', 'Exodus', 'Psalms'
  testament TEXT NOT NULL,       -- 'OT' or 'NT'
  book_order INTEGER NOT NULL,   -- 1-66
  chapters INTEGER NOT NULL,     -- Number of chapters in book
  aliases TEXT                   -- JSON array: ["Gen", "Ge", "Gn"]
);

-- Verses (main content table)
CREATE TABLE verses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (translation_id) REFERENCES translations(id),
  FOREIGN KEY (book_id) REFERENCES books(id),
  UNIQUE(translation_id, book_id, chapter, verse)
);

-- Indexes for fast lookups
CREATE INDEX idx_verses_lookup ON verses(translation_id, book_id, chapter, verse);
CREATE INDEX idx_verses_chapter ON verses(translation_id, book_id, chapter);
CREATE INDEX idx_verses_book ON verses(translation_id, book_id);

-- Full-text search virtual table
CREATE VIRTUAL TABLE verses_fts USING fts5(
  text,
  content='verses',
  content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER verses_ai AFTER INSERT ON verses BEGIN
  INSERT INTO verses_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER verses_ad AFTER DELETE ON verses BEGIN
  INSERT INTO verses_fts(verses_fts, rowid, text) VALUES('delete', old.id, old.text);
END;

CREATE TRIGGER verses_au AFTER UPDATE ON verses BEGIN
  INSERT INTO verses_fts(verses_fts, rowid, text) VALUES('delete', old.id, old.text);
  INSERT INTO verses_fts(rowid, text) VALUES (new.id, new.text);
END;
```

---

## API Endpoints

### GET /v1/verses/:reference

Retrieve verses by reference.

**Parameters:**
- `:reference` (path) - Bible reference, URL encoded
  - Single verse: `john+3:16` or `john%203:16`
  - Verse range: `romans+8:28-39`
  - Full chapter: `psalm+23`
  - Multi-chapter: `genesis+1:1-2:3`
- `translation` (query, optional) - Translation ID, default: `web`

**Response:**
```json
{
  "reference": "John 3:16",
  "translation": {
    "id": "web",
    "name": "World English Bible"
  },
  "verses": [
    {
      "book": "JHN",
      "book_name": "John",
      "chapter": 3,
      "verse": 16,
      "text": "For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life."
    }
  ],
  "text": "For God so loved the world..."
}
```

### GET /v1/search

Full-text search across verses.

**Parameters:**
- `q` (query, required) - Search query
- `translation` (query, optional) - Translation ID, default: `web`
- `book` (query, optional) - Limit to specific book
- `testament` (query, optional) - `OT` or `NT`
- `limit` (query, optional) - Max results, default: 25, max: 100

**Response:**
```json
{
  "query": "love one another",
  "translation": "web",
  "total": 12,
  "results": [
    {
      "book": "JHN",
      "book_name": "John", 
      "chapter": 13,
      "verse": 34,
      "text": "A new commandment I give to you, that you love one another...",
      "reference": "John 13:34"
    }
  ]
}
```

### GET /v1/books

List all books of the Bible.

**Parameters:**
- `testament` (query, optional) - Filter by `OT` or `NT`

**Response:**
```json
{
  "books": [
    {
      "id": "GEN",
      "name": "Genesis",
      "testament": "OT",
      "chapters": 50,
      "order": 1
    }
  ]
}
```

### GET /v1/translations

List available translations.

**Response:**
```json
{
  "translations": [
    {
      "id": "web",
      "name": "World English Bible",
      "language": "en",
      "license": "Public Domain"
    }
  ]
}
```

### GET /v1/random

Get a random verse.

**Parameters:**
- `translation` (query, optional) - Translation ID, default: `web`
- `book` (query, optional) - Limit to specific book
- `testament` (query, optional) - `OT` or `NT`

---

## Data Sources

### Primary: World English Bible (Updated)

- **Source:** https://ebible.org/engwebu/
- **Download:** https://ebible.org/engwebu/engwebu_usfx.zip (USFX XML format)
- **License:** Public Domain
- **Notes:** Uses "LORD" for God's name, American spelling, 66 books + Apocrypha

### Secondary: King James Version

- **Source:** https://ebible.org/eng-kjv/
- **Download:** https://ebible.org/eng-kjv/eng-kjv_usfx.zip
- **License:** Public Domain (outside UK)

### Optional Additional Translations

| Translation | Source | Format |
|-------------|--------|--------|
| WEB British Edition | ebible.org/eng-webbe/ | USFX |
| American Standard Version | ebible.org/eng-asv/ | USFX |
| Bible in Basic English | ebible.org/eng-bbe/ | USFX |

---

## Implementation Phases

### Phase 1: Project Setup
- [ ] Initialize repository with TypeScript + Wrangler
- [ ] Set up D1 database and run schema.sql
- [ ] Configure wrangler.toml with D1 binding
- [ ] Set up local development environment

### Phase 2: Data Import Pipeline
- [ ] Write script to download USFX files from ebible.org
- [ ] Write USFX XML parser to extract verses
- [ ] Create books metadata (names, aliases, chapter counts)
- [ ] Write D1 seeding script
- [ ] Import WEB translation
- [ ] Import KJV translation
- [ ] Validate imported data (verse counts, spot checks)

### Phase 3: Core API Implementation
- [ ] Implement reference parser (handles "John 3:16", "Jn 3:16", "john 3:16", etc.)
- [ ] Implement GET /v1/verses/:reference
- [ ] Implement GET /v1/books
- [ ] Implement GET /v1/translations
- [ ] Implement GET /v1/random
- [ ] Add proper error handling and validation
- [ ] Add CORS headers for public access

### Phase 4: Search Implementation
- [ ] Implement GET /v1/search with FTS5
- [ ] Add book/testament filtering
- [ ] Add pagination
- [ ] Test search performance

### Phase 5: Production Readiness
- [ ] Add rate limiting (Cloudflare built-in)
- [ ] Add request logging
- [ ] Write API documentation in README
- [ ] Set up custom domain (optional)
- [ ] Deploy to production

### Phase 6: MCP Migration
- [ ] Update bible-mcp to use new API
- [ ] Test all MCP tools against new backend
- [ ] Remove bible-api.com dependency
- [ ] Deploy updated MCP

---

## Reference Parser Requirements

The parser must handle various input formats:

```
Standard:           "John 3:16"         → {book: "JHN", chapter: 3, startVerse: 16, endVerse: 16}
Range:              "John 3:16-18"      → {book: "JHN", chapter: 3, startVerse: 16, endVerse: 18}
Chapter:            "Psalm 23"          → {book: "PSA", chapter: 23, startVerse: 1, endVerse: 6}
Multi-chapter:      "Genesis 1:1-2:3"   → {book: "GEN", chapters: [{ch: 1, start: 1, end: 31}, {ch: 2, start: 1, end: 3}]}
Abbreviations:      "Jn 3:16"           → {book: "JHN", ...}
                    "Gen 1:1"           → {book: "GEN", ...}
                    "Ps 23"             → {book: "PSA", ...}
                    "1 Cor 13"          → {book: "1CO", ...}
Case insensitive:   "JOHN 3:16"         → {book: "JHN", ...}
                    "john 3:16"         → {book: "JHN", ...}
URL encoded:        "john+3:16"         → {book: "JHN", ...}
                    "john%203:16"       → {book: "JHN", ...}
```

---

## Book ID Reference

Standard 3-letter book IDs to use:

**Old Testament:**
```
GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST 
JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM 
HAB ZEP HAG ZEC MAL
```

**New Testament:**
```
MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT 
PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV
```

---

## Configuration

### wrangler.toml

```toml
name = "bible-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "bible-db"
database_id = "<your-database-id>"

[vars]
DEFAULT_TRANSLATION = "web"
MAX_SEARCH_RESULTS = 100
```

### Environment Types

```typescript
// src/types.ts
export interface Env {
  DB: D1Database;
  DEFAULT_TRANSLATION: string;
  MAX_SEARCH_RESULTS: number;
}
```

---

## Error Response Format

All errors should return consistent JSON:

```json
{
  "error": true,
  "code": "INVALID_REFERENCE",
  "message": "Could not parse reference: 'xyz 123'",
  "hint": "Try a format like 'John 3:16' or 'Genesis 1:1-10'"
}
```

Error codes:
- `INVALID_REFERENCE` - Could not parse the verse reference
- `TRANSLATION_NOT_FOUND` - Unknown translation ID
- `BOOK_NOT_FOUND` - Unknown book name
- `VERSE_NOT_FOUND` - Reference valid but verse doesn't exist
- `SEARCH_QUERY_REQUIRED` - Missing search query
- `RATE_LIMITED` - Too many requests

---

## Testing Checklist

### Reference Parser Tests
- [ ] Single verse: "John 3:16"
- [ ] Verse range: "Romans 8:28-39"
- [ ] Full chapter: "Psalm 23"
- [ ] Multi-chapter range: "Genesis 1:1-2:3"
- [ ] Numbered book: "1 Corinthians 13"
- [ ] Various abbreviations: "Jn", "Gen", "Ps", "1 Cor"
- [ ] Case variations
- [ ] URL encoding: spaces as + or %20

### API Endpoint Tests
- [ ] Valid single verse returns correct text
- [ ] Verse range returns all verses
- [ ] Invalid reference returns helpful error
- [ ] Unknown translation returns error
- [ ] Search returns relevant results
- [ ] Search with book filter works
- [ ] Empty search results handled
- [ ] Rate limiting works

### Data Validation
- [ ] WEB has 31,102 verses (Protestant canon)
- [ ] KJV has 31,102 verses
- [ ] All 66 books present
- [ ] Chapter counts correct per book
- [ ] No duplicate verses
- [ ] No missing verses
- [ ] FTS index working

---

## Resources

- **ebible.org** - Official WEB source: https://ebible.org/
- **USFX Format Spec** - https://ebible.org/usfx/
- **Cloudflare D1 Docs** - https://developers.cloudflare.com/d1/
- **Cloudflare Workers Docs** - https://developers.cloudflare.com/workers/
- **D1 FTS5 Support** - https://developers.cloudflare.com/d1/build-with-d1/d1-and-sqlite/#full-text-search
