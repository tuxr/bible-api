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

### Production rollout

Needs a D1-edit `CLOUDFLARE_API_TOKEN`, and `NODE_USE_ENV_PROXY=1` behind an HTTPS proxy (see the [word-study runbook](word-study-prod-migration.md)). The API doesn't read the new columns, so this can run before or after the deploy.

```bash
npm run data:download && npm run data:parse && npm run data:tag
npm run db:migrate:sources -- --remote                  # add the three columns (NULL)
npm run db:backfill:words -- --remote --dry-run         # expect: Total writes: 2
npm run db:backfill:words -- --remote
npx wrangler d1 execute bible-db --remote --command "SELECT id, source_revision, substr(source_sha256, 1, 8) AS sha, imported_at FROM translations"
```

Expected as of September 2026: `tcgnt` and `wlc` record their locked revisions (2026-09-24 and 2026-08-08). `web` and `kjv` stay NULL: production holds an older revision of 143 and 3 verses. Their locked revisions (2026-09-22 and 2026-09-17) are adopted with `--adopt-revision=web,kjv` after review, which records them.

Rollback: the columns are inert. To clear them, run `UPDATE translations SET source_revision = NULL, source_sha256 = NULL, imported_at = NULL`.
