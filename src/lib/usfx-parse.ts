import sax from "sax";

export type Speaker = "jesus" | "narrator";

export interface ParsedSegment {
  text: string;
  speaker: Speaker;
}

export interface ParsedVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  segments?: ParsedSegment[];
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

function normalizeBookId(id: string): string | null {
  return BOOK_ID_MAP[id.toUpperCase()] ?? null;
}

export function parseUSFXBuffer(buffer: Buffer, translationId: string): ParsedTranslation {
  const parser = sax.parser(true, { trim: false });
  const verses: ParsedVerse[] = [];
  let currentBook: string | null = null;
  let currentChapter = 0;
  let currentVerse = 0;
  let verseText = "";
  let runs: Array<{ text: string; speaker: Speaker }> = [];
  let inVerse = false;
  let inNote = false;
  let inWj = false;

  const append = (text: string) => {
    if (!inVerse || inNote || !text) return;
    verseText += text;
    const speaker: Speaker = inWj ? "jesus" : "narrator";
    const last = runs[runs.length - 1];
    if (last?.speaker === speaker) last.text += text;
    else runs.push({ text, speaker });
  };

  const flushVerse = () => {
    if (!inVerse || !verseText.trim() || !currentBook) return;
    const text = cleanText(verseText);
    const rawSegments = runs.some((run) => run.speaker === "jesus")
      ? runs.reduce<ParsedSegment[]>((segments, run, index) => {
          const end = cleanText(runs.slice(0, index + 1).map((item) => item.text).join(""));
          const start = cleanText(runs.slice(0, index).map((item) => item.text).join(""));
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
      throw new Error(`Segment text mismatch for ${currentBook} ${currentChapter}:${currentVerse}`);
    }
    verses.push({ book: currentBook, chapter: currentChapter, verse: currentVerse, text, ...(rawSegments?.length ? { segments: rawSegments } : {}) });
    verseText = "";
    runs = [];
    inVerse = false;
  };

  parser.onopentag = (node) => {
    const tag = node.name.toLowerCase();
    if (tag === "book") {
      const id = node.attributes.id as string;
      currentBook = id ? normalizeBookId(id) : null;
      currentChapter = 0;
      currentVerse = 0;
    } else if (tag === "c") {
      flushVerse();
      currentChapter = parseInt(node.attributes.id as string, 10);
      currentVerse = 0;
    } else if (tag === "v" && currentBook && currentChapter > 0) {
      flushVerse();
      currentVerse = parseInt(node.attributes.id as string, 10);
      inVerse = true;
    } else if (["f", "x", "fe", "note"].includes(tag)) inNote = true;
    else if (tag === "wj") inWj = true;
  };
  parser.onclosetag = (tagName) => {
    const tag = tagName.toLowerCase();
    if (["f", "x", "fe", "note"].includes(tag)) inNote = false;
    else if (tag === "wj") inWj = false;
    else if (["p", "q", "q1", "q2"].includes(tag)) append(" ");
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
