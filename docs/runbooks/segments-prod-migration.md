# Red-letter segments production migration

This migration adds an opt-in `segments` field for USFX `<wj>` (words of Jesus) without changing default verse or chapter responses.

## Before rollout

1. Check live cache behavior and record it in the change ticket:

   ```bash
   curl -sSI https://bible-api.dws-cloud.com/v1/verses/John%203:16 | grep -i cf-cache-status
   ```

   Inspect Workers Cache configuration and zone Cache Rules. Do not assume Cloudflare edge caching is enabled. If a cache is active, confirm query strings participate in the cache key and prepare its purge command. Do not pre-prime `?segments=1` before data is ready.
2. Parse the source data and ensure `data/parsed/web.json` and `data/parsed/kjv.json` are current. `tcgnt.json` is included automatically when present.
3. Run the test suite before proceeding.

## Migrate and backfill

The old Worker safely ignores the new column. Migrate and backfill before deploying the Worker that exposes the opt-in response.

```bash
npm run db:migrate:segments -- --remote
npm run db:backfill:segments -- --remote
```

The backfill compares every parsed verse text with its stored row before it writes any spans for a translation. It aborts and reports references on any mismatch. It updates only verses containing Jesus segments, uses bounded batches, and skips JSON already stored; a second successful run should report zero updated rows.

Verify a known marked and unmarked row:

```bash
npx wrangler d1 execute bible-db --remote --command "SELECT book_id, chapter, verse, length(segments) FROM verses WHERE translation_id='web' AND book_id='JHN' AND chapter=3 AND verse=16"
npx wrangler d1 execute bible-db --remote --command "SELECT segments FROM verses WHERE translation_id='web' AND book_id='GEN' AND chapter=1 AND verse=1"
```

## Deploy and smoke test

Deploy only after a successful backfill. If an edge cache is active, purge the affected URLs after deploy.

```bash
npm run deploy
curl -s https://bible-api.dws-cloud.com/v1/verses/John%203:16
curl -s 'https://bible-api.dws-cloud.com/v1/verses/John%203:16?segments=1'
curl -s 'https://bible-api.dws-cloud.com/v1/verses/John%203:16,%20John%203:17?segments=1'
```

Confirm the default response has no `segments` key, the opt-in response has segment text concatenating exactly to `verse.text`, and comma-separated references preserve marked spans. Search and random endpoints remain unmarked.

## Rollback

Revert the Worker first if necessary, then remove stored values without touching narrator-only rows:

```bash
npx wrangler d1 execute bible-db --remote --command "UPDATE verses SET segments = NULL WHERE segments IS NOT NULL"
```

The nullable column may remain in place.
