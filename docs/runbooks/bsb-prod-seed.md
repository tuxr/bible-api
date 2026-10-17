# BSB production seed

This runbook seeds the Berean Standard Bible (public domain) as the `bsb` translation: 66 books, 31,086 verses, no Apocrypha, no word-study tags. Existing translations are untouched.

> **Source.** BSB was first seeded (2026-10-17) from eBible's `engbsb`, which has no words-of-Jesus markup. It now comes from the publisher's own USFM release (`bsb_usfm.zip`), which marks them (2,047 verses) and carries the current printing's wording. Moving an already-seeded database to it is a revision adoption, below; a fresh seed follows the steps here as they are.

## Order

The Worker needs no code change to serve `bsb`: `/v1/translations`, verses, chapters and search all read the `translations` row and its `search_id`. So seed first, then merge the PR. Merging deploys a new Worker version, and Workers Caching is per version, so the deploy also drops any cached `/v1/translations` that predates the seed.

Ask the user before running the seed: it writes to production D1.

## Preconditions

Confirm BSB isn't seeded yet. This reads one row per translation, not the verses:

```bash
npx wrangler d1 execute bible-db --remote \
  --command "SELECT id, search_id FROM translations"
```

Expect `web`, `kjv`, `wlc` and `tcgnt` with search ids 1–4, and no `bsb`. If `bsb` is there, check its verse count with `SELECT COUNT(*) FROM verses WHERE translation_id = 'bsb'` (31,086 rows read) before going on.

## Seed and validate

```bash
npm run data:download
npm run data:parse
CLOUDFLARE_API_TOKEN=… npm run db:seed -- --production --only bsb
npm run data:validate -- --remote
```

`--only bsb` writes the BSB translation row and its verses, and skips the other translations and the lexicons. Production writes go through D1's query API in batches under 90 KB, so the database stays available throughout (unlike `wrangler d1 execute --remote --file`). In Claude Code cloud sessions set `CLOUDFLARE_API_TOKEN` to any placeholder and add `NODE_USE_ENV_PROXY=1`; the credential proxy injects the real token.

The translation row is written before the verses, so a seed that fails partway advertises `bsb` with partial coverage. Re-run the same command: verse inserts are `INSERT OR IGNORE`.

`data:validate -- --remote` reads every verse once (about 150,000 rows). Run it once.

## Smoke test

After the merge deploys:

```bash
curl -s "https://bible-api.dws-cloud.com/v1/translations"
curl -s "https://bible-api.dws-cloud.com/v1/verses/John%203:16?translation=bsb"
curl -s "https://bible-api.dws-cloud.com/v1/search?q=shepherd&translation=bsb"
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://bible-api.dws-cloud.com/v1/verses/Tobit%201:1?translation=bsb"
curl -s "https://bible-api.dws-cloud.com/v1/verses/John%203:16"
```

Success: `bsb` is listed with revision `2026-10-13`, John 3:16 reads "For God so loved the world that He gave His one and only Son…", search returns BSB verses, Tobit returns 404, and the default (`web`) is unchanged.

## Rollback

```bash
npx wrangler d1 execute bible-db --remote \
  --command "DELETE FROM verses WHERE translation_id='bsb'"
npx wrangler d1 execute bible-db --remote \
  --command "DELETE FROM translations WHERE id='bsb'"
```

Deleted verses leave `verses_search` through its `verses_search_ad` trigger. Redeploy the Worker afterwards so cached responses that list `bsb` are dropped. Keep `bsb: 5` in `SEARCH_IDS` even after a rollback: search ids are never reused.

## Moving to the publisher's source (words of Jesus)

A database seeded from eBible's `engbsb` moves to `bsb_usfm.zip` like any other revision ([source revisions](source-revisions.md)). The verse set is the same (31,086 verses), so `db:backfill:words` handles it:

```bash
npm run data:download
npm run data:parse
CLOUDFLARE_API_TOKEN=… npm run db:backfill:words -- --remote --dry-run --translations=bsb
CLOUDFLARE_API_TOKEN=… npm run db:backfill:words -- --remote --translations=bsb --adopt-revision=bsb
```

The dry run against the eBible seed reports 2,216 verse texts to update (the publisher's current printing: wording such as Genesis 1:21's "every winged bird", and closed-up em dashes) and 1,768 words-of-Jesus markups on otherwise unchanged text. Without `--adopt-revision=bsb` it writes nothing and lists both. Each run reads every BSB verse once (31,086 rows). Ask the user before the adopting run: it writes to production D1.

Then deploy a new Worker version so Workers Caching drops cached BSB chapters, and check John 3 (`/v1/chapters/John/3?translation=bsb&segments=1` marks 17 verses), Genesis 1:21, and `/v1/translations` (`bsb` at revision `2026-10-02`).

Psalm titles stay out of verse 1, as in eBible's BSB, though the publisher's `bsb.txt` prints them there.
