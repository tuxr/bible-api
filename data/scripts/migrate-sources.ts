/**
 * Add the source revision columns to translations (idempotent).
 *   npm run db:migrate:sources              # local
 *   npm run db:migrate:sources -- --remote  # production
 * Existing rows get NULL; `npm run db:backfill:words` records the revision once a
 * translation's stored text matches its locked source exactly.
 */

import { spawn } from "child_process";

const target = process.argv.includes("--remote") ? "--remote" : "--local";
const COLUMNS = ["source_revision", "source_sha256", "imported_at"];

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

async function main() {
  const output = await runWrangler(["d1", "execute", "bible-db", target, "--json", "--command=PRAGMA table_info(translations)"]);
  const existing = new Set(
    ((JSON.parse(output.trim()) as Array<{ results?: Array<{ name: string }> }>)[0]?.results ?? []).map((column) => column.name)
  );
  const missing = COLUMNS.filter((column) => !existing.has(column));
  if (!missing.length) {
    console.log("translations source columns already exist");
    return;
  }
  const sql = missing.map((column) => `ALTER TABLE translations ADD COLUMN ${column} TEXT;`).join(" ");
  await runWrangler(["d1", "execute", "bible-db", target, `--command=${sql}`]);
  console.log(`Added ${missing.join(", ")} to translations`);
}

main().catch((error) => { console.error(error); process.exit(1); });
