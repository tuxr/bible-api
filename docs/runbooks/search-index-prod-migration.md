# Runbook: keyed search index (`verses_search`) in production

**Audience:** operator/agent building the search index in production Cloudflare D1.
**Scope:** one-time, additive migration. Adds `translations.search_id`, two small indexes, the contentless FTS5 table `verses_search` and its triggers, then indexes every verse. `verses_fts` is left untouched.
**Estimated time:** about 5 minutes, most of it wrangler start-up (one call per statement).
**Needs the user's go-ahead before Step 2.** Nothing before Step 2 writes to production.

---

## Why this exists

`/v1/search` read about 1,666 rows per call (2.72M rows across 1,632 calls on 2026-09-24). D1 bills a row for every FTS5 match it reads. `verses_fts` covers all four translations with `rowid = verses.id`, so every search:

- read the other translations' matches too, and threw them away;
- sorted every match to return one page, because ids aren't in canonical order;
- did both of those twice, once for the count and once for the page.

In `verses_search` the rowid is the verse's canonical position:

```
search_id · 10^8 + book_order · 10^6 + chapter · 10^3 + verse
```

A translation, book or testament is therefore one rowid range, and matches come back already in order. The count reads at most 1,001 matches in scope, and the page reads offset + limit. Measured on a full local copy (105,488 verses), with identical results in 32 of 32 comparison cases:

| Query | Before | After |
|---|---|---|
| `love` / web | 3,919 | 458 |
| `light` / web, book=JHN | 3,473 | 98 |
| `אלהים` / wlc | 4,438 | 723 |
| `the` / web (capped total) | 230,066 | 1,089 |
| `the` / kjv, offset 980 | 173,072 | 2,069 |

**The one rule that matters:** build the index *before* the code that uses it deploys. `main` auto-deploys, so run this runbook before merging the PR that switches search to `verses_search`. If that code deploys first, every search returns 503 (`no such table: verses_search`) until this runs.

---

## Preconditions

- [ ] **No other writes to production D1 are running.** Examples: another migration, a `db:backfill:words` run, a re-seed. On 2026-09-25 a translation update was in progress: wait for it to finish, including its redeploy.
- [ ] **The account is on Workers Paid.** The fill writes one row per verse, about 105,000, and the free plan allows 100,000 writes a day. On the free plan the last translation's fill fails; running the script again the next day resumes it, since translations already indexed are skipped.
- [ ] **`books` in production matches `src/lib/books-data.ts`.** The script checks this first and stops before writing anything if it doesn't (86 rows read). If the other agent changed book order, merge that into `books-data.ts` first.
- [ ] **Credentials.** `CLOUDFLARE_API_TOKEN` with D1 edit access. In Claude Code cloud sessions, set it to any placeholder and add `NODE_USE_ENV_PROXY=1`: the credential proxy injects the real token. Never paste the token into chat.
- [ ] The repo is checked out at the branch that adds `data/scripts/migrate-search-index.ts`, with `npm ci` done.

Don't use `npm run db:schema` for this. It applies `schema.sql` through the import path (`--file`), which makes the database unavailable while it runs, and it can't add the `search_id` column to the existing `translations` table.

---

## Step 1: rehearse locally

```bash
npm run db:migrate:search-index            # against .wrangler (local D1)
npm run test:run
```

Expect `books: 86 rows match books-data`. Each translation should show equal verse and index counts, and matching sample counts between `verses_fts` and `verses_search`. Running the script a second time should change nothing.

## Step 2: build the index in production (needs go-ahead)

```bash
NODE_USE_ENV_PROXY=1 CLOUDFLARE_API_TOKEN=placeholder npm run db:migrate:search-index -- --remote
```

In order, the script:

