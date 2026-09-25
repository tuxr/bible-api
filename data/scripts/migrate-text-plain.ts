/**
 * Migrate existing D1 databases to add and backfill text_plain. The verses_search triggers
 * re-index each verse whose text_plain changes (run db:migrate:search-index afterwards on a
 * database that doesn't have verses_search yet).
 *
 * Run after pulling schema changes for Hebrew (WLC) search support.
 *
 * Local (default):
 *   npm run db:migrate:text-plain
 *
 * Production (remote D1):
 *   npm run db:migrate:text-plain -- --remote
 *
 * On production the migration is typically run BEFORE WLC is seeded, so the
 * Hebrew FTS verification is skipped when no WLC rows are present yet.
 */

import { spawn } from "child_process";
import { toSearchPlainText } from "../../src/lib/hebrew.js";

interface QueryResult {
  results: Record<string, unknown>[];
}

// Target the local (default) or remote (production) D1 database.
const TARGET_FLAG = process.argv.includes("--remote") ? "--remote" : "--local";

function runWrangler(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["wrangler", ...args], {
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    // Decode as a stream: a Hebrew/Greek character can straddle two chunks.
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Wrangler exited with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

async function query(sql: string): Promise<Record<string, unknown>[]> {
  const output = await runWrangler([
    "d1",
    "execute",
    "bible-db",
    TARGET_FLAG,
    "--json",
    `--command=${sql}`,
  ]);
  const trimmed = output.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed) as QueryResult[];
    return parsed[0]?.results ?? [];
  } catch {
    const lines = trimmed.split("\n");
    const lastLine = lines[lines.length - 1];
    if (!lastLine) {
      return [];
    }
    const parsed = JSON.parse(lastLine) as QueryResult[];
    return parsed[0]?.results ?? [];
  }
}

async function execute(sql: string): Promise<void> {
  await runWrangler(["d1", "execute", "bible-db", TARGET_FLAG, `--command=${sql}`]);
}

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

async function columnExists(): Promise<boolean> {
  const columns = await query("PRAGMA table_info(verses)");
  return columns.some((col) => col.name === "text_plain");
}

async function main() {
  const targetLabel = TARGET_FLAG === "--remote" ? "remote/production D1" : "local D1";
  console.log(`text_plain migration (${targetLabel})`);
  console.log("=============================\n");

  if (!(await columnExists())) {
    console.log("Adding text_plain column...");
    await execute("ALTER TABLE verses ADD COLUMN text_plain TEXT NOT NULL DEFAULT ''");
  } else {
    console.log("text_plain column already exists");
  }

  console.log("Backfilling text_plain for non-WLC/TCGNT translations...");
  await execute("UPDATE verses SET text_plain = text WHERE translation_id NOT IN ('wlc', 'tcgnt')");

  console.log("Backfilling WLC text_plain (strip diacritics)...");
  const wlcVerses = await query(
    "SELECT id, text FROM verses WHERE translation_id = 'wlc' AND (text_plain IS NULL OR text_plain = '')"
  );

  const BATCH_SIZE = 200;
  for (let i = 0; i < wlcVerses.length; i += BATCH_SIZE) {
    const batch = wlcVerses.slice(i, i + BATCH_SIZE);
    const statements = batch.map((row) => {
      const id = row.id as number;
      const text = row.text as string;
      const plain = toSearchPlainText("wlc", text);
      return `UPDATE verses SET text_plain = '${escapeSql(plain)}' WHERE id = ${id};`;
    });
    await execute(statements.join("\n"));
    console.log(`  Updated ${Math.min(i + BATCH_SIZE, wlcVerses.length)}/${wlcVerses.length}`);
  }

  // Verify Hebrew only when WLC has been seeded. On production the migration usually runs
  // before WLC is loaded, in which case there is nothing to check.
  const wlcCount = await query(
    "SELECT COUNT(*) as count FROM verses WHERE translation_id = 'wlc'"
  );
  const wlcVerseCount = (wlcCount[0]?.count as number) ?? 0;

  if (wlcVerseCount === 0) {
    console.log("\nNo WLC verses present yet — skipping the Hebrew text_plain check.");
  } else {
    const missing = await query(
      "SELECT COUNT(*) as count FROM verses WHERE translation_id = 'wlc' AND text_plain = ''"
    );
    const count = (missing[0]?.count as number) ?? 0;
    console.log(`\nWLC verses without text_plain: ${count}`);

    if (count > 0) {
      console.error("Migration may have failed — some WLC verses have no text_plain");
      process.exit(1);
    }
  }

  console.log("\n✓ Migration complete");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});