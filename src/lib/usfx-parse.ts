import sax from "sax";

export type Speaker = "jesus" | "narrator";

export interface ParsedSegment {
  text: string;
  speaker: Speaker;
}

/**
 * How a block of verse text is set, named after the USFM paragraph markers it comes from:
 * `p` an indented paragraph, `m` one set flush (continuing after a quotation or poem), `pi` an
 * indented one, `q1`–`q3` poetry lines by indent, `qr` a line set right (Selah), `pc` a centered
 * line, `li1`–`li2` list items by indent.
 */
export type LayoutBlock = "p" | "m" | "pi" | "q1" | "q2" | "q3" | "qr" | "pc" | "li1" | "li2";

/**
 * A verse's place on the page, in reading order. The `text` items partition the verse text
 * exactly, as `segments` do; one with a `block` starts a new block set that way, and a verse
 * whose first text item has none continues the block the previous verse is in. `heading`,
 * `title` and `speaker` are text that is not verse text, set before the text that follows them:
 * a section heading (`level` 1 for a major section such as "BOOK 2", 2 for a section, 3 for a
 * subsection), a descriptive title (a Psalm's superscription, and Psalm 119's letters in the WEB
 * and BSB), and a speaker label (the Song of Songs in the WEB). `break` is a stanza break.
 */
export type LayoutItem =
  | { type: "text"; text: string; block?: LayoutBlock }
  | { type: "heading"; text: string; level: 1 | 2 | 3 }
  | { type: "title"; text: string }
  | { type: "speaker"; text: string }
  | { type: "break" };

/** Layout that sits before the verse text at a raw offset: new block, labels, stanza breaks. */
export interface LayoutMark {
  /** Offset into the verse's raw (uncleaned) run text. */
  at: number;
  block?: LayoutBlock;
  items: Array<Exclude<LayoutItem, { type: "text" }>>;
}

export interface ParsedVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  segments?: ParsedSegment[];
  layout?: LayoutItem[];
}

export interface ParsedTranslation {
  id: string;
  name: string;
  language: string;
  verses: ParsedVerse[];
}

const BOOK_ID_MAP: Record<string, string> = {
  GEN: "GEN", EXO: "EXO", LEV: "LEV", NUM: "NUM", DEU: "DEU", JOS: "JOS", JDG: "JDG", RUT: "RUT", "1SA": "1SA", "2SA": "2SA", "1KI": "1KI", "2KI": "2KI", "1CH": "1CH", "2CH": "2CH", EZR: "EZR", NEH: "NEH", EST: "EST", JOB: "JOB", PSA: "PSA", PRO: "PRO", ECC: "ECC", SNG: "SNG", ISA: "ISA", JER: "JER", LAM: "LAM", EZK: "EZK", DAN: "DAN", HOS: "HOS", JOL: "JOL", AMO: "AMO", OBA: "OBA", JON: "JON", MIC: "MIC", NAM: "NAM", HAB: "HAB", ZEP: "ZEP", HAG: "HAG", ZEC: "ZEC", MAL: "MAL", MAT: "MAT", MRK: "MRK", LUK: "LUK", JHN: "JHN", ACT: "ACT", ROM: "ROM", "1CO": "1CO", "2CO": "2CO", GAL: "GAL", EPH: "EPH", PHP: "PHP", COL: "COL", "1TH": "1TH", "2TH": "2TH", "1TI": "1TI", "2TI": "2TI", TIT: "TIT", PHM: "PHM", HEB: "HEB", JAS: "JAS", "1PE": "1PE", "2PE": "2PE", "1JN": "1JN", "2JN": "2JN", "3JN": "3JN", JUD: "JUD", REV: "REV", TOB: "TOB", JDT: "JDT", ESG: "ESG", WIS: "WIS", SIR: "SIR", BAR: "BAR", LJE: "LJE", S3Y: "S3Y", SUS: "SUS", BEL: "BEL", "1MA": "1MA", "2MA": "2MA", "3MA": "3MA", "4MA": "4MA", "1ES": "1ES", "2ES": "2ES", MAN: "MAN", PS2: "PS2", ODA: "ODA", PSS: "PSS",
  "1SM": "1SA", "2SM": "2SA", "1KG": "1KI", "2KG": "2KI", "1CR": "1CH", "2CR": "2CH", SOS: "SNG", SOL: "SNG", EZE: "EZK", JOE: "JOL", OBD: "OBA", NAH: "NAM", ZPH: "ZEP", ZCH: "ZEC", JOH: "JHN", JAN: "JHN", PHI: "PHP", "1TS": "1TH", "2TS": "2TH", "1TM": "1TI", "2TM": "2TI", PHL: "PHM", JAM: "JAS", "1PT": "1PE", "2PT": "2PE", "1JO": "1JN", "2JO": "2JN", "3JO": "3JN", GE: "GEN", EX: "EXO", LE: "LEV", NU: "NUM", DE: "DEU", JG: "JDG", RU: "RUT", "1S": "1SA", "2S": "2SA", PS: "PSA", PR: "PRO", EC: "ECC", CA: "SNG", LA: "LAM", DA: "DAN", HO: "HOS", AM: "AMO", OB: "OBA", JN: "JON", MI: "MIC", NA: "NAM", ZC: "ZEC", MT: "MAT", MK: "MRK", LK: "LUK", AC: "ACT", RO: "ROM", "1C": "1CO", "2C": "2CO", EP: "EPH", PH: "PHP", "1T": "1TH", "2T": "2TH", TI: "TIT", PM: "PHM", HE: "HEB", "1P": "1PE", "2P": "2PE", "1J": "1JN", "2J": "2JN", "3J": "3JN", JU: "JUD", RE: "REV",
};

