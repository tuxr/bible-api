# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev                    # Start local dev server (wrangler)
npm run typecheck              # TypeScript type check

# Testing
npm test                       # Run tests in watch mode
npm run test:run               # Run tests once
npm run test:run -- src/__tests__/parser.test.ts  # Run single test file

# Data Pipeline (run in order for fresh setup)
npm run data:download          # Download USFX files from ebible.org
npm run data:parse             # Parse USFX XML to JSON
npm run db:schema:local        # Apply schema to local D1
npm run db:seed                # Seed local database
npm run data:validate          # Validate seeded data

# Database queries (local)
npx wrangler d1 execute bible-db --local --command "SELECT COUNT(*) FROM verses"

# Deployment
npm run db:schema              # Apply schema to production D1
npm run db:seed -- --production  # Seed production
npm run deploy                 # Deploy to Cloudflare
```

## Architecture

**Cloudflare Workers + D1 + Hono**

This is a Bible API running on Cloudflare's edge. The key architectural decisions:

- **Hono** (`src/index.ts`): Lightweight web framework with built-in CORS middleware. Routes are modular under `src/routes/`.
- **D1 (SQLite)**: Edge database with FTS5 for full-text search. Schema in `schemas/schema.sql`.
- **FTS5 with external content**: The `verses_fts` virtual table indexes verse text without duplicating storage. Triggers in the schema keep it synchronized.

**Reference Parser** (`src/lib/parser.ts`): The most complex component. Parses Bible references like "John 3:16", "Romans 8:28-39", "1 Corinthians 13", abbreviations ("Jn", "Gen"), and URL-encoded input. Returns structured `ParsedReference` objects.

**Book Data** (`src/lib/books-data.ts`): Contains 86 books (OT + NT + Apocrypha) with USFX IDs, aliases, and chapter counts. The `findBook()` function resolves any book name/alias to its canonical data. Single-chapter books (Jude, Philemon, 2 John, 3 John, Obadiah) are handled specially in the parser.

**Data Pipeline** (`data/scripts/`): Downloads USFX XML from ebible.org, parses with SAX streaming parser, and seeds D1 via wrangler. Parsed JSON stored in `data/parsed/` (gitignored).

## Database Schema

```
translations (id, name, language, license, description)
books (id, name, testament, book_order, chapters, aliases)
verses (id, translation_id, book_id, chapter, verse, text)
verses_fts (FTS5 virtual table for search)
```

The `translation_id` defaults to "web" (World English Bible). KJV is also available.
