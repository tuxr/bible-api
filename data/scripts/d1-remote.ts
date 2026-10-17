/**
 * Production goes through D1's query API, not wrangler: `wrangler d1 execute --remote --file`
 * uses the import path, which makes the database unavailable while each file imports, and
 * ~900 `--command` launches would take over an hour. Ids come from wrangler.toml; the token
 * from CLOUDFLARE_API_TOKEN (D1 edit).
 */

import { readFile } from "fs/promises";
import { join } from "path";

let remoteApi: { url: string; token: string } | undefined;
export async function remoteQuery<T>(sql: string): Promise<Array<{ results?: T[] }>> {
  if (!remoteApi) {
    const toml = await readFile(join(process.cwd(), "wrangler.toml"), "utf8");
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? toml.match(/^account_id\s*=\s*"([^"]+)"/m)?.[1];
    const databaseId = toml.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1];
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !databaseId || !token) throw new Error("--remote needs CLOUDFLARE_API_TOKEN and account_id/database_id in wrangler.toml");
    remoteApi = { url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, token };
  }
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(remoteApi.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${remoteApi.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    });
    const body = (await response.json().catch(() => ({}))) as { success?: boolean; result?: Array<{ results?: T[] }>; errors?: unknown };
    if (response.ok && body.success) return body.result ?? [];
    // Retry rate limits and server errors; SQL errors fail straight away.
    if (attempt < 5 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`D1 query failed (${response.status}): ${JSON.stringify(body.errors ?? body)}`);
  }
}

/** Write statements through the query API in batches under D1's 100 KB query limit. */
export async function remoteExecute(label: string, statements: string[]): Promise<void> {
  const MAX_BYTES = 90_000;
  let batch: string[] = [];
  let bytes = 0;
  let written = 0;
  const flush = async () => {
    if (!batch.length) return;
    await remoteQuery(batch.join("\n"));
    written += batch.length;
    console.log(`  ${label}: ${written}/${statements.length}`);
    batch = [];
    bytes = 0;
  };
  for (const statement of statements) {
    const size = Buffer.byteLength(statement);
    if (bytes + size > MAX_BYTES) await flush();
    batch.push(statement);
    bytes += size;
  }
  await flush();
}
