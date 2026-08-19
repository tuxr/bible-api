# TCGNT production seed

This runbook seeds the Robinson–Pierpont Byzantine Textform 2018 (eBible TCGNT) as the opt-in `tcgnt` translation. It is New Testament only; the default WEB translation remains unchanged.

## Prerequisites

- Merge and deploy the worker change to `main` first (or deploy it with the seed). Until the translation row exists, `translation=tcgnt` correctly returns 404.
- Do **not** run `npm run db:migrate:text-plain` for this rollout. `text_plain` already exists. A later rerun does not overwrite TCGNT's folded Greek `text_plain`, but it remains unnecessary.

Confirm that TCGNT is not already completely seeded:

```bash
npx wrangler d1 execute bible-db --remote \
  --command "SELECT translation_id, COUNT(*) FROM verses GROUP BY translation_id"
```

Expect `web`, `kjv`, and `wlc`, with no `tcgnt`. If `tcgnt` already has at least 7,900 rows, stop.

## Seed and validate

```bash
npm run data:download
npm run data:parse
npm run db:seed -- --production
npm run data:validate -- --remote
```

`seed-d1.ts` writes the translation row before verse batches. A failed or in-progress seed can therefore advertise TCGNT in `/v1/translations` while coverage is partial. Retry the seed immediately; its verse inserts are idempotent. Do not announce TCGNT availability until `data:validate -- --remote` passes the TCGNT floor (at least 7,900 verses).

## Rollout checks and cache observation

Before smoke testing, inspect `Cf-Cache-Status` and applicable zone Cache Rules. The worker does not enable Workers Cache in `wrangler.toml`; do not assume Cloudflare edge caching is active merely from response cache headers. Browser and intermediary caching still applies. If an edge cache rule is active, purge `/v1/translations` after a successful seed.

```bash
curl -s -D - -o /dev/null "https://bible-api.dws-cloud.com/v1/translations" | grep -i '^cf-cache-status:'
curl -s "https://bible-api.dws-cloud.com/v1/translations"
curl -s "https://bible-api.dws-cloud.com/v1/verses/John%203:16?translation=tcgnt"
curl -s "https://bible-api.dws-cloud.com/v1/search?q=%CE%BA%CF%8C%CF%83%CE%BC%CE%BF%CE%BD&translation=tcgnt"
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://bible-api.dws-cloud.com/v1/verses/Genesis%201:1?translation=tcgnt"
curl -s "https://bible-api.dws-cloud.com/v1/verses/John%203:16"
curl -s "https://bible-api.dws-cloud.com/v1/search?q=love&translation=web"
```

Success requires: TCGNT count at least 7,900; polytonic, tag-free John 3:16; TCGNT Genesis 1:1 returns 404; and default WEB verse/search behavior remains intact.

## Rollback

WEB, KJV, and WLC are untouched.

```bash
npx wrangler d1 execute bible-db --remote \
  --command "DELETE FROM verses WHERE translation_id='tcgnt'"
npx wrangler d1 execute bible-db --remote \
  --command "DELETE FROM translations WHERE id='tcgnt'"
```

If FTS is unexpectedly wrong after deletion, rebuild the existing external-content index:

```bash
npx wrangler d1 execute bible-db --remote \
  --command "INSERT INTO verses_fts(verses_fts) VALUES('rebuild')"
```
