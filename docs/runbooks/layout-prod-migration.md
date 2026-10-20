# Layout production migration

This rollout stores each verse's layout (paragraphs, poetry lines, section headings, Psalm titles, stanza breaks) and serves it under `layout=1` on `/v1/chapters`. It also takes two kinds of label out of stored `web` verse text, which the parser now sets as layout instead:

- Psalm 119's acrostic letters: 119:8 ended "…forsake me. BETH" (21 verses).
- Song of Songs speaker labels: 1:4 read "…into his rooms. Friends We will be glad…" (27 verses).

Default responses keep their shape. Only the text of those 48 `web` verses changes.

## Order

The new Worker selects `verses.layout` under `layout=1`, so the column must exist before it deploys, and the layout should be in place before any `layout=1` response is cached. Run everything below, then merge: merging to `main` deploys the new Worker (Workers Builds), and a new version starts with an empty Workers Caching cache, which also drops cached copies of the 48 old `web` texts.

1. Build the data from the locked sources:

   ```bash
   npm run data:download
   npm run data:parse
   npm run data:tag
   ```

2. Add the column. It reads no verse rows and is inert until the new Worker is deployed:

   ```bash
   npm run db:migrate:layout -- --remote
   ```

3. Fix the 48 `web` verse texts. `db:backfill:words` counts them as parser fixes (each stored text equals the old parser's output) and, now that the column exists, writes their layout in the same statement:

   ```bash
   npm run db:backfill:words -- --remote --translations=web --dry-run
   npm run db:backfill:words -- --remote --translations=web
   ```

4. Write every other layout. The backfill writes a layout only where the stored text equals the parse, and reports any verse it skips:

   ```bash
   npm run db:backfill:layout -- --remote --dry-run
   npm run db:backfill:layout -- --remote
   ```

5. Merge the PR, then check the live API (below).

Remote runs call D1's query API directly (`CLOUDFLARE_API_TOKEN` with D1 edit, account and database ids from `wrangler.toml`) in batches under 90 KB. Behind an HTTPS proxy (Claude Code cloud sessions), add `NODE_USE_ENV_PROXY=1`.

## Cost

D1 bills per row read and written. Each run of step 3 reads the `web` verses once (about 37,500 rows); each run of step 4 reads every verse once (about 137,000 rows), dry runs included. Writing `layout` doesn't re-index a verse: the search index's update trigger watches only the key columns and `text_plain`. Step 3 rewrites `text_plain` for its 48 verses, which re-indexes those.

Both backfills are idempotent: a second run reports `Total writes: 0`. Don't repeat a dry run just to see that.

A layout dry run works before step 2: it reads every stored layout as empty. The production dry runs on 2026-10-20, before any write, reported:

| | rows read | rows to write |
| --- | --- | --- |
| step 3, `web` text fixes | 37,499 | 48 verses (Psalm 119 ×21, Song of Songs ×27) |
| step 4, layouts | 136,574 | 53,713 (web 17,531, kjv 12,801, bsb 20,617, tcgnt 1,835, wlc 929) |

Step 4's dry run also listed the 48 `web` verses as skipped (stored text differs), which step 3 writes with their layout. A local rehearsal from production's shape (no column, the 48 old texts) ran steps 2 to 4 to the same numbers.

## Verify

```bash
curl -s "https://bible-api.dws-cloud.com/v1/chapters/Psalms/23?translation=bsb&layout=1" | jq '.verses[0]'
curl -s "https://bible-api.dws-cloud.com/v1/chapters/Psalms/119?translation=web" | jq -r '.verses[7].text'   # no trailing "BETH"
curl -s "https://bible-api.dws-cloud.com/v1/chapters/Psalms/23?translation=bsb" | jq '.verses[0] | keys'     # ["text","verse"]: default unchanged
```

## Rollback

The column is additive: rolling back the Worker (dashboard → Deployments, or `npx wrangler rollback`) stops serving it, and old Workers never select it. The 48 `web` text fixes can be reverted from the legacy parse if ever needed, but the old texts were wrong.
