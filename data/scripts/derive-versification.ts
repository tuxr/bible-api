/**
 * Derive WLC ↔ English versification divergences from seeded D1 data.
 *
 * Walks all 39 OT books, compares WLC verse numbering against WEB (primary)
 * and KJV (cross-check). Outputs inventory, divergences, and verse-level mappings.
 *
 * Usage: tsx data/scripts/derive-versification.ts [--remote]
 */

import { spawn } from "child_process";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

const TARGET_FLAG = process.argv.includes("--remote") ? "--remote" : "--local";

interface QueryResult {
  results: Record<string, unknown>[];
}

interface VerseRow {
  translation_id: string;
  book_id: string;
  chapter: number;
  verse: number;
  text: string;
}

interface VerseRef {
  chapter: number;
  verse: number;
}

type DivergenceKind =
  | "superscription_as_v1"
  | "chapter_boundary_split"
  | "wlc_extra"
  | "english_extra"
  | "split_merge";

interface MappingEntry {
  book_id: string;
  kind: DivergenceKind;
  wlc: VerseRef | null;
  english: VerseRef | null;
  kjv: VerseRef | null;
  note?: string;
}

interface ChapterDivergence {
  book_id: string;
  chapter: number;
  wlc_count: number;
  web_count: number;
  kjv_count: number;
  kinds: DivergenceKind[];
}

interface WlcInventoryBook {
  book_id: string;
  name: string;
  chapters: number;
  total_verses: number;
  chapter_verse_counts: Record<string, number>;
}

interface VerseFixture {
  translation_id: string;
  book_id: string;
  chapter: number;
  verse: number;
  text: string;
}

interface TextbookCase {
  id: string;
  description: string;
  match: (mappings: MappingEntry[], chapters: ChapterDivergence[]) => boolean;
}

interface DerivedOutput {
  version: number;
  generated_at: string;
  source: string;
  design: {
    principle: string;
    scope: string;
    extensibility: string;
  };
  wlc_inventory: WlcInventoryBook[];
  divergent_chapters: ChapterDivergence[];
  mappings: MappingEntry[];
  golden_verses: Array<{
    ref: string;
    book_id: string;
    chapter: number;
    verse: number;
    text: string;
    note: string;
  }>;
  textbook_crosscheck: {
    found: string[];
    missing_from_data: Array<{ id: string; description: string }>;
    unexpected_in_data: string[];
  };
}

function runWranglerQuery(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "npx",
      ["wrangler", "d1", "execute", "bible-db", TARGET_FLAG, "--json", `--command=${query}`],
      { shell: false, cwd: ROOT }
    );

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

async function query<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  const output = await runWranglerQuery(sql);
  const lines = output.trim().split("\n");
  const lastLine = lines[lines.length - 1];
  if (!lastLine) return [];
  try {
    const parsed = JSON.parse(lastLine) as QueryResult[];
    return (parsed[0]?.results ?? []) as T[];
  } catch {
    const parsed = JSON.parse(output) as QueryResult[];
    return (parsed[0]?.results ?? []) as T[];
  }
}

function isSuperscriptionHebrew(text: string): boolean {
  const plain = text.replace(/[\u0591-\u05C7]/g, "");
  return /מזמור|לדוד|שיר|תפלה/.test(plain) && text.length < 120;
}

