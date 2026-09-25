# Source revisions

eBible serves only the latest revision of each text, at an unversioned URL, and revises texts without notice. `data/sources.lock.json` pins the revision each translation is built from, every locked zip is archived, and each `translations` row records the revision its stored verses match.

## The lock file

One entry per translation:

| Field | Meaning |
| --- | --- |
| `file`, `url` | Zip name in `data/sources/` and eBible's download URL |
| `revision` | eBible's revision date: the newest file in the zip, UTC (`YYYY-MM-DD`) |
| `sha256`, `bytes` | The zip's identity |
| `usfxSha256` | SHA-256 of the USFX XML inside; equal across two zips means eBible re-zipped the same text |
| `archive` | Archived copy of exactly these bytes |

The word-tagging sources (byztxt, STEPBible, Strong's) are pinned to commits in `data/scripts/download-sources.ts` and aren't in the lock.

## Downloading

```bash
npm run data:download               # the locked revisions
npm run data:download -- --refresh  # eBible's current revisions; rewrites the lock
```

`data:download` keeps a zip on disk only if its SHA-256 matches the lock. Any other zip moves to `data/sources/archive/`, named `<file>-<revision>-<sha8>.zip`: it may be the only copy of an older revision. A missing zip comes from eBible if eBible still serves the locked bytes, otherwise from the archive. A newer eBible revision is kept in `data/sources/archive/` but never used.

`--refresh` moves the lock to whatever eBible serves now and prints each change. Commit the lock only after reviewing what changed; adopting it in production is a separate step.

## Archive

Locked zips are assets of the `source-archive` pre-release on GitHub, one per revision. The **Archive sources** workflow (`.github/workflows/archive-sources.yml`) runs `npm run data:archive` whenever `data/sources.lock.json` changes on any branch. It uploads each locked zip that isn't archived yet, using bytes from eBible that match the lock's SHA-256. Run it early: once eBible replaces a revision, only a checkout that still has the zip can archive it.

```bash
npm run data:archive -- --check          # list locked zips that aren't archived
GITHUB_TOKEN=… npm run data:archive      # upload them (contents: write)
```

## Recorded revision

`translations.source_revision`, `source_sha256` and `imported_at` say which source zip the stored verses match exactly. NULL means unknown: seeded before revisions were recorded, or still holding an older revision than the lock.

- `db:seed` records the parsed zip on a translation it creates. It leaves an existing translation's revision alone, because it never changes existing verses.
- `db:backfill:words` records the locked revision once every stored verse of a translation matches it, after its verse writes succeed. It refuses to run if `data/parsed/` wasn't parsed from the locked zips.

`GET /v1/translations` returns `source_revision` as `revision` (`null` when unrecorded), so clients such as bible-web can tell when text or word tags they cached are from an older revision. The response is cached like the chapters (`max-age=86400`), so a new revision reaches browsers within a day; if an edge Cache Rule is ever added, purge `/v1/translations` together with the adopted chapters.

### Production rollout

Needs a D1-edit `CLOUDFLARE_API_TOKEN`, and `NODE_USE_ENV_PROXY=1` behind an HTTPS proxy (see the [word-study runbook](word-study-prod-migration.md)). Ask before each production step. The Worker reads the new columns with `SELECT *` and returns `revision: null` until they exist, so the deploy can go out before or after the migration.

1. Build from the locked zips: `npm run data:download && npm run data:parse && npm run data:tag`.
2. Add the columns (reads the column list, three `ALTER TABLE`s, no verse rows):

   ```bash
   npm run db:migrate:sources -- --remote
   ```

3. Record the baseline for the translations production already holds at the locked revision. Only `tcgnt` and `wlc` qualify, so check only those: about 31,000 verse rows plus ~15,000 lexicon rows per run, against ~120,000 for all four.

   ```bash
   npm run db:backfill:words -- --remote --translations=tcgnt,wlc --dry-run   # expect: Total writes: 2
   npm run db:backfill:words -- --remote --translations=tcgnt,wlc             # records both revisions
   npx wrangler d1 execute bible-db --remote --command "SELECT id, source_revision, substr(source_sha256, 1, 8) AS sha, imported_at FROM translations"
   ```

   The two writes are the two `translations` rows. Anything else in the dry run means production has drifted from the lock since 2026-09-24: stop and review it. A `tcgnt` abort ("different source revision") means eBible's 2026-09-24 zip isn't the one adopted that day.

4. Move translations still on an older revision to the lock: `npm run db:backfill:words -- --remote --translations=web,kjv --adopt-revision=web,kjv`. Before it, note a Time Travel bookmark (`npx wrangler d1 time-travel info bible-db`): D1 keeps no history, so if the replaced revision isn't archived, the bookmark is the only way back.

Done on 2026-09-25:

- Migration: added the three columns (4 rows read).
- `--translations=tcgnt,wlc` without the dry run: every verse and word row matched, `Total writes: 2`. Recorded `tcgnt` 2026-09-24 and `wlc` 2026-08-08.
- `--translations=web,kjv --adopt-revision=web,kjv`: 143 `web` and 3 `kjv` verses updated, `Total writes: 150` (146 verses, 2 revision rows, 2 no-op clears). Recorded `web` 2026-09-22 and `kjv` 2026-09-17.
- The replaced WEB/KJV text was an older, unarchived eBible revision. Time Travel bookmark from just before the adoption (2026-09-25T01:17Z, restorable for 30 days):

  ```bash
  npx wrangler d1 time-travel restore bible-db --bookmark=00000c9f-00000008-000050f1-da63b6d091b2137c56b475315a2276ae
  ```

  Restoring rewinds the whole database, not just those verses.

Rollback: the columns are inert, and `revision` falls back to `null`. To clear them, run `UPDATE translations SET source_revision = NULL, source_sha256 = NULL, imported_at = NULL`.
