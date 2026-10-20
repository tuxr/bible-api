import {
  buildVerse,
  cleanText,
  headingLevel,
  layoutBlock,
  type LayoutBlock,
  type LayoutItem,
  type LayoutMark,
  type ParsedTranslation,
  type ParsedVerse,
  type Speaker,
} from "./usfx-parse.js";

/**
 * USFM (Unified Standard Format Markers) parsing, for sources published as `.usfm` files rather
 * than eBible's USFX: the Berean Standard Bible's own release (bereanbible.com/bsb_usfm.zip),
 * whose `\wj` markup eBible's BSB lacks.
 *
 * Verse text follows the USFX parser's conventions, so a translation reads the same whichever
 * format it came from: headings, titles, cross-reference lines, footnotes and cross references
 * are dropped; paragraph and poetry breaks become spaces; `\wj … \wj*` becomes the `jesus`
 * segments, everything else in a marked verse `narrator`. The paragraphs, headings, titles and
 * stanza breaks become the verse's `layout`, as in the USFX parser; `\r` lines are left out.
 */

/**
 * Paragraph markers whose text is not verse text (a verse marker inside one still opens the
 * verse). `\mr` is kept: the BSB's only one is Habakkuk 3:19's subscription. `\d` is handled
 * apart: a Psalm title is not verse text, as in eBible's BSB, but bsb2usfm also sets Zechariah
 * 12:1's opening sentence as `\d`, which is.
 */
const NON_VERSE_PARAGRAPHS = /^(id|usfm|ide|h|toc\d*|mt\d*|mte\d*|ms\d*|s\d*|sr|r|qa|sp|cl|rem|sts|restore)$/;

export interface UsfmFile {
  name: string;
  content: string;
}

export interface UsfmParseOptions {
  /** A source-specific repair applied after whitespace cleanup, such as `bsbUsfmCleanup`. */
  cleanup?: (text: string) => string;
}

/**
 * bsb2usfm, which builds the BSB's USFM from Bible Hub's tables, leaves typesetting artifacts the
 * publisher's own text (bereanbible.com/bsb.txt) does not have: spaced em dashes, a "[’’]" closing
 * a speech, bracketed supplied words, stray spaces inside parentheses and before closing quotes,
 * and after opening ones, "..." before a number or a closing parenthesis, a stray "vvv", a footnote
 * set against the next word, and the typo "evenif" (Jeremiah 22:24). Checked on 2026-10-17: with this repair every verse equals bsb.txt, except the Psalm
 * titles bsb.txt carries in verse 1 and this API leaves out.
 */
export function bsbUsfmCleanup(text: string): string {
  return text
    .replace(/\s*—\s*/g, "—")
    .replace(/\[’’\]/g, "")
    .replace(/[[\]]/g, "")
    .replace(/\bvvv /g, "")
    .replace(/\.\.\.\s*(?=\d|\))/g, (dots, offset: number, whole: string) => (whole[offset + dots.length] === ")" ? "" : " "))
    .replace(/\bevenif\b/g, "even if")
    .replace(/([(‘“])\s+/g, "$1")
    .replace(/\s+([)”’])/g, "$1")
    .replace(/([,.;:!?])(?=[A-Za-z‘“])/g, "$1 ")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function parseUSFMBooks(files: readonly UsfmFile[], translationId: string, options: UsfmParseOptions = {}): ParsedTranslation {
  const { cleanup } = options;
  const clean = cleanup ? (text: string) => cleanup(cleanText(text)) : cleanText;
  const verses: ParsedVerse[] = [];
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    verses.push(...parseBook(file, clean));
  }
  return { id: translationId, name: translationId.toUpperCase(), language: "en", verses };
}

/** What a non-verse paragraph's text becomes in the layout; `null` leaves it out. */
function labelOf(paragraph: string, book: string): ((text: string) => Exclude<LayoutItem, { type: "text" } | { type: "break" }>) | null {
  if (/^(ms\d*|s\d*)$/.test(paragraph)) return (text) => ({ type: "heading", text, level: headingLevel(paragraph) });
  if (paragraph === "qa" || (paragraph === "d" && book === "PSA")) return (text) => ({ type: "title", text });
  if (paragraph === "sp") return (text) => ({ type: "speaker", text });
  return null;
}