function normalizeEnglish(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function englishSimilarity(a: string, b: string): number {
  const na = normalizeEnglish(a);
  const nb = normalizeEnglish(b);
  if (!na || !nb) return 0;
  const wordsA = new Set(na.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

function isDivergentMapping(m: MappingEntry): boolean {
  if (m.kind === "superscription_as_v1") {
    if (m.wlc && !m.english) return true;
    if (m.wlc && m.english) {
      return m.wlc.verse !== m.english.verse || m.wlc.chapter !== m.english.chapter;
    }
  }
  if (m.kind === "wlc_extra" || m.kind === "english_extra") return true;
  if (m.kind === "chapter_boundary_split") return true;
  if (m.kind === "split_merge") {
    if (!m.wlc || !m.english) return true;
    return m.wlc.verse !== m.english.verse || m.wlc.chapter !== m.english.chapter;
  }
  return false;
}

function alignPsalmChapter(
  bookId: string,
  chapter: number,
  wlc: VerseRow[],
  web: VerseRow[],
  kjv: VerseRow[]
): MappingEntry[] | null {
  if (bookId !== "PSA" || wlc.length <= web.length || !wlc[0] || !isSuperscriptionHebrew(wlc[0].text)) {
    return null;
  }

  const entries: MappingEntry[] = [];
  const extraHeaders = wlc.length - web.length;

  for (let h = 0; h < extraHeaders; h++) {
    entries.push({
      book_id: bookId,
      kind: "superscription_as_v1",
      wlc: { chapter, verse: h + 1 },
      english: null,
      kjv: null,
      note: h === 0 ? "Hebrew superscription" : "Hebrew secondary heading",
    });
  }

  for (let i = 0; i < web.length; i++) {
    const wlcVerse = wlc[i + extraHeaders];
    const webVerse = web[i];
    const kjvVerse = kjv[i];
    if (!wlcVerse || !webVerse) continue;
    entries.push({
      book_id: bookId,
      kind: "superscription_as_v1",
      wlc: { chapter, verse: wlcVerse.verse },
      english: { chapter, verse: webVerse.verse },
      kjv: kjvVerse ? { chapter, verse: kjvVerse.verse } : null,
    });
  }

  return entries;
}

function alignChapterVerses(
  bookId: string,
  chapter: number,
  wlcVerses: VerseRow[],
  webVerses: VerseRow[],
  kjvVerses: VerseRow[]
): MappingEntry[] {
  const wlc = wlcVerses.filter((v) => v.chapter === chapter).sort((a, b) => a.verse - b.verse);
  const web = webVerses.filter((v) => v.chapter === chapter).sort((a, b) => a.verse - b.verse);
  const kjv = kjvVerses.filter((v) => v.chapter === chapter).sort((a, b) => a.verse - b.verse);

  if (wlc.length === 0 && web.length === 0) return [];

  const psalm = alignPsalmChapter(bookId, chapter, wlc, web, kjv);
  if (psalm) return psalm;

  const entries: MappingEntry[] = [];
  const kjvMap = new Map(kjv.map((v) => [v.verse, v]));

  let wi = 0;
  let ei = 0;

  while (wi < wlc.length || ei < web.length) {
    const wlcRow = wlc[wi];
    const webRow = web[ei];

    if (!wlcRow && webRow) {
      entries.push({
        book_id: bookId,
        kind: "english_extra",
        wlc: null,
        english: { chapter, verse: webRow.verse },
        kjv: kjvMap.has(webRow.verse) ? { chapter, verse: webRow.verse } : null,
      });
      ei++;
      continue;
    }

    if (wlcRow && !webRow) {
      entries.push({
        book_id: bookId,
        kind: "wlc_extra",
        wlc: { chapter, verse: wlcRow.verse },
        english: null,
        kjv: null,
      });
      wi++;
      continue;
    }

    if (!wlcRow || !webRow) break;

    if (wlcRow.verse === webRow.verse) {
      entries.push({
        book_id: bookId,
        kind: "split_merge",
        wlc: { chapter, verse: wlcRow.verse },
        english: { chapter, verse: webRow.verse },
        kjv: kjvMap.has(webRow.verse) ? { chapter, verse: webRow.verse } : null,
      });
      wi++;
      ei++;
      continue;
    }

    if (wlcRow.verse < webRow.verse || wlc.length - wi > web.length - ei) {
      entries.push({
        book_id: bookId,
        kind: "wlc_extra",
        wlc: { chapter, verse: wlcRow.verse },
        english: null,
        kjv: null,
      });
      wi++;
      continue;
    }

    entries.push({
      book_id: bookId,
      kind: "english_extra",
      wlc: null,
      english: { chapter, verse: webRow.verse },
      kjv: kjvMap.has(webRow.verse) ? { chapter, verse: webRow.verse } : null,
    });
    ei++;
  }

  return entries;
}

function detectChapterBoundarySplits(
  bookId: string,
  allWlc: VerseRow[],
  allWeb: VerseRow[],
  allKjv: VerseRow[],
  wlcChapters: number[],
  webChapters: number[]
): MappingEntry[] {
  // Psalms divergences are superscription offsets, not chapter-boundary splits.
  if (bookId === "PSA") return [];

  const entries: MappingEntry[] = [];
  const maxCh = Math.max(...wlcChapters, ...webChapters);

  for (let ch = 1; ch < maxCh; ch++) {
    const wlcTail = allWlc.filter((v) => v.chapter === ch).sort((a, b) => a.verse - b.verse);
    const webTail = allWeb.filter((v) => v.chapter === ch).sort((a, b) => a.verse - b.verse);
    const wlcHead = allWlc.filter((v) => v.chapter === ch + 1).sort((a, b) => a.verse - b.verse);
    const webHead = allWeb.filter((v) => v.chapter === ch + 1).sort((a, b) => a.verse - b.verse);

    if (wlcTail.length === 0 || webTail.length === 0) continue;

    // Pattern A: Hebrew chapter ends early — WEB tail → WLC next chapter head.
    if (wlcTail.length < webTail.length && wlcHead.length > 0) {
      const extraWeb = webTail.slice(wlcTail.length);
      const candidateWlc = wlcHead.slice(0, extraWeb.length);
      if (candidateWlc.length === extraWeb.length && candidateWlc.length > 0) {
        let agree = 0;
        for (let i = 0; i < extraWeb.length; i++) {
          const w = extraWeb[i]!;
          const k = allKjv.find((v) => v.chapter === ch && v.verse === w.verse);
          if (k && englishSimilarity(w.text, k.text) >= 0.3) agree++;
        }
        if (agree >= extraWeb.length * 0.5) {
          for (let i = 0; i < extraWeb.length; i++) {
            const w = extraWeb[i]!;
            const wl = candidateWlc[i]!;
            const k = allKjv.find((v) => v.chapter === ch && v.verse === w.verse);
            entries.push({
              book_id: bookId,
              kind: "chapter_boundary_split",
              wlc: { chapter: ch + 1, verse: wl.verse },
              english: { chapter: ch, verse: w.verse },
              kjv: k ? { chapter: ch, verse: k.verse } : null,
            });
          }
        }
      }
    }

    // Pattern B: English has a following chapter WLC absorbs — WEB head → WLC tail (same chapter).
    if (webHead.length > 0 && wlcTail.length > webTail.length) {
      const extraWlc = wlcTail.slice(webTail.length);
      const candidateWeb = webHead.slice(0, extraWlc.length);
      if (candidateWeb.length === extraWlc.length && candidateWeb.length > 0) {
        let agree = 0;
        for (let i = 0; i < candidateWeb.length; i++) {
          const w = candidateWeb[i]!;
          const k = allKjv.find((v) => v.chapter === ch + 1 && v.verse === w.verse);
          if (k && englishSimilarity(w.text, k.text) >= 0.3) agree++;
        }
        if (agree >= candidateWeb.length * 0.5) {
          for (let i = 0; i < candidateWeb.length; i++) {
            const w = candidateWeb[i]!;
            const wl = extraWlc[i]!;
            const k = allKjv.find((v) => v.chapter === ch + 1 && v.verse === w.verse);
            entries.push({
              book_id: bookId,
              kind: "chapter_boundary_split",
              wlc: { chapter: ch, verse: wl.verse },
              english: { chapter: ch + 1, verse: w.verse },
              kjv: k ? { chapter: ch + 1, verse: k.verse } : null,
            });
          }
        }
      }
    }
  }

  return entries;
}

const TEXTBOOK_CASES: TextbookCase[] = [
  {
    id: "psalm_superscription",
    description: "Psalms: WLC superscription as verse 1 (e.g. Psalm 3)",
    match: (m) =>
      m.some(
        (e) =>
          e.book_id === "PSA" &&
          e.kind === "superscription_as_v1" &&
          e.wlc?.chapter === 3 &&
          e.wlc.verse === 1 &&
          e.english === null
      ),
  },
  {
    id: "joel_chapter_split",
    description: "Joel: WEB 2:28 ↔ WLC 3:1 (chapter boundary split)",
    match: (m) =>
      m.some(
        (e) =>
          e.book_id === "JOL" &&
          e.kind === "chapter_boundary_split" &&
          e.english?.chapter === 2 &&
          e.english.verse === 28 &&
          e.wlc?.chapter === 3 &&
          e.wlc.verse === 1
      ),
  },
  {
    id: "malachi_chapter_split",
    description: "Malachi: WEB 4:1 ↔ WLC 3:19 (English ch4 = Hebrew ch3 tail)",
    match: (m) =>
      m.some(
        (e) =>
          e.book_id === "MAL" &&
          e.kind === "chapter_boundary_split" &&
          e.english?.chapter === 4 &&
          e.english.verse === 1 &&
          e.wlc?.chapter === 3 &&
          e.wlc.verse === 19
      ),
  },
  {
    id: "job_40_41_split",
    description: "Job 40–41: Hebrew redivision of Behemoth/Leviathan section",
    match: (_m, ch) =>
      ch.some((c) => c.book_id === "JOB" && (c.chapter === 40 || c.chapter === 41)),
  },
  {
    id: "daniel_chapter_numbering",
    description: "Daniel: MT chapter numbering differs from English in multiple chapters",
    match: (_m, ch) => ch.filter((c) => c.book_id === "DAN").length >= 3,
  },
  {
    id: "exodus_versification",
    description: "Exodus: split/merge verses (e.g. chapters 7–8, 21–22)",
    match: (_m, ch) =>
      ch.some((c) => c.book_id === "EXO" && (c.chapter === 7 || c.chapter === 8)),
  },
  {
    id: "leviticus_versification",
    description: "Leviticus: split/merge verses (e.g. chapters 5–6)",
    match: (_m, ch) =>
      ch.some((c) => c.book_id === "LEV" && (c.chapter === 5 || c.chapter === 6)),
  },
  {
    id: "numbers_versification",
    description: "Numbers: split/merge verses (e.g. chapters 16–17)",
    match: (_m, ch) =>
      ch.some((c) => c.book_id === "NUM" && (c.chapter === 16 || c.chapter === 17)),
  },
  {
    id: "genesis_31_32",
    description: "Genesis 31–32: verse renumbering",
    match: (_m, ch) =>
      ch.some((c) => c.book_id === "GEN" && (c.chapter === 31 || c.chapter === 32)),
  },
  {
    id: "1samuel_17_18",
    description: "1 Samuel 17–18: verse renumbering (David/Goliath) — same counts in this corpus",
    match: (_m, ch) =>
      ch.some((c) => c.book_id === "1SA" && (c.chapter === 17 || c.chapter === 18)),
  },
];

const GOLDEN_VERSE_REFS = [
  { book_id: "GEN", chapter: 1, verse: 1, ref: "Genesis 1:1", note: "Creation opening with full niqqud" },
  { book_id: "ECC", chapter: 1, verse: 2, ref: "Ecclesiastes 1:2", note: "Vanity verse with cantillation" },
  { book_id: "PSA", chapter: 23, verse: 2, ref: "Psalm 23:2", note: "Post-superscription content verse" },
  { book_id: "ISA", chapter: 9, verse: 6, ref: "Isaiah 9:6", note: "Messianic verse pointed text" },
  { book_id: "JOL", chapter: 3, verse: 1, ref: "Joel 3:1 (WLC) / Joel 2:28 (English)", note: "Chapter-boundary divergence anchor" },
];

function chapterNumbers(rows: VerseRow[]): number[] {
  return [...new Set(rows.map((r) => r.chapter))].sort((a, b) => a - b);
}

function formatRef(bookId: string, ref: VerseRef | null): string {
  if (!ref) return "—";
  return `${bookId} ${ref.chapter}:${ref.verse}`;
}

function generateMarkdown(output: DerivedOutput): string {
  const lines: string[] = [];
  const totalVerses = output.wlc_inventory.reduce((s, b) => s + b.total_verses, 0);

  lines.push("# WLC ↔ English Versification Map");
  lines.push("");
  lines.push("## Design");
  lines.push("");
  lines.push(output.design.principle);
  lines.push("");
  lines.push(`**Scope:** ${output.design.scope}`);
  lines.push("");
  lines.push(`**Extensibility:** ${output.design.extensibility}`);
  lines.push("");
  lines.push(
    "This document reconciles numbering systems; it does **not** alter stored text or verse numbers in the API."
  );
  lines.push("");
  lines.push(`*Generated from ${output.source} on ${output.generated_at}.*`);
  lines.push("");
  lines.push("Machine-readable source: [`data/versification-map.json`](../data/versification-map.json)");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|------:|`);
  lines.push(`| OT books (WLC) | 39 |`);
  lines.push(`| Total WLC verses | ${totalVerses} |`);
  lines.push(`| Divergent chapters | ${output.divergent_chapters.length} |`);
  lines.push(`| Verse-level mapping entries | ${output.mappings.length} |`);
  lines.push("");

  const kindCounts = new Map<DivergenceKind, number>();
  for (const m of output.mappings) {
    kindCounts.set(m.kind, (kindCounts.get(m.kind) ?? 0) + 1);
  }
  lines.push("### Divergence kinds");
  lines.push("");
  lines.push("| Kind | Count | Description |");
  lines.push("|------|------:|-------------|");
  const kindDesc: Record<DivergenceKind, string> = {
    superscription_as_v1: "Hebrew titles counted as verse 1; English omits them",
    chapter_boundary_split: "Chapter divisions differ between MT and English",
    wlc_extra: "Verse present in WLC only at this alignment point",
    english_extra: "Verse present in English only at this alignment point",
    split_merge: "Verse boundaries split or merged across traditions",
  };
  for (const [kind, count] of [...kindCounts.entries()].sort()) {
    lines.push(`| \`${kind}\` | ${count} | ${kindDesc[kind]} |`);
  }
  lines.push("");

  lines.push("## WLC 39-Book Inventory");
  lines.push("");
  lines.push("| Book | Chapters | Verses |");
  lines.push("|------|--------:|-------:|");
  for (const b of output.wlc_inventory) {
    lines.push(`| ${b.book_id} (${b.name}) | ${b.chapters} | ${b.total_verses} |`);
  }
  lines.push(`| **Total** | | **${totalVerses}** |`);
  lines.push("");

  lines.push("## Divergent Chapters by Book");
  lines.push("");
  const byBook = new Map<string, ChapterDivergence[]>();
  for (const d of output.divergent_chapters) {
    const list = byBook.get(d.book_id) ?? [];
    list.push(d);
    byBook.set(d.book_id, list);
  }
  for (const [bookId, chapters] of [...byBook.entries()].sort()) {
    lines.push(`### ${bookId}`);
    lines.push("");
    lines.push("| Chapter | WLC | WEB | KJV |");
    lines.push("|--------:|----:|----:|----:|");
    for (const c of chapters.sort((a, b) => a.chapter - b.chapter)) {
      lines.push(`| ${c.chapter} | ${c.wlc_count} | ${c.web_count} | ${c.kjv_count} |`);
    }
    lines.push("");
  }

  lines.push("## Notable Correspondences");
  lines.push("");
  const anchors = [
    (m: MappingEntry) => m.book_id === "PSA" && m.wlc?.chapter === 3 && m.wlc.verse === 1,
    (m: MappingEntry) => m.book_id === "PSA" && m.wlc?.chapter === 3 && m.wlc.verse === 2,
    (m: MappingEntry) => m.book_id === "JOL" && m.english?.chapter === 2 && m.english.verse === 28,
    (m: MappingEntry) => m.book_id === "MAL" && m.english?.chapter === 4 && m.english.verse === 1,
    (m: MappingEntry) => m.book_id === "JOB" && m.wlc?.chapter === 40 && m.wlc.verse === 1,
  ];
  lines.push("| WLC | English (WEB) | Kind |");
  lines.push("|-----|---------------|------|");
  for (const pred of anchors) {
    const m = output.mappings.find(pred);
    if (m) {
      lines.push(
        `| ${formatRef(m.book_id, m.wlc)} | ${formatRef(m.book_id, m.english)} | \`${m.kind}\` |`
      );
    }
  }
  lines.push("");

  lines.push("## Textbook Cross-Check");
  lines.push("");
  lines.push(`Confirmed (${output.textbook_crosscheck.found.length}): ${output.textbook_crosscheck.found.join(", ")}`);
  lines.push("");
  if (output.textbook_crosscheck.missing_from_data.length) {
    lines.push("**Not found in this corpus** (textbook expected but data shows no divergence):");
    lines.push("");
    for (const m of output.textbook_crosscheck.missing_from_data) {
      lines.push(`- \`${m.id}\`: ${m.description}`);
    }
    lines.push("");
  }
  if (output.textbook_crosscheck.unexpected_in_data.length) {
    lines.push("**Unexpected divergences** (found in data, not on textbook checklist):");
    lines.push("");
    for (const u of output.textbook_crosscheck.unexpected_in_data) {
      lines.push(`- ${u}`);
    }
    lines.push("");
  }

  lines.push("## WLC Golden Verses (pointed text)");
  lines.push("");
  lines.push("Exact `text` column strings confirming niqqud and cantillation are preserved:");
  lines.push("");
  for (const g of output.golden_verses) {
    lines.push(`- **${g.ref}** — ${g.note}`);
    lines.push(`  \`${g.text}\``);
  }
  lines.push("");

  return lines.join("\n");
}

async function main() {
  console.log("Deriving versification map from D1...");
  console.log(`Target: ${TARGET_FLAG === "--remote" ? "remote" : "local"}\n`);

  const books = await query<{ id: string; name: string; chapters: number }>(
    "SELECT id, name, chapters FROM books WHERE testament = 'OT' ORDER BY book_order"
  );

  const allVerses = (await query(`
    SELECT translation_id, book_id, chapter, verse, text
    FROM verses
    WHERE translation_id IN ('wlc', 'web', 'kjv')
      AND book_id IN (SELECT id FROM books WHERE testament = 'OT')
    ORDER BY book_id, chapter, verse
  `)) as unknown as VerseRow[];

  const byBook = new Map<string, { wlc: VerseRow[]; web: VerseRow[]; kjv: VerseRow[] }>();
  for (const book of books) {
    byBook.set(book.id, { wlc: [], web: [], kjv: [] });
  }
  for (const row of allVerses) {
    const bucket = byBook.get(row.book_id);
    if (!bucket) continue;
    if (row.translation_id === "wlc") bucket.wlc.push(row);
    else if (row.translation_id === "web") bucket.web.push(row);
    else if (row.translation_id === "kjv") bucket.kjv.push(row);
  }

  const wlcInventory: WlcInventoryBook[] = [];
  const divergentChapters: ChapterDivergence[] = [];
  const allMappings: MappingEntry[] = [];

  for (const book of books) {
    const { wlc, web, kjv } = byBook.get(book.id)!;
    const wlcChs = chapterNumbers(wlc);
    const webChs = chapterNumbers(web);
    const allChs = [...new Set([...wlcChs, ...webChs])].sort((a, b) => a - b);

    const chapterCounts: Record<string, number> = {};
    let totalVerses = 0;
    for (const ch of wlcChs) {
      const count = wlc.filter((v) => v.chapter === ch).length;
      chapterCounts[String(ch)] = count;
      totalVerses += count;
    }

    wlcInventory.push({
      book_id: book.id,
      name: book.name,
      chapters: wlcChs.length > 0 ? Math.max(...wlcChs) : book.chapters,
      total_verses: totalVerses,
      chapter_verse_counts: chapterCounts,
    });

    for (const ch of allChs) {
      const wlcCh = wlc.filter((v) => v.chapter === ch);
      const webCh = web.filter((v) => v.chapter === ch);
      const kjvCh = kjv.filter((v) => v.chapter === ch);

      if (wlcCh.length !== webCh.length || wlcCh.length !== kjvCh.length) {
        const kinds = new Set<DivergenceKind>();
        if (book.id === "PSA" && wlcCh.length > webCh.length) {
          kinds.add("superscription_as_v1");
        } else {
          kinds.add("split_merge");
        }
        divergentChapters.push({
          book_id: book.id,
          chapter: ch,
          wlc_count: wlcCh.length,
          web_count: webCh.length,
          kjv_count: kjvCh.length,
          kinds: [...kinds],
        });
      }

      if (wlcCh.length !== webCh.length) {
        allMappings.push(...alignChapterVerses(book.id, ch, wlc, web, kjv));
      }
    }

    allMappings.push(
      ...detectChapterBoundarySplits(book.id, wlc, web, kjv, wlcChs, webChs)
    );
  }

  const seen = new Set<string>();
  const mappings = allMappings.filter((m) => {
    if (!isDivergentMapping(m)) return false;
    const key = [
      m.book_id,
      m.kind,
      m.wlc ? `${m.wlc.chapter}:${m.wlc.verse}` : "-",
      m.english ? `${m.english.chapter}:${m.english.verse}` : "-",
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const goldenVerses = GOLDEN_VERSE_REFS.map((g) => {
    const row = allVerses.find(
      (v) =>
        v.translation_id === "wlc" &&
        v.book_id === g.book_id &&
        v.chapter === g.chapter &&
        v.verse === g.verse
    );
    if (!row) throw new Error(`Golden verse not found: ${g.ref}`);
    return { ...g, text: row.text };
  });

  const foundTextbook: string[] = [];
  const missingTextbook: Array<{ id: string; description: string }> = [];
  for (const tc of TEXTBOOK_CASES) {
    if (tc.match(mappings, divergentChapters)) {
      foundTextbook.push(tc.id);
    } else {
      missingTextbook.push({ id: tc.id, description: tc.description });
    }
  }

  const textbookBooks = new Set([
    "PSA", "JOL", "MAL", "JOB", "DAN", "EXO", "LEV", "NUM", "GEN",
    "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "DEU", "ECC", "EZK", "HOS", "ISA",
    "JER", "JON", "MIC", "NAM", "NEH", "SNG", "ZEC",
  ]);
  const divergentBookIds = new Set(divergentChapters.map((c) => c.book_id));
  const unexpectedBooks = [...divergentBookIds].filter((b) => !textbookBooks.has(b));

  const output: DerivedOutput = {
    version: 1,
    generated_at: new Date().toISOString(),
    source: TARGET_FLAG === "--remote" ? "remote D1" : "local D1",
    design: {
      principle:
        "Each translation preserves its source versification. Stored text and verse numbers are never normalized.",
      scope: "WLC (Hebrew MT) ↔ English (WEB/KJV) for 39 OT books. Greek NT / LXX entries reserved for future extension.",
      extensibility:
        "Mappings are keyed by book_id with per-verse correspondence entries. Add new translation_id fields when Greek/LXX texts are ingested.",
    },
    wlc_inventory: wlcInventory,
    divergent_chapters: divergentChapters,
    mappings,
    golden_verses: goldenVerses,
    textbook_crosscheck: {
      found: foundTextbook,
      missing_from_data: missingTextbook,
      unexpected_in_data: unexpectedBooks.map(
        (b) => `${b}: divergent chapters in data but not on textbook checklist`
      ),
    },
  };

  const mapPath = join(ROOT, "data/versification-map.json");
  writeFileSync(mapPath, JSON.stringify(output, null, 2));

  // Build fixtures for contract tests (verse texts at divergence points).
  const fixtures: VerseFixture[] = [];
  const fixtureKey = new Set<string>();

  function addFixture(row: VerseRow | undefined) {
    if (!row) return;
    const key = `${row.translation_id}:${row.book_id}:${row.chapter}:${row.verse}`;
    if (fixtureKey.has(key)) return;
    fixtureKey.add(key);
    fixtures.push({
      translation_id: row.translation_id,
      book_id: row.book_id,
      chapter: row.chapter,
      verse: row.verse,
      text: row.text,
    });
  }

  for (const m of mappings) {
    if (m.wlc) {
      addFixture(
        allVerses.find(
          (v) =>
            v.translation_id === "wlc" &&
            v.book_id === m.book_id &&
            v.chapter === m.wlc!.chapter &&
            v.verse === m.wlc!.verse
        )
      );
    }
    if (m.english) {
      for (const tid of ["web", "kjv"] as const) {
        addFixture(
          allVerses.find(
            (v) =>
              v.translation_id === tid &&
              v.book_id === m.book_id &&
              v.chapter === m.english!.chapter &&
              v.verse === m.english!.verse
          )
        );
      }
    }
  }
  for (const g of goldenVerses) {
    addFixture(
      allVerses.find(
        (v) =>
          v.translation_id === "wlc" &&
          v.book_id === g.book_id &&
          v.chapter === g.chapter &&
          v.verse === g.verse
      )
    );
  }

  const fixturePath = join(ROOT, "data/versification-fixtures.json");
  writeFileSync(fixturePath, JSON.stringify({ mappings, fixtures, golden_verses: goldenVerses }, null, 2));

  const docPath = join(ROOT, "docs/versification-map.md");
  writeFileSync(docPath, generateMarkdown(output));

  // Console report.
  console.log("=== WLC 39-Book Inventory ===");
  let grandTotal = 0;
  for (const b of wlcInventory) {
    grandTotal += b.total_verses;
    console.log(`  ${b.book_id} (${b.name}): ${b.chapters} ch, ${b.total_verses} verses`);
  }
  console.log(`  TOTAL: ${grandTotal} verses\n`);

  console.log(`=== Divergent Chapters: ${divergentChapters.length} ===`);
  const byBookDiv = new Map<string, ChapterDivergence[]>();
  for (const d of divergentChapters) {
    const list = byBookDiv.get(d.book_id) ?? [];
    list.push(d);
    byBookDiv.set(d.book_id, list);
  }
  for (const [bookId, chapters] of [...byBookDiv.entries()].sort()) {
    const chList = chapters
      .map((c) => `${c.chapter}(wlc=${c.wlc_count},web=${c.web_count})`)
      .join(", ");
    console.log(`  ${bookId}: ${chList}`);
  }

  console.log(`\n=== Divergent Mapping Entries: ${mappings.length} ===`);
  const byKind = new Map<DivergenceKind, number>();
  for (const m of mappings) {
    byKind.set(m.kind, (byKind.get(m.kind) ?? 0) + 1);
  }
  for (const [kind, count] of [...byKind.entries()].sort()) {
    console.log(`  ${kind}: ${count}`);
  }

  console.log("\n=== Textbook Cross-Check ===");
  console.log(`  Found (${foundTextbook.length}): ${foundTextbook.join(", ")}`);
  if (missingTextbook.length) {
    console.log(`  MISSING from data (${missingTextbook.length}):`);
    for (const m of missingTextbook) console.log(`    - ${m.id}: ${m.description}`);
  }
  if (output.textbook_crosscheck.unexpected_in_data.length) {
    console.log(`  Unexpected in data (${output.textbook_crosscheck.unexpected_in_data.length}):`);
    for (const u of output.textbook_crosscheck.unexpected_in_data) console.log(`    - ${u}`);
  }

  console.log(`\nWritten: ${mapPath}`);
  console.log(`Written: ${fixturePath}`);
  console.log(`Written: ${docPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});