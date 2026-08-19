import { readFile, access } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";

type Segment = { text: string; speaker: "jesus" | "narrator" };
type ParsedVerse = { book: string; chapter: number; verse: number; text: string; segments?: Segment[] };
type StoredVerse = { book_id: string; chapter: number; verse: number; text: string; segments: string | null };
const parsedDir = join(process.cwd(), "data", "parsed");
const target = process.argv.includes("--remote") ? "--remote" : "--local";
const ids = ["web", "kjv", "tcgnt"];

function escapeSql(value: string): string { return value.replace(/'/g, "''"); }
function key(book: string, chapter: number, verse: number): string { return `${book}:${chapter}:${verse}`; }
function runWrangler(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["wrangler", ...args], { shell: false });
    let stdout = ""; let stderr = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    proc.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `Wrangler exited with code ${code}`)));
    proc.on("error", reject);
  });
}
async function query(sql: string): Promise<StoredVerse[]> {
  const output = await runWrangler(["d1", "execute", "bible-db", target, "--json", `--command=${sql}`]);
  return (JSON.parse(output.trim()) as Array<{ results?: StoredVerse[] }>)[0]?.results ?? [];
}
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

async function main() {
  let writes = 0;
  for (const id of ids) {
    const file = join(parsedDir, `${id}.json`);
    if (!(await exists(file))) { console.log(`Skipping ${id}: parsed JSON not found`); continue; }
    const parsed = JSON.parse(await readFile(file, "utf8")) as { verses: ParsedVerse[] };
    const stored = await query(`SELECT book_id, chapter, verse, text, segments FROM verses WHERE translation_id = '${id}'`);
    const parsedByKey = new Map(parsed.verses.map((verse) => [key(verse.book, verse.chapter, verse.verse), verse]));
    const mismatches: string[] = [];
    for (const row of stored) {
      const verse = parsedByKey.get(key(row.book_id, row.chapter, row.verse));
      if (!verse || verse.text !== row.text) mismatches.push(`${row.book_id} ${row.chapter}:${row.verse}`);
    }
    if (stored.length !== parsedByKey.size) mismatches.push(`verse count parsed=${parsedByKey.size} stored=${stored.length}`);
    if (mismatches.length) throw new Error(`${id} parsed text does not match stored text: ${mismatches.slice(0, 20).join(", ")}`);

    const statements: string[] = [];
    for (const verse of parsed.verses) {
      if (!verse.segments?.some((segment) => segment.speaker === "jesus")) continue;
      const json = JSON.stringify(verse.segments);
      const row = stored.find((item) => key(item.book_id, item.chapter, item.verse) === key(verse.book, verse.chapter, verse.verse));
      if (row?.segments === json) continue;
      statements.push(`UPDATE verses SET segments = '${escapeSql(json)}' WHERE translation_id = '${id}' AND book_id = '${verse.book}' AND chapter = ${verse.chapter} AND verse = ${verse.verse} AND segments IS NOT '${escapeSql(json)}';`);
    }
    for (let i = 0; i < statements.length; i += 100) {
      await runWrangler(["d1", "execute", "bible-db", target, `--command=${statements.slice(i, i + 100).join("\n")}`]);
    }
    writes += statements.length;
    console.log(`${id}: ${statements.length} segment rows updated`);
  }
  console.log(`Total rows updated: ${writes}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
