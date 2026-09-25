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
npm run data:download          # Download the USFX revisions pinned in data/sources.lock.json
npm run data:parse             # Parse USFX XML to JSON
npm run data:tag               # Tag tcgnt/wlc words + build lexicons (after parse)
npm run db:schema:local        # Apply schema to local D1
npm run db:seed                # Seed local database
npm run data:validate          # Validate seeded data

# Database queries (local)
npx wrangler d1 execute bible-db --local --command "SELECT COUNT(*) FROM verses"

# Production (see "Deployment" below: merging to main deploys the Worker)
npm run db:schema              # Apply schema to production D1 (fresh database only)
npm run db:seed -- --production  # Seed production
npm run deploy                 # Manual deploy: fallback or self-hosting only
```

## Architecture

**Cloudflare Workers + D1 + Hono**

This is a Bible API running on Cloudflare's edge. The key architectural decisions:

- **Hono** (`src/index.ts`): Lightweight web framework with built-in CORS middleware. Routes are modular under `src/routes/`. The root `/` returns JSON API info. `/v1/health` returns API status and stats.
- **Documentation** (`docs/`): Static HTML served via GitHub Pages. Separated from the API to keep forked copies clean.
- **D1 (SQLite)**: Edge database with FTS5 for full-text search. Schema in `schemas/schema.sql`.
- **Observability**: Enabled in `wrangler.toml`. Logs and traces available in Cloudflare dashboard under Workers → bible-api → Logs.
- **Search index** (`src/lib/search-index.ts`): `verses_search` is a contentless FTS5 table whose rowid is the verse's canonical position (`search_id·10^8 + book_order·10^6 + chapter·10^3 + verse`), so translation, book and testament filters are rowid ranges and matches come back in order. Triggers keep it synchronized, and guard triggers reject a verse the key can't encode. A new translation needs a number in `SEARCH_IDS` before seeding; never renumber one or change a book's order. It replaced `verses_fts` (rowid = `verses.id`), which was dropped on 2026-09-25. Production setup: [runbook](docs/runbooks/search-index-prod-migration.md).

**Reference Parser** (`src/lib/parser.ts`): The most complex component. Parses Bible references like "John 3:16", "Romans 8:28-39", "1 Corinthians 13", abbreviations ("Jn", "Gen"), and URL-encoded input. Returns structured `ParsedReference` objects. Also supports comma-separated references with context inheritance (e.g., "Romans 14:14, 22-23" inherits book and chapter; "Psalm 23, 24" inherits book) via `parseMultipleReferences()`.

**Book Data** (`src/lib/books-data.ts`): Contains 86 books (OT + NT + Apocrypha) with USFX IDs, aliases, and chapter counts. The `findBook()` function resolves any book name/alias to its canonical data. Single-chapter books (Jude, Philemon, 2 John, 3 John, Obadiah) are handled specially in the parser.

**Data Pipeline** (`data/scripts/`): Downloads USFX XML from ebible.org, parses with SAX streaming parser, and seeds D1 via wrangler. Parsed JSON stored in `data/parsed/` (gitignored).

**Source revisions:** eBible revises texts at unversioned URLs. `data/sources.lock.json` pins each zip by SHA-256 (`data:download` enforces it; `--refresh` moves the lock to eBible's current revisions), each locked zip is archived as a `source-archive` release asset (`data:archive`, run by the Archive sources workflow), and `translations.source_*` records the revision the stored verses match (`/v1/translations` returns it as `revision`, `null` when unrecorded). Never adopt a new revision in production without reviewing it. [Runbook](docs/runbooks/source-revisions.md).

## Database Schema

```
translations (id, name, language, license, description, source_revision, source_sha256, imported_at, search_id)
books (id, name, testament, book_order, chapters, aliases)
verses (id, translation_id, book_id, chapter, verse, text, text_plain, segments, words)
lexicon (id, language, entry)   -- entry is JSON; id like "G1841", "H7225", "H1254A"
verses_search (contentless FTS5 over text_plain, rowid = canonical position; what /v1/search reads)
```

**Word study:** `data/scripts/tag-words.ts` writes `words` (JSON per verse) into `data/parsed/tcgnt.json` and `wlc.json`, and `data/parsed/lexicon/{grc,he}.json`. Greek aligns tcgnt tokens chapter-by-chapter against Robinson–Pierpont 2018 (byztxt) for Strong's/morphology and STEPBible TAGNT for glosses; Hebrew aligns WLC against STEPBible TAHOT. Pure helpers live in `src/lib/word-tagging.ts`; attribution in `src/lib/word-sources.ts`. Verse queries select explicit columns (never `words`) except the opt-in chapter response. Reports of words the sources could not tag: `data/parsed/*-tagging-report.txt`. Existing databases: `npm run db:migrate:words` then `npm run db:backfill:words` ([runbook](docs/runbooks/word-study-prod-migration.md)).

The `translation_id` defaults to "web" (World English Bible). KJV and WLC (Hebrew OT) are also available.

**WLC search:** Pointed Hebrew display text is stored in `text`; `text_plain` holds unpointed text for FTS5. `src/lib/hebrew.ts` strips diacritics from queries at search time. WLC covers OT books only.

**Query cost:** D1 bills per row read, not per query. A request should read rows in proportion to what it returns: use indexed lookups (`idx_verses_lookup`) and never count or scan the whole `verses` table (~105,000 rows) on a request path. `/v1/health` caches its verse count per isolate for that reason. Search counts at most `SEARCH_RESULT_WINDOW` (1,000) matches and pages no deeper, since D1 bills a row per FTS match read; `verses_search` keeps both to the matches in scope. Bind JavaScript numbers carefully near FTS5: D1 binds them as REAL, and FTS5 ignores a rowid bound that isn't an integer (use `CAST(? AS INTEGER)` or integer SQL arithmetic). Workers Caching (`[cache]` in `wrangler.toml`) serves repeat requests without running the Worker, so a response's `Cache-Control` decides how long it is reused; errors send `no-store`. `src/__tests__/integration/rows-read-budget.test.ts` holds the per-endpoint budgets. Cloudflare's D1 query analytics (GraphQL `d1QueriesAdaptiveGroups`) list rows read per query when you need to find a heavy one.

**Upgrading existing local DBs:** After pulling WLC search changes, run `npm run db:migrate:text-plain` before `npm run data:validate`. After pulling the keyed search index, run `npm run db:migrate:search-index` (search and `db:seed` need it).

**Upgrading an existing production D1 (WLC rollout):** Migrate the schema (`npm run db:migrate:text-plain -- --remote`) *before* seeding WLC — the `text_plain` column must exist first. The API is read-only, so WEB/KJV search stays up throughout. Full step-by-step (preconditions, verification, rollback): [`docs/runbooks/wlc-prod-migration.md`](docs/runbooks/wlc-prod-migration.md).

## Updating a translation

Re-seeding never changes an existing verse (`db:seed` is `INSERT OR IGNORE`). Moving a translation to its current upstream source (a new eBible revision, a parser fix, or re-tagging) goes through `db:backfill:words`:

1. **Get the current source.** `npm run data:download -- --refresh` downloads eBible's current revisions and moves `data/sources.lock.json` to them, printing each change (commit the lock only for a revision you're proposing; pushing it archives the zip). After bumping a pinned word-source commit in `download-sources.ts`, delete the matching `data/sources/words/` files first.
2. **Rebuild.** `npm run data:parse`, then `npm run data:tag`. `tcgnt` and `wlc` must always be re-tagged, because their `words` are aligned to the exact text that gets stored. Then `npm run test:run`.
3. **Dry run against production.** `npm run db:backfill:words -- --remote --dry-run --translations=web` (only the translations you're moving; each reads all its verses). Per translation it reports parser fixes (stored text equals the old parser's output), verses on a different upstream revision, word rows to write, and the source revision it would record. Other-revision verses are left alone in untagged translations and abort tagged ones.
4. **Adopt** only the translations whose revision the user approved: `npm run db:backfill:words -- --remote --translations=web --adopt-revision=web` (comma-separate several ids). Once every stored verse matches the locked zip, the backfill records its revision on the `translations` row (`source_revision`, `source_sha256`, `imported_at`; `/v1/translations` shows it as `revision`). Then deploy a new Worker version (retry the latest Workers Builds build, or `npm run deploy` from an up-to-date `main`) so Workers Caching drops cached chapters and search results, which otherwise live up to 30 days: the cache is per version, so rolling back to an existing version doesn't clear it; then check a changed verse on the live API and `SELECT id, source_revision FROM translations`. Don't repeat the dry run just to see `Total writes: 0`: that's another full read.

Gotchas:

- **Production reads cost money.** D1 bills per row read. A dry run or backfill reads every verse once (about 120,000 rows), and so does any ad-hoc full-table query against production (`COUNT(*) FROM verses`, a whole-translation `SELECT`). Plan the runs, don't loop them. On 2026-09-24, repeated dry runs pushed the account past the free plan's 5 million rows/day, and every endpoint returned 503 until the account moved to Workers Paid.
- The backfill aborts if a translation's verse count changed. Added or removed verses aren't handled yet.
- The backfill refuses to run unless `data/parsed/` was parsed from the zips in `data/sources.lock.json`, and it needs the `translations.source_*` columns (`npm run db:migrate:sources`).
- Remote runs need `CLOUDFLARE_API_TOKEN` with D1 edit. In Claude Code cloud sessions the environment's credential proxy injects the real token: set `CLOUDFLARE_API_TOKEN` to any placeholder and add `NODE_USE_ENV_PROXY=1`. Never ask for the token in chat. Ask the user before any write to production D1.
- Don't bulk-write with `wrangler d1 execute --remote --file`: it uses D1's import path, which makes the database unavailable while each file imports. The backfill calls the query API instead.
- Details and history: [word study runbook](docs/runbooks/word-study-prod-migration.md). Plan for detecting and reviewing revisions automatically: [`docs/design/source-revisions.md`](docs/design/source-revisions.md).

## Git & Deployment Workflow

**Important:** This repository deploys automatically to Cloudflare on push to `main`.

### Deployment

- **Merging to `main` is the deploy.** Cloudflare Workers Builds, connected to this GitHub repository, builds and deploys the `bible-api` Worker from each push to `main`, usually within a minute. GitHub Actions never deploy: `CI` runs the typecheck and tests, and `Archive sources` uploads locked source zips.
- **Check that it landed** on the live API, e.g. a field or endpoint the change adds. Build logs and deployments are in the Cloudflare dashboard under Workers & Pages → `bible-api`.
- **D1 is never touched by a deploy.** Schema migrations, seeds and backfills run by hand against production (`npm run db:… -- --remote`, which use wrangler or D1's query API) with the user's approval. If the new Worker needs a column or table, migrate *before merging*. If the migration is inert without the new Worker, either order works.
- **`npm run deploy`** (`wrangler deploy`) is a manual fallback, for example when Workers Builds is down, and the way to deploy a self-hosted copy. It deploys your working tree unreviewed, so prefer merging.
- **Rolling back:** Cloudflare can restore the previous deployment at once (dashboard → Deployments, or `npx wrangler rollback`). Then revert the change on `main`, or the next merge deploys it again.

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
