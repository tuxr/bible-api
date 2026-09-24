import { spawn } from "child_process";

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

async function query(sql: string): Promise<Record<string, unknown>[]> {
  const output = await runWrangler(["d1", "execute", "bible-db", target, "--json", `--command=${sql}`]);
  const parsed = JSON.parse(output.trim()) as Array<{ results?: Record<string, unknown>[] }>;
  return parsed[0]?.results ?? [];
}

const UPDATE_TRIGGER = `CREATE TRIGGER verses_au AFTER UPDATE OF text_plain ON verses BEGIN
    INSERT INTO verses_fts(verses_fts, rowid, text_plain) VALUES ('delete', old.id, old.text_plain);
    INSERT INTO verses_fts(rowid, text_plain) VALUES (new.id, new.text_plain);
END;`;

async function main() {
  const columns = await query("PRAGMA table_info(verses)");
  if (!columns.some((column) => column.name === "words")) {
    await runWrangler(["d1", "execute", "bible-db", target, "--command=ALTER TABLE verses ADD COLUMN words TEXT"]);
    console.log("Added words column");
  } else console.log("words column already exists");

  await runWrangler([
    "d1", "execute", "bible-db", target,
    "--command=CREATE TABLE IF NOT EXISTS lexicon (id TEXT PRIMARY KEY, language TEXT NOT NULL, entry TEXT NOT NULL)",
  ]);
  console.log("lexicon table ready");

  // The FTS index only covers text_plain. An unscoped update trigger would delete and
  // re-insert every verse's index entry when the backfill writes `words` (~31k rows).
  const trigger = await query("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'verses_au'");
  const triggerSql = String(trigger[0]?.sql ?? "");
  if (!/AFTER UPDATE OF text_plain ON verses/i.test(triggerSql)) {
    await runWrangler([
      "d1", "execute", "bible-db", target,
      `--command=DROP TRIGGER IF EXISTS verses_au; ${UPDATE_TRIGGER}`,
    ]);
    console.log("verses_au trigger scoped to text_plain");
  } else console.log("verses_au trigger already scoped to text_plain");
}

main().catch((error) => { console.error(error); process.exit(1); });