export function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\s([.,;:!?])/g, "$1").trim();
}

/**
 * eBible's WLC ships a few words with their markup escaped into the text
 * (Deut 6:4: `'l s="H8085"'שְׁמַ֖'seg type="x-large"'ע'seg''/l'`). Drop the markup, keep the letters.
 */
export function repairEscapedMarkup(text: string): string {
  return text.replace(/'l s="[^"]*"'|'seg type="[^"]*"'|'seg'|'\/l'/g, "");
}

function normalizeBookId(id: string): string | null {
  return BOOK_ID_MAP[id.toUpperCase()] ?? null;
}

const BLOCKS: Record<string, LayoutBlock> = {
  p: "p", pmo: "p", m: "m", mi: "m", mr: "m", pi: "pi", pi1: "pi", pi2: "pi",
  q: "q1", q1: "q1", q2: "q2", q3: "q3", q4: "q3", qr: "qr", pc: "pc",
  li: "li1", li1: "li1", li2: "li2", li3: "li2", li4: "li2",
};

/**
 * The block a paragraph marker of verse text starts: `undefined` for one that continues the
 * current block (`nb`), `null` for one that is not verse text at all (book titles and
 * introductions, which come before any verse). Anything else unfamiliar is set as a paragraph.
 */
export function layoutBlock(marker: string): LayoutBlock | null | undefined {
  if (marker === "nb") return undefined;
  if (/^(i[a-z]*\d*|mt\d*|mte\d*|h|toc\d*|cl|cd|rem)$/.test(marker)) return null;
  return BLOCKS[marker] ?? "p";
}

/** Heading level for a section marker: `ms` major sections 1, `s`/`s1` 2, `s2` and deeper 3. */
export function headingLevel(marker: string): 1 | 2 | 3 {
  if (marker.startsWith("ms")) return 1;
  return /^s[2-9]$/.test(marker) ? 3 : 2;
}

/**
 * Split the verse at each mark the way `segments` split it at each speaker change: a piece is
 * the cleaned text its raw run adds to the cleaned verse, so the pieces partition the verse text.
 */
