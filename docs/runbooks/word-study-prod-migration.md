# Word study production migration

This rollout adds opt-in word tags (`/v1/chapters/...?words=1`) for `tcgnt` and `wlc`, the `/v1/lexicon` endpoints, and two verse-text fixes:

- USFX section headings (`\s`) no longer leak into the previous verse (629 `tcgnt` verses such as Luke 9:27 "… τοῦ Θεοῦ. The Transfiguration"; 37 `kjv` verses: the Psalm 119 acrostic headings, the Pauline subscriptions such as "Written to the Romans from Corinthus…", and two editorial notes in Greek Esther).
- Escaped markup no longer leaks into 10 `wlc` verses with large, small or suspended letters (Deut 6:4 read `'l s="H8085"'שְׁמַ֖'seg type="x-large"'ע…`).

Default responses keep their shape. Only the text of the affected verses changes.

## Before rollout

1. Check live cache behaviour as in the [segments runbook](segments-prod-migration.md). The chapter query string, `words=1` included, is part of the URL and therefore of any cache key. If an edge cache is active, plan to purge the affected `tcgnt`, `kjv` and `wlc` chapter and verse URLs after the text fix.
2. Build the data:

   ```bash
   npm run data:download   # also fetches the pinned word sources into data/sources/words/
   npm run data:parse
   npm run data:tag        # writes words into tcgnt.json/wlc.json and data/parsed/lexicon/*.json
   ```

   `data:tag` prints a summary and writes `data/parsed/tcgnt-tagging-report.txt` and `wlc-tagging-report.txt`, which list the words the sources could not tag.
3. Run the test suite.

## Migrate and backfill

The old Worker ignores the new column and table, so migrate and backfill before deploying.

```bash
npm run db:migrate:words -- --remote     # add verses.words, create lexicon, scope the FTS update trigger
npm run db:backfill:words -- --remote
```

The migration also recreates the `verses_au` trigger as `AFTER UPDATE OF text_plain`. The FTS index covers only `text_plain`, and the old unscoped trigger would delete and re-insert the index entry of every verse the backfill touches. With the scoped trigger the backfill writes roughly 47,000 rows (31,167 `words` updates, 676 text fixes that also re-index, about 15,000 lexicon rows). That fits within D1's free-plan limit of 100,000 rows written per day. If the limit interrupts it, re-run the next day: it picks up where it stopped.

The backfill:

- compares every parsed verse with its stored row. It aborts without writing a translation's rows if a stored text differs by anything other than removed words (headings or markup), or if verse counts differ;
- updates `text`, `text_plain` (the FTS triggers re-index) and `segments` for the fixed verses, writes `words` where it differs, and upserts changed lexicon rows;
- writes through `--file` batches (a `words` UPDATE can be several KB) and is idempotent: a second run reports `Total writes: 0`.

Verify:

```bash
npx wrangler d1 execute bible-db --remote --command "SELECT text, length(words) FROM verses WHERE translation_id='tcgnt' AND book_id='LUK' AND chapter=9 AND verse=27"
npx wrangler d1 execute bible-db --remote --command "SELECT language, COUNT(*) FROM lexicon GROUP BY language"
npx wrangler d1 execute bible-db --remote --command "SELECT translation_id, COUNT(*) FROM verses WHERE words IS NOT NULL GROUP BY translation_id"
```

Expect Luke 9:27 to end at "τοῦ Θεοῦ.", about 5,500 `grc` and 9,400 `he` lexicon rows, all 7,954 `tcgnt` rows tagged and all 23,213 `wlc` rows tagged.

## Deploy and smoke test

```bash
npm run deploy
curl -s 'https://bible-api.dws-cloud.com/v1/chapters/Luke/9?translation=tcgnt' | head -c 300          # no words key
curl -s 'https://bible-api.dws-cloud.com/v1/chapters/Luke/9?translation=tcgnt&words=1' | head -c 600
curl -s 'https://bible-api.dws-cloud.com/v1/chapters/Genesis/1?translation=web&words=1' | head -c 300  # normal payload
curl -s 'https://bible-api.dws-cloud.com/v1/lexicon/G1841'
curl -s 'https://bible-api.dws-cloud.com/v1/lexicon?ids=G1841,H7225'
```

## Rollback

Revert the Worker first. The column and table are inert without it. To remove the data:

```bash
npx wrangler d1 execute bible-db --remote --command "UPDATE verses SET words = NULL WHERE words IS NOT NULL"
npx wrangler d1 execute bible-db --remote --command "DROP TABLE IF EXISTS lexicon"
```

The text fixes are corrections and don't need reverting. If they must be, re-run the backfill from a checkout without the parser fix.
