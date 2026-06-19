/**
 * Validate the seeded D1 database
 *
 * Checks for:
 * - Expected number of verses per translation
 * - All books present
 * - FTS index working
 * - No duplicate verses
 */

import { spawn } from "child_process";

interface QueryResult {
  results: Record<string, unknown>[];
}

function runWranglerQuery(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["wrangler", "d1", "execute", "bible-db", "--local", "--json", `--command=${query}`], {
      shell: false,
    });

    let stdout = "";
    let stderr = "";

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
        reject(new Error(`Query failed: ${stderr}`));
      }
    });

    proc.on("error", reject);
  });
}

async function query(sql: string): Promise<Record<string, unknown>[]> {
  const output = await runWranglerQuery(sql);
  // Parse the JSON output from wrangler
  const lines = output.trim().split("\n");
  const lastLine = lines[lines.length - 1];
  if (!lastLine) {
    return [];
  }
  try {
    const parsed = JSON.parse(lastLine) as QueryResult[];
    return parsed[0]?.results ?? [];
  } catch {
    // Try parsing full output
    const parsed = JSON.parse(output) as QueryResult[];
    return parsed[0]?.results ?? [];
  }
}

async function main() {
  console.log("Database Validator");
  console.log("==================\n");

  let errors = 0;

  // Check translations
  console.log("Checking translations...");
  const translations = await query("SELECT id, name FROM translations");
  console.log(`  Found ${translations.length} translations`);
  for (const t of translations) {
    console.log(`    - ${t.id}: ${t.name}`);
  }
  if (translations.length === 0) {
    console.error("  ERROR: No translations found!");
    errors++;
  }

  // Check books
  console.log("\nChecking books...");
  const books = await query("SELECT COUNT(*) as count FROM books");
  const bookCount = (books[0]?.count as number) ?? 0;
  console.log(`  Found ${bookCount} books`);

  const byTestament = await query("SELECT testament, COUNT(*) as count FROM books GROUP BY testament");
  for (const row of byTestament) {
    console.log(`    - ${row.testament}: ${row.count} books`);
  }

  if (bookCount < 66) {
    console.error("  ERROR: Missing canonical books (expected at least 66)");
    errors++;
  }

  // Check verse counts
  console.log("\nChecking verses...");
  const verseCounts = await query(`
    SELECT translation_id, COUNT(*) as count
    FROM verses
    GROUP BY translation_id
  `);

  for (const row of verseCounts) {
    const count = row.count as number;
    console.log(`  ${row.translation_id}: ${count} verses`);

    // WEB has ~30,000 verses, KJV has 31,102
    if (row.translation_id === "web" && count < 30000) {
      console.error(`    ERROR: WEB should have ~30,000+ verses`);
      errors++;
    }
    if (row.translation_id === "kjv" && count < 31000) {
      console.error(`    ERROR: KJV should have ~31,000 verses`);
      errors++;
    }
    if (row.translation_id === "wlc" && count < 23000) {
      console.error(`    ERROR: WLC should have ~23,000 verses`);
      errors++;
    }
  }

  // Check for duplicates
  console.log("\nChecking for duplicates...");
  const duplicates = await query(`
    SELECT translation_id, book_id, chapter, verse, COUNT(*) as count
    FROM verses
    GROUP BY translation_id, book_id, chapter, verse
    HAVING count > 1
    LIMIT 5
  `);

  if (duplicates.length > 0) {
    console.error(`  ERROR: Found duplicate verses!`);
    for (const d of duplicates) {
      console.error(`    - ${d.translation_id} ${d.book_id} ${d.chapter}:${d.verse} (${d.count}x)`);
    }
    errors++;
  } else {
    console.log("  No duplicates found");
  }

  // Check FTS (English)
  console.log("\nChecking FTS index...");
  const ftsResults = await query(`
    SELECT COUNT(*) as count
    FROM verses_fts
    WHERE verses_fts MATCH 'God'
  `);
  const ftsCount = (ftsResults[0]?.count as number) ?? 0;
  console.log(`  FTS search for 'God': ${ftsCount} results`);

  if (ftsCount === 0) {
    console.error("  ERROR: FTS index appears empty or broken");
    errors++;
  }

  // Check WLC FTS (unpointed Hebrew)
  const wlcFtsResults = await query(`
    SELECT COUNT(*) as count
    FROM verses_fts
    WHERE verses_fts MATCH 'בראשית'
  `);
  const wlcFtsCount = (wlcFtsResults[0]?.count as number) ?? 0;
  console.log(`  WLC FTS search for 'בראשית' (unpointed): ${wlcFtsCount} results`);

  if (wlcFtsCount === 0) {
    console.error("  ERROR: WLC Hebrew FTS appears empty or broken (run db:migrate:text-plain)");
    errors++;
  }

  // Check sample verses
  console.log("\nChecking sample verses...");
  const sampleRefs = [
    { book: "JHN", chapter: 3, verse: 16, desc: "John 3:16" },
    { book: "GEN", chapter: 1, verse: 1, desc: "Genesis 1:1" },
    { book: "PSA", chapter: 23, verse: 1, desc: "Psalm 23:1" },
    { book: "REV", chapter: 22, verse: 21, desc: "Revelation 22:21" },
  ];

  for (const ref of sampleRefs) {
    const results = await query(`
      SELECT text FROM verses
      WHERE book_id = '${ref.book}'
        AND chapter = ${ref.chapter}
        AND verse = ${ref.verse}
      LIMIT 1
    `);

    if (results.length > 0) {
      const text = (results[0]?.text as string) ?? "";
      const preview = text.length > 50 ? text.substring(0, 50) + "..." : text;
      console.log(`  ${ref.desc}: "${preview}"`);
    } else {
      console.error(`  ERROR: ${ref.desc} not found!`);
      errors++;
    }
  }

  // WLC sample verse (OT only)
  const wlcGenesis = await query(`
    SELECT text FROM verses
    WHERE translation_id = 'wlc'
      AND book_id = 'GEN'
      AND chapter = 1
      AND verse = 1
    LIMIT 1
  `);

  if (wlcGenesis.length > 0) {
    const text = (wlcGenesis[0]?.text as string) ?? "";
    const preview = text.length > 50 ? text.substring(0, 50) + "..." : text;
    console.log(`  WLC Genesis 1:1: "${preview}"`);
  } else {
    console.error("  ERROR: WLC Genesis 1:1 not found!");
    errors++;
  }

  // Summary
  console.log("\n" + "=".repeat(40));
  if (errors === 0) {
    console.log("✓ All validations passed!");
  } else {
    console.error(`✗ ${errors} validation error(s) found`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