function buildLayout(raw: string, text: string, marks: readonly LayoutMark[], clean: (text: string) => string, ref: string): LayoutItem[] {
  const layout: LayoutItem[] = [];
  const offsets = [...marks.map((mark) => mark.at), raw.length];
  const cleanTo = (at: number) => (at >= raw.length ? text : clean(raw.slice(0, at)));
  const lead = cleanTo(offsets[0]!);
  if (lead) layout.push({ type: "text", text: lead });
  marks.forEach((mark, index) => {
    const start = cleanTo(mark.at);
    const end = cleanTo(offsets[index + 1]!);
    if (!end.startsWith(start)) throw new Error(`Layout text mismatch for ${ref}`);
    layout.push(...mark.items);
    const piece = end.slice(start.length);
    if (piece) layout.push({ type: "text", text: piece, ...(mark.block ? { block: mark.block } : {}) });
  });
  const joined = layout.map((item) => (item.type === "text" ? item.text : "")).join("");
  if (joined !== text) throw new Error(`Layout text mismatch for ${ref}`);
  return layout;
}

/**
 * A verse from its raw text runs. Each segment is the cleaned text its run adds to the cleaned
 * verse, so the segments always partition the verse text exactly. `clean` is the text cleanup
 * (whitespace by default; a source can add its own normalization).
 */
export function buildVerse(
  book: string,
  chapter: number,
  verse: number,
  runs: ReadonlyArray<{ text: string; speaker: Speaker }>,
  clean: (text: string) => string = cleanText,
  marks: readonly LayoutMark[] = []
): ParsedVerse {
  const text = clean(runs.map((run) => run.text).join(""));
  const rawSegments = runs.some((run) => run.speaker === "jesus")
    ? runs.reduce<ParsedSegment[]>((segments, run, index) => {
        const end = clean(runs.slice(0, index + 1).map((item) => item.text).join(""));
        const start = clean(runs.slice(0, index).map((item) => item.text).join(""));
        const segmentText = end.slice(start.length);
        if (segmentText) {
          const previous = segments[segments.length - 1];
          if (previous?.speaker === run.speaker) previous.text += segmentText;
          else segments.push({ text: segmentText, speaker: run.speaker });
        }
        return segments;
      }, [])
    : undefined;
  if (rawSegments && rawSegments.map((segment) => segment.text).join("") !== text) {
    throw new Error(`Segment text mismatch for ${book} ${chapter}:${verse}`);
  }
  const layout = marks.length
    ? buildLayout(runs.map((run) => run.text).join(""), text, marks, clean, `${book} ${chapter}:${verse}`)
    : undefined;
  return {
    book, chapter, verse, text,
    ...(rawSegments?.length ? { segments: rawSegments } : {}),
    ...(layout ? { layout } : {}),
  };
}

export interface ParseOptions {
  /**
   * Reproduce the parser before the heading, escaped-markup and label fixes, with no layout.
   * Used only by db:backfill:words to prove a stored verse differs from the current source by
   * those fixes alone (and not by an upstream revision).
   */
  legacy?: boolean;
}

type LabelItem = Exclude<LayoutItem, { type: "text" } | { type: "break" }>;

/** A USFX element whose text is a label rather than verse text: what it becomes in the layout. */
function labelOf(tag: string, style: string): ((text: string) => LabelItem) | null {
  if (tag === "s") return (text) => ({ type: "heading", text, level: headingLevel(style || "s") });
  if (tag === "d") return (text) => ({ type: "title", text });
  if (tag !== "p") return null;
  if (/^(ms\d*|s\d*)$/.test(style)) return (text) => ({ type: "heading", text, level: headingLevel(style) });
  if (style === "qa") return (text) => ({ type: "title", text });
  if (style === "sp") return (text) => ({ type: "speaker", text });
  return null;
}