1. Checks `books` against `books-data` (book order, testament, testaments contiguous). **If this fails, it stops before writing.**
2. Adds `translations.search_id` if missing, and sets web=1, kjv=2, wlc=3, tcgnt=4 where it's NULL.
3. Creates `idx_translations_search_id`, `idx_books_testament_order`, `verses_search`, the guard triggers and the sync triggers. Each uses `IF NOT EXISTS`. From this point, every verse write also updates `verses_search`.
4. Indexes each translation with one `INSERT … SELECT` statement, skipping verses already indexed.
5. Verifies:
   - for each translation, the `verses` count equals the rows in its `verses_search` range;
   - a sample word matches as many verses in `verses_search` as in `verses_fts`.

   It stops with an error on any mismatch.

**Expected output** (the counts are production's, so they may differ):

```
books: 86 rows match books-data
Added translations.search_id
kjv: search_id 2
…
Indexes, verses_search and triggers exist
kjv: indexed 36822 new verses (110468 rows read, 36822 written)
tcgnt: indexed 7954 new verses (…)
web: indexed 37499 new verses (…)
wlc: indexed 23213 new verses (…)
kjv: 36822 verses, 36822 indexed (…)
kjv: "grace" matches 180 in verses_fts, 180 in verses_search (…)
…
Done. ≈530000 rows read in total.
```

**Cost:** about 316,000 rows read and 105,000 written to fill, plus about 211,000 read to verify. `--skip-verify` leaves the verification out. On Workers Paid that's well within the included allowance. Don't loop the script: each extra run re-reads about 316,000 rows, finds nothing to add and writes nothing.

## Step 3: deploy the code

Merge the PR that switches `searchVerses` to `verses_search`. `main` auto-deploys, and each deploy starts with an empty Workers Cache.

## Step 4: verify on the live API

```bash
curl -s 'https://bible-api.dws-cloud.com/v1/search?q=love&translation=web' | jq '{total, total_capped, first: .results[0].reference}'
curl -s 'https://bible-api.dws-cloud.com/v1/search?q=the&translation=web' | jq '{total, total_capped}'
curl -s 'https://bible-api.dws-cloud.com/v1/search?q=light&translation=web&book=JHN' | jq '.total'
```

Expected:
- `love` gives `369`, `false`, `Genesis 22:2` (the local copy's numbers: compare with the same request before the deploy);
- `the` gives `1000`, `true`;
- `light` in John gives `16`.

The next day, compare D1 query analytics (GraphQL `d1QueriesAdaptiveGroups`, rows read per query) with 2026-09-24's 1,666 rows per search call.

---

## Rollback

- **The code:** revert the PR and let `main` redeploy. The previous search uses `verses_fts`, which the migration never touched and which its own triggers keep current.
- **The schema:** only needed if the new triggers get in the way, for example of a bulk write. The table and triggers can simply be left in place otherwise. Run each statement with `npx wrangler d1 execute bible-db --remote --command "…"`:

  ```sql
  DROP TRIGGER IF EXISTS verses_search_ai;
  DROP TRIGGER IF EXISTS verses_search_ad;
  DROP TRIGGER IF EXISTS verses_search_au;
  DROP TRIGGER IF EXISTS verses_search_guard_insert;
  DROP TRIGGER IF EXISTS verses_search_guard_update;
  DROP TRIGGER IF EXISTS verses_search_book_order;
  DROP TRIGGER IF EXISTS verses_search_search_id;
  DROP TABLE IF EXISTS verses_search;
  ```

  `translations.search_id` and the two indexes are harmless to leave.

---

## After it's live

- **Adding a translation:** give it a new number in `SEARCH_IDS` (`src/lib/search-index.ts`) before seeding. `db:seed` sets `search_id`, and the guard trigger rejects verses for a translation without one. Never renumber an existing translation.
- **Changing a book's order:** the `verses_search_book_order` trigger refuses it, because every key would change. Rebuilding means dropping the table and re-running this runbook.
- **Dropping `verses_fts`:** after a week or so of clean running, `verses_fts` and its triggers (`verses_ai`, `verses_ad`, `verses_au`) can be dropped. That saves storage and a second index write per verse, but gives up the instant code rollback. It's a separate change and needs its own go-ahead.
