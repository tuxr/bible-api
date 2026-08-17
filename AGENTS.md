# AGENTS.md

Guidance for AI agents and humans working in this repository.

## Production

**Live API:** https://bible-api.dws-cloud.com
**Documentation:** https://tuxr.github.io/bible-api
**Wiki:** https://github.com/tuxr/bible-api/wiki

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

- **Hono** (`src/index.ts`): Lightweight web framework with built-in CORS middleware. Routes are modular under `src/routes/`. The root `/` returns JSON API info. `/v1/health` returns API status and stats.
- **Documentation** (`docs/`): Static HTML served via GitHub Pages. Separated from the API to keep forked copies clean.
- **D1 (SQLite)**: Edge database with FTS5 for full-text search. Schema in `schemas/schema.sql`.
- **Observability**: Enabled in `wrangler.toml`. Logs and traces available in Cloudflare dashboard under Workers → bible-api → Logs.
- **FTS5 with external content**: The `verses_fts` virtual table indexes verse text without duplicating storage. Triggers in the schema keep it synchronized.

**Reference Parser** (`src/lib/parser.ts`): The most complex component. Parses Bible references like "John 3:16", "Romans 8:28-39", "1 Corinthians 13", abbreviations ("Jn", "Gen"), and URL-encoded input. Returns structured `ParsedReference` objects. Also supports comma-separated references with context inheritance (e.g., "Romans 14:14, 22-23" inherits book and chapter; "Psalm 23, 24" inherits book) via `parseMultipleReferences()`.

**Book Data** (`src/lib/books-data.ts`): Contains 86 books (OT + NT + Apocrypha) with USFX IDs, aliases, and chapter counts. The `findBook()` function resolves any book name/alias to its canonical data. Single-chapter books (Jude, Philemon, 2 John, 3 John, Obadiah) are handled specially in the parser.

**Data Pipeline** (`data/scripts/`): Downloads USFX XML from ebible.org, parses with SAX streaming parser, and seeds D1 via wrangler. Parsed JSON stored in `data/parsed/` (gitignored).

## Database Schema

```
translations (id, name, language, license, description)
books (id, name, testament, book_order, chapters, aliases)
verses (id, translation_id, book_id, chapter, verse, text, text_plain)
verses_fts (FTS5 virtual table indexing text_plain for search)
```

The `translation_id` defaults to "web" (World English Bible). KJV and WLC (Hebrew OT) are also available.

**WLC search:** Pointed Hebrew display text is stored in `text`; `text_plain` holds unpointed text for FTS5. `src/lib/hebrew.ts` strips diacritics from queries at search time. WLC covers OT books only.

**Upgrading existing local DBs:** After pulling WLC search changes, run `npm run db:migrate:text-plain` before `npm run data:validate`.

**Upgrading an existing production D1 (WLC rollout):** Migrate the schema/FTS (`npm run db:migrate:text-plain -- --remote`) *before* seeding WLC — the `text_plain` column must exist first. The API is read-only, so WEB/KJV search stays up throughout. Full step-by-step (preconditions, verification, rollback): [`docs/runbooks/wlc-prod-migration.md`](docs/runbooks/wlc-prod-migration.md).

## Git & Deployment Workflow

**Important:** This repository deploys automatically to Cloudflare on push to `main`.

### Rules
- **Never** work directly on the `main` branch.
- Always create a feature branch before making changes:
  ```bash
  git checkout -b feature/your-change-name
  ```
- Make your changes, commit, and push the branch.
- Open a Pull Request instead of pushing directly to `main`.
- Only merge to `main` after review (or when explicitly approved).

### Worktrees (Optional)
For parallel work without switching branches, you may use Git worktrees:
```bash
git worktree add ../bible-api-feature feature/your-change-name
```

### Safety
- Treat `main` as production.
- Be cautious with any command that pushes to the remote.