export function parseUSFXBuffer(buffer: Buffer, translationId: string, options: ParseOptions = {}): ParsedTranslation {
  const parser = sax.parser(true, { trim: false });
  const verses: ParsedVerse[] = [];
  let currentBook: string | null = null;
  let currentChapter = 0;
  let currentVerse = 0;
  let verseText = "";
  let runs: Array<{ text: string; speaker: Speaker }> = [];
  let marks: LayoutMark[] = [];
  let inVerse = false;
  let inNote = false;
  let inHeading = false;
  let inWj = false;
  // Layout waiting for the next verse text: the block a paragraph opened, and labels and breaks.
  let pendingBlock: LayoutBlock | undefined;
  let pendingItems: LayoutMark["items"] = [];
  // The label element being read (a heading, title or speaker), and its text so far.
  let label: { tag: string; make: (text: string) => LabelItem; text: string } | null = null;

  const append = (raw: string) => {
    const text = options.legacy ? raw : repairEscapedMarkup(raw);
    if (label && !inNote && !options.legacy) label.text += text;
    if (!inVerse || inNote || (inHeading && !options.legacy) || (label && !options.legacy) || !text) return;
    if (!options.legacy && text.trim() && (pendingBlock || pendingItems.length)) {
      marks.push({ at: verseText.length, ...(pendingBlock ? { block: pendingBlock } : {}), items: pendingItems });
      pendingBlock = undefined;
      pendingItems = [];
    }
    verseText += text;
    const speaker: Speaker = inWj ? "jesus" : "narrator";
    const last = runs[runs.length - 1];
    if (last?.speaker === speaker) last.text += text;
    else runs.push({ text, speaker });
  };

  const flushVerse = () => {
    if (inVerse && verseText.trim() && currentBook) {
      verses.push(buildVerse(currentBook, currentChapter, currentVerse, runs, cleanText, marks));
    }
    verseText = "";
    runs = [];
    marks = [];
    inVerse = false;
  };

  // Layout left over at a chapter's end has no verse text to sit before (the KJV's subscriptions
  // to Paul's letters); it is dropped with the verse text it would have introduced.
  const clearPending = () => {
    pendingBlock = undefined;
    pendingItems = [];
  };

  parser.onopentag = (node) => {
    const tag = node.name.toLowerCase();
    const style = String(node.attributes.style ?? "");
    if (tag === "book") {
      const id = node.attributes.id as string;
      currentBook = id ? normalizeBookId(id) : null;
      currentChapter = 0;
      currentVerse = 0;
      clearPending();
    } else if (tag === "c") {
      flushVerse();
      clearPending();
      currentChapter = parseInt(node.attributes.id as string, 10);
      currentVerse = 0;
    } else if (tag === "v" && currentBook && currentChapter > 0) {
      flushVerse();
      currentVerse = parseInt(node.attributes.id as string, 10);
      inVerse = true;
    } else if (["f", "x", "fe", "note"].includes(tag)) inNote = true;
    else if (tag === "wj") inWj = true;
    else if (tag === "b") pendingItems.push({ type: "break" });
    else {
      const make = labelOf(tag, style);
      // Section headings (\s) sit between verses; without this they leak into the previous verse.
      if (tag === "s") inHeading = true;
      if (make) label = { tag, make, text: "" };
      else if (tag === "p" || tag === "q") {
        const block = layoutBlock(style || (tag === "q" ? `q${node.attributes.level ?? 1}` : "p"));
        if (block !== undefined) pendingBlock = block ?? undefined;
      }
    }
  };
  parser.onclosetag = (tagName) => {
    const tag = tagName.toLowerCase();
    if (["f", "x", "fe", "note"].includes(tag)) inNote = false;
    else if (tag === "wj") inWj = false;
    if (tag === "s") inHeading = false;
    if (label?.tag === tag) {
      const text = cleanText(label.text);
      if (text) pendingItems.push(label.make(text));
      label = null;
    }
    if (["p", "q", "q1", "q2"].includes(tag)) append(" ");
    else if (tag === "book") {
      flushVerse();
      currentBook = null;
    }
  };
  parser.ontext = append;
  parser.write(buffer.toString("utf-8")).close();
  flushVerse();
  return { id: translationId, name: translationId.toUpperCase(), language: "en", verses };
}
