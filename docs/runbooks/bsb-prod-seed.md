# BSB production seed

This runbook seeds the Berean Standard Bible (eBible `engbsb`, public domain) as the `bsb` translation: 66 books, 31,086 verses, no Apocrypha. It has no words-of-Jesus markup (`segments` stay `NULL`) and no word-study tags. Existing translations are untouched.

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
