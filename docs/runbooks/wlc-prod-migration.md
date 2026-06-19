# Runbook: WLC (Hebrew) Production Rollout

**Audience:** operator/agent executing the WLC rollout against production Cloudflare D1.
**Scope:** one-time migration. Adds the `text_plain` column, repoints FTS5 at it, and seeds the Westminster Leningrad Codex (`wlc`) into the live database.
**Estimated time:** ~10–15 min (mostly the WLC seed).

---

## Why this exists

WLC search is keyed on **unpointed** Hebrew. The schema stores pointed display
text in `verses.text` and unpointed text in `verses.text_plain`, and the FTS5
index (`verses_fts`) is built on `text_plain`. Existing production rows
(WEB/KJV) predate the `text_plain` column, so the column must be added and FTS
rebuilt **before** any WLC data is loaded.

**The one rule that matters:** migrate the schema/FTS *before* seeding WLC.
Seeding first fails — the seed INSERT references a `text_plain` column that does
not yet exist on prod.

---

## Preconditions

- [ ] PR #10 is merged to `main` and the worker auto-deploy has completed.
      (The API is read-only, so WEB/KJV search keeps serving throughout this
      runbook — WLC is simply absent until Step 3.)
- [ ] Repo checked out at the root, dependencies installed: `npm install`.
- [ ] Cloudflare credentials available to wrangler with **write** access to the
      `bible-db` D1 database (e.g. `CLOUDFLARE_API_TOKEN` /
      `CLOUDFLARE_ACCOUNT_ID` in the environment, or `wrangler login`).
- [ ] Confirm wrangler can reach the remote DB before changing anything:

  ```bash
  npx wrangler d1 execute bible-db --remote \
    --command "SELECT translation_id, COUNT(*) FROM verses GROUP BY translation_id"
  ```

  Expect rows for `web` and `kjv`, and **no** `wlc` row. If `wlc` already has
  ~23k rows, the rollout was already done — stop.

---

## Step 1 — Migrate schema + FTS (remote)

```bash
npm run db:migrate:text-plain -- --remote
```

This is idempotent. It:
1. Adds `text_plain` if missing (`ALTER TABLE verses ADD COLUMN text_plain TEXT NOT NULL DEFAULT ''`).
2. Backfills `text_plain = text` for non-WLC rows.
3. Drops and recreates `verses_fts` + its triggers to index `text_plain`, then rebuilds.

**Expected output (WLC not seeded yet):**

```
text_plain migration (remote/production D1)
...
Adding text_plain column...
Backfilling text_plain for non-WLC translations...
Backfilling WLC text_plain (strip diacritics)...
Rebuilding FTS index...

No WLC verses present yet — skipping Hebrew FTS check (seed WLC, then re-run validation).

✓ Migration complete
```

The skipped Hebrew FTS check is **expected and correct** here — there is no WLC
data to match yet. Do not treat it as a failure.

> Brief window: while the FTS table is dropped and rebuilt (a few seconds),
> `/v1/search` may return empty results. Verse/chapter lookups are unaffected.

**Verify English search still indexed:**

```bash
npx wrangler d1 execute bible-db --remote \
  --command "SELECT COUNT(*) FROM verses_fts WHERE verses_fts MATCH 'love'"
```

Expect a non-zero count.

---

## Step 2 — Fetch + parse WLC source

```bash
npm run data:download
npm run data:parse
```

`data:download` pulls all configured translations (WEB/KJV/WLC) from ebible.org;
only WLC is new. `data:parse` writes JSON to `data/parsed/` (gitignored).

**Verify the WLC parse produced data:**

```bash
ls -la data/parsed/ | grep -i wlc
```

Expect a `wlc` parsed JSON file. WLC is OT-only (~23k verses, 39 books).

---

## Step 3 — Seed WLC into production

```bash
npm run db:seed -- --production
```

The seed computes `text_plain` per row (unpointed Hebrew for WLC; identical to
`text` for English). Existing WEB/KJV rows are skipped via
`INSERT OR IGNORE` + the `UNIQUE(translation_id, book_id, chapter, verse)`
constraint, so re-seeding them is a safe no-op. Only WLC rows are added.

---

## Step 4 — Verify on production

`npm run data:validate` only checks the **local** DB, so verify remote directly:

```bash
# WLC verse count — expect ~23,213
npx wrangler d1 execute bible-db --remote \
  --command "SELECT COUNT(*) FROM verses WHERE translation_id='wlc'"

# Hebrew FTS (unpointed query) — expect >= 1
npx wrangler d1 execute bible-db --remote \
  --command "SELECT COUNT(*) FROM verses_fts WHERE verses_fts MATCH 'בראשית'"

# WLC translation registered
npx wrangler d1 execute bible-db --remote \
  --command "SELECT id, name, language FROM translations WHERE id='wlc'"
```

**Live API smoke test** (against the deployed worker):

```bash
# Pointed Hebrew display text for Genesis 1:1
curl -s "https://bible-api.dws-cloud.com/v1/verses/Genesis%201:1?translation=wlc"

# Hebrew search returns Genesis 1:1
curl -s "https://bible-api.dws-cloud.com/v1/search?q=%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA&translation=wlc"

# NT book is 404 under WLC (OT-only)
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://bible-api.dws-cloud.com/v1/verses/John%203:16?translation=wlc"   # expect 404

# Regression: English search still works
curl -s "https://bible-api.dws-cloud.com/v1/search?q=love&translation=web"
```

**Done when:** WLC count ≈ 23,213, Hebrew FTS returns ≥ 1, the WLC verse curl
returns Hebrew text, the NT curl returns 404, and English search is unaffected.

---

## Rollback

The migration is additive and the API is read-only, so risk is low. If something
looks wrong:

- **Remove WLC entirely** (deletes rows; triggers clean the FTS index):

  ```bash
  npx wrangler d1 execute bible-db --remote \
    --command "DELETE FROM verses WHERE translation_id='wlc'"
  npx wrangler d1 execute bible-db --remote \
    --command "DELETE FROM translations WHERE id='wlc'"
  ```

  WEB/KJV are untouched and keep working.

- **FTS looks corrupt / search empty** — rebuild the index from content:

  ```bash
  npx wrangler d1 execute bible-db --remote \
    --command "INSERT INTO verses_fts(verses_fts) VALUES('rebuild')"
  ```

- The `text_plain` column itself does not need rollback — it is backfilled from
  `text` for English and is harmless to existing reads. Leave it in place.
