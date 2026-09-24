/**
 * Upload every locked source zip that isn't archived yet to its `archive` URL (an asset of
 * the `source-archive` GitHub release, created as a pre-release if missing).
 *
 * The bytes come from data/sources/ or eBible and are uploaded only if their SHA-256 matches
 * the lock, so a zip can be archived only while someone still has that exact revision.
 *   GITHUB_TOKEN=… npm run data:archive     # needs contents: write
 *   npm run data:archive -- --check          # report what's missing, upload nothing
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { SOURCES_DIR, readLock, sha256, type LockedText } from "./sources-lock.js";

const check = process.argv.includes("--check");
const token = process.env.GITHUB_TOKEN;
const api = "https://api.github.com";

/** `https://github.com/<owner>/<repo>/releases/download/<tag>/<name>` */
function parseArchiveUrl(url: string) {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/);
  if (!match) throw new Error(`unsupported archive URL: ${url}`);
  const [, owner, repo, tag, name] = match as unknown as [string, string, string, string, string];
  return { owner, repo, tag, name };
}

async function github<T>(url: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, body };
}

async function isArchived(url: string): Promise<boolean> {
  const response = await fetch(url, { method: "HEAD", redirect: "follow" });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`HEAD ${url}: ${response.status}`);
  return true;
}

/** The locked bytes, from disk or eBible; undefined if neither has that revision any more. */
async function lockedBytes(text: LockedText): Promise<Buffer | undefined> {
  const local = await readFile(join(SOURCES_DIR, text.file)).catch(() => undefined);
  if (local && sha256(local) === text.sha256) return local;
  const response = await fetch(text.url);
  if (!response.ok) throw new Error(`GET ${text.url}: ${response.status}`);
  const latest = Buffer.from(await response.arrayBuffer());
  return sha256(latest) === text.sha256 ? latest : undefined;
}

type Release = { id: number; upload_url: string; assets: Array<{ name: string }> };

async function release(owner: string, repo: string, tag: string): Promise<Release> {
  const existing = await github<Release>(`${api}/repos/${owner}/${repo}/releases/tags/${tag}`);
  if (existing.status === 200) return existing.body;
  const created = await github<Release>(`${api}/repos/${owner}/${repo}/releases`, {
    method: "POST",
    body: JSON.stringify({
      tag_name: tag,
      name: "Source archive",
      body: "Every eBible source zip adopted in data/sources.lock.json, named <file>-<revision date>-<sha256 prefix>.zip. Managed by `npm run data:archive`; not a release of the API.",
      prerelease: true,
      make_latest: "false",
    }),
  });
  if (created.status !== 201) throw new Error(`creating release ${tag}: ${created.status} ${JSON.stringify(created.body)}`);
  return created.body;
}

async function upload(text: LockedText, bytes: Buffer): Promise<void> {
  const { owner, repo, tag, name } = parseArchiveUrl(text.archive);
  const target = await release(owner, repo, tag);
  if (target.assets.some((asset) => asset.name === name)) return;
  const uploadUrl = target.upload_url.replace(/\{.*\}$/, "") + `?name=${encodeURIComponent(name)}`;
  const uploaded = await github<{ size?: number }>(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: bytes,
  });
  if (uploaded.status !== 201) throw new Error(`uploading ${name}: ${uploaded.status} ${JSON.stringify(uploaded.body)}`);
}

async function main() {
  if (!check && !token) throw new Error("GITHUB_TOKEN is required (or pass --check)");
  const lock = await readLock();
  const missing: string[] = [];
  for (const [id, text] of Object.entries(lock.texts)) {
    if (await isArchived(text.archive)) {
      console.log(`${id}: archived (${text.revision})`);
      continue;
    }
    if (check) {
      console.log(`${id}: NOT archived: ${text.archive}`);
      missing.push(id);
      continue;
    }
    const bytes = await lockedBytes(text);
    if (!bytes) {
      console.error(`${id}: neither data/sources/ nor eBible has revision ${text.revision} (${text.sha256.slice(0, 8)}) any more`);
      missing.push(id);
      continue;
    }
    await upload(text, bytes);
    console.log(`${id}: uploaded ${text.archive}`);
  }
  if (missing.length) {
    console.error(`\nNot archived: ${missing.join(", ")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
