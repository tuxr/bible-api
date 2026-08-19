import { spawn } from "child_process";

const target = process.argv.includes("--remote") ? "--remote" : "--local";

function runWrangler(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["wrangler", ...args], { shell: false });
    let stdout = "";
    let stderr = "";
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

async function main() {
  const columns = await query("PRAGMA table_info(verses)");
  if (!columns.some((column) => column.name === "segments")) {
    await runWrangler(["d1", "execute", "bible-db", target, "--command=ALTER TABLE verses ADD COLUMN segments TEXT"]);
    console.log("Added segments column");
  } else console.log("segments column already exists");
}

main().catch((error) => { console.error(error); process.exit(1); });