function parseBook(file: UsfmFile, clean: (text: string) => string): ParsedVerse[] {
  const book = /^\\id\s+([0-9A-Z]{3})/m.exec(file.content)?.[1];
  if (!book) throw new Error(`${file.name}: no \\id line`);

  const verses: ParsedVerse[] = [];
  let chapter = 0;
  let verse = 0;
  let runs: Array<{ text: string; speaker: Speaker }> = [];
  let marks: LayoutMark[] = [];
  let inWj = false;
  // Layout waiting for the next verse text: the block a paragraph opened, and labels and breaks.
  let pendingBlock: LayoutBlock | undefined;
  let pendingItems: LayoutMark["items"] = [];
  let labelText = "";

  const append = (text: string, verseText: boolean) => {
    if (!verseText) labelText += text;
    if (!verse || !verseText || !text) return;
    if (text.trim() && (pendingBlock || pendingItems.length)) {
      marks.push({ at: runs.map((run) => run.text).join("").length, ...(pendingBlock ? { block: pendingBlock } : {}), items: pendingItems });
      pendingBlock = undefined;
      pendingItems = [];
    }
    const speaker: Speaker = inWj ? "jesus" : "narrator";
    const last = runs[runs.length - 1];
    if (last?.speaker === speaker) last.text += text;
    else runs.push({ text, speaker });
  };
  const flush = () => {
    if (verse && runs.map((run) => run.text).join("").trim()) verses.push(buildVerse(book, chapter, verse, runs, clean, marks));
    runs = [];
    marks = [];
    verse = 0;
  };

  for (const line of file.content.split(/\r?\n/)) {
    const paragraph = /^\\(\S+)/.exec(line)?.[1] ?? "";
    if (paragraph === "c") {
      flush();
      chapter = parseInt(line.slice(2), 10);
      pendingBlock = undefined;
      pendingItems = [];
      continue;
    }
    // A paragraph ends any character style left open, and its break reads as a space.
    inWj = false;
    append(" ", true);
    const verseText = !NON_VERSE_PARAGRAPHS.test(paragraph) && !(paragraph === "d" && book === "PSA");
    const body = paragraph ? line.slice(paragraph.length + 1).replace(/^ /, "") : line;
    const label = verseText ? null : labelOf(paragraph, book);
    labelText = "";
    if (paragraph === "b") pendingItems.push({ type: "break" });
    else if (verseText && paragraph) {
      const block = layoutBlock(paragraph);
      if (block !== undefined) pendingBlock = block ?? undefined;
    }

    // Markers: \v N, notes (\f … \f*, \x … \x*, skipped whole), \wj / \wj*, \ref text|target\ref*,
    // and any other character marker, whose content is kept and the marker itself dropped. Only
    // an opening marker owns the space after it; a space after a closing marker is text.
    const marker = /\\v\s+(\d+)\S*\s?|\\(f|fe|x)\s.*?\\\2\*|\\ref\s([^|\\]*)(?:\|[^\\]*)?\\ref\*|\\\+?wj(\*|\s)|\\\+?[a-z]+\d*(?:\*|\s)?/g;
    let at = 0;
    for (let match = marker.exec(body); match; match = marker.exec(body)) {
      append(body.slice(at, match.index), verseText);
      at = match.index + match[0].length;
      if (match[1] !== undefined) {
        flush();
        verse = parseInt(match[1], 10);
      } else if (match[3] !== undefined) append(match[3], verseText);
      else if (match[4] !== undefined) inWj = match[4] !== "*";
    }
    append(body.slice(at), verseText);
    const text = label ? clean(labelText) : "";
    if (label && text) pendingItems.push(label(text));
  }
  flush();
  return verses;
}
