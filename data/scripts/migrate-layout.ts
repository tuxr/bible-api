/**
 * Add `verses.layout` to an existing database. Inert on its own: nothing reads the column
 * until the Worker that serves `layout=1` is deployed, and nothing writes it until
 * db:backfill:layout (or db:backfill:words, for the verses whose text it rewrites).
 *
 *   npm run db:migrate:layout              # local
 *   npm run db:migrate:layout -- --remote  # production (D1 query API, CLOUDFLARE_API_TOKEN)
 *
 * Idempotent: a second run reports the column is already there. Reads no verse rows.
 */

import { spawn } from "child_process";
import { remoteQuery } from "./d1-remote.js";

const target = process.argv.includes("--remote") ? "--remote" : "--local";

function runWrangler(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["wrangler", ...args], { shell: false });
    let stdout = "";
    let stderr = "";
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    proc.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `Wrangler exited with code ${code}`)));
    proc.on("error", reject);
  });
}

async function query<T>(sql: string): Promise<T[]> {
  if (target === "--remote") return (await remoteQuery<T>(sql))[0]?.results ?? [];
  const output = await runWrangler(["d1", "execute", "bible-db", target, "--json", `--command=${sql}`]);
  return (JSON.parse(output.trim()) as Array<{ results?: T[] }>)[0]?.results ?? [];
}

async function main() {
  const columns = await query<{ name: string }>("PRAGMA table_info(verses)");
  if (columns.some((column) => column.name === "layout")) {
    console.log("layout column already exists");
    return;
  }
  await query("ALTER TABLE verses ADD COLUMN layout TEXT");
  console.log("Added layout column");
}

main().catch((error) => { console.error(error); process.exit(1); });
