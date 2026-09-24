/**
 * Tag every word of the tcgnt Greek NT and the WLC Hebrew OT with lemma, Strong's number,
 * morphology and an English gloss, and build the lexicons those tags point at.
 *
 * Run after data:parse (it rewrites data/parsed/tcgnt.json and wlc.json in place) and
 * before db:seed / db:backfill:words. `--only=tcgnt` or `--only=wlc` tags one of them.
 *
 * Each chapter's text is aligned word-by-word against the tagged source, so edition
 * differences (a missing δέ, a moved ὑμῶν, a verse numbered differently) cost only the
 * words involved. Sources (attribution in src/lib/word-sources.ts):
 *
 * Greek
 *   - byztxt Robinson–Pierpont 2018 with Strong's + parsing (public domain): the same
 *     edition as tcgnt, so it supplies Strong's numbers and Robinson morphology.
 *   - STEPBible TAGNT (CC BY 4.0): contextual English glosses, and tags for the few words
 *     where tcgnt departs from RP2018.
 *   - STEPBible TBESG (CC BY 4.0): lemma, transliteration, part of speech, short gloss.
 *   - Strong's Greek dictionary XML (public domain): definition and pronunciation respelling.
 * Hebrew
 *   - STEPBible TAHOT (CC BY 4.0, OSHB morphology): Strong's, OSHB morphology and glosses
 *     per prefix, word and suffix.
 *   - STEPBible TBESH (CC BY 4.0) and Strong's Hebrew dictionary (public domain): lexicon.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import sax from "sax";
import {
  MATCH_FUZZY,
  MATCH_MOVABLE,
  alignSequences,
  movableVariants,
  cleanGloss,
  describePartOfSpeech,
  normalizeTagntMorph,
  normalizeWord,
  respellPronunciation,
  splitByLetterCounts,
  splitTokenWords,
  strongId,
  tokenizeVerse,
  wordMatchScore,
  type LexiconEntry,
  type VerseWord,
  type WordPart,
} from "../../src/lib/word-tagging.js";

const PARSED_DIR = process.env.PARSED_DIR ?? join(process.cwd(), "data", "parsed");
const WORDS_DIR = join(process.cwd(), "data", "sources", "words");
const LEXICON_DIR = join(PARSED_DIR, "lexicon");

interface ParsedVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  words?: VerseWord[];
  [key: string]: unknown;
}

interface ParsedTranslation {
  id: string;
  verses: ParsedVerse[];
  [key: string]: unknown;
}

interface SourceWord {
  verse: number;
  norm: string;
  strong?: string;
  morph?: string;
}

interface TagntWord extends SourceWord {
  lemma: string;
  gloss?: string;
}

const BYZTXT_BOOKS: Record<string, string> = {
  MAT: "MAT", MAR: "MRK", LUK: "LUK", JOH: "JHN", ACT: "ACT", ROM: "ROM", "1CO": "1CO", "2CO": "2CO",
  GAL: "GAL", EPH: "EPH", PHP: "PHP", COL: "COL", "1TH": "1TH", "2TH": "2TH", "1TI": "1TI", "2TI": "2TI",
  TIT: "TIT", PHM: "PHM", HEB: "HEB", JAM: "JAS", "1PE": "1PE", "2PE": "2PE", "1JO": "1JN", "2JO": "2JN",
  "3JO": "3JN", JUD: "JUD", REV: "REV",
};

const chapterKey = (book: string, chapter: number) => `${book} ${chapter}`;

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * byztxt CSV rows: `chapter,verse,word 1841 {N-ASF} word 3739 {R-ASF} …`.
 * Ambiguous forms carry a second analysis (`αγαπα 25 {V-PAI-3S} 25 {V-PAS-3S}`); the first wins.
 */
async function readByztxt(): Promise<Map<string, SourceWord[]>> {
  const chapters = new Map<string, SourceWord[]>();
  for (const [file, book] of Object.entries(BYZTXT_BOOKS)) {
    const csv = await readFile(join(WORDS_DIR, `byztxt-${file}.csv`), "utf8");
    for (const line of csv.split(/\r?\n/).slice(1)) {
      const match = line.match(/^(\d+),(\d+),(.*)$/);
      if (!match) continue;
      const chapter = Number(match[1]);
      const verse = Number(match[2]);
      let current: SourceWord | undefined;
      for (const token of match[3]!.trim().split(/\s+/)) {
        if (/^\d+$/.test(token)) {
          if (current && !current.strong) current.strong = strongId("G", token);
        } else if (/^\{.*\}$/.test(token)) {
          if (current && !current.morph) current.morph = token.slice(1, -1);
        } else {
          current = { verse, norm: normalizeWord(token) };
          push(chapters, chapterKey(book, chapter), current);
        }
      }
    }
  }
  return chapters;
}

/**
 * TAGNT word rows: `Luk.9.31#02=NKO \t ὀφθέντες (ophthentes) \t having appeared \t G3700H=V-APP-NPM \t ὁράω=to see \t editions …`.
 * References may carry an alternate versification in brackets (`2Co.13.13[13.14]`); the first is used.
 */
async function readTagnt(lemmaStrong: Map<string, string>): Promise<Map<string, TagntWord[]>> {
  const chapters = new Map<string, TagntWord[]>();
  for (const range of ["Mat-Jhn", "Act-Rev"]) {
    const text = await readFile(join(WORDS_DIR, `TAGNT-${range}.txt`), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const ref = line.match(/^([0-9A-Za-z]{3})\.(\d+)\.(\d+)(?:[[({][^\])}]*[\])}])?#\d+=/);
      if (!ref) continue;
      const fields = line.split("\t");
      const greek = fields[1]?.replace(/\s*\(.*$/, "") ?? "";
      // Compounds are tagged as several words ("G5228=PREP + G3029=ADV"); keep the first.
      const [dStrong = "", morph] = (fields[3] ?? "").split(/\s*\+\s*/)[0]!.split("=");
      const lemma = (fields[4] ?? "").split("=")[0]?.trim() ?? "";
      // Prefer the lemma-level number for the dictionary form (ὁράω → G3708, not G3700).
      const strong = lemmaStrong.get(normalizeWord(lemma)) ?? strongId("G", dStrong);
      push(chapters, chapterKey(ref[1]!.toUpperCase(), Number(ref[2])), {
        verse: Number(ref[3]),
        norm: normalizeWord(greek),
        strong,
        morph: normalizeTagntMorph(morph),
        lemma,
        gloss: cleanGloss(fields[2]),
      });
    }
  }
  return chapters;
}

interface TbesgEntry {
  strong: string;
  lemma: string;
  transliteration?: string;
  partOfSpeech?: string;
  gloss?: string;
}

/** TBESG rows: eStrong, dStrong, uStrong, Greek, transliteration, morph, gloss, meaning. First row per eStrong wins. */
async function readTbesg(): Promise<Map<string, TbesgEntry>> {
  const entries = new Map<string, TbesgEntry>();
  const text = await readFile(join(WORDS_DIR, "TBESG.txt"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!/^G\d{4,5}\t/.test(line)) continue;
    const fields = line.split("\t");
    const strong = strongId("G", fields[0]!);
    if (!strong || entries.has(strong)) continue;
    // Disambiguated rows gloss as "to see: see"; the lemma-level gloss is the part before the colon.
    const gloss = fields[6]?.split(/:\s/)[0]?.trim();
    entries.set(strong, {
      strong,
      lemma: fields[3]!.trim().normalize("NFC"),
      transliteration: fields[4]?.trim().normalize("NFC") || undefined,
      partOfSpeech: describePartOfSpeech(fields[5]),
      gloss: gloss || undefined,
    });
  }
  return entries;
}

interface StrongsEntry {
  lemma?: string;
  pronunciation?: string;
  definition?: string;
}

/** Strong's Greek dictionary XML (Ulrik Petersen, public domain). */
async function readStrongsGreek(): Promise<Map<string, StrongsEntry>> {
  const xml = await readFile(join(WORDS_DIR, "strongsgreek.xml"), "utf8");
  const raw = new Map<string, { lemma?: string; pronunciation?: string; definition: Array<string | { ref: string }> }>();
  const parser = sax.parser(true, { trim: false });
  let current: { lemma?: string; pronunciation?: string; definition: Array<string | { ref: string }> } | undefined;
  let inDefinition = false;
  let inHeader = false;
  parser.onopentag = (node) => {
    const attrs = node.attributes as Record<string, string>;
    if (node.name === "entry") {
      current = { definition: [] };
      raw.set(`G${Number.parseInt(attrs.strongs ?? "", 10)}`, current);
    } else if (!current) return;
    else if (node.name === "greek" && !current.lemma && !inDefinition) current.lemma = attrs.unicode?.normalize("NFC");
    else if (node.name === "pronunciation" && !current.pronunciation) current.pronunciation = attrs.strongs;
    else if (node.name === "strongs_def") inDefinition = true;
    else if (inDefinition && node.name === "strongsref") current.definition.push({ ref: `${attrs.language === "HEBREW" ? "H" : "G"}${Number.parseInt(attrs.strongs ?? "", 10)}` });
    else if (inDefinition && node.name === "greek") current.definition.push(attrs.unicode ?? "");
    else if (node.name === "strongs") inHeader = true;
  };
  parser.onclosetag = (name) => {
    if (name === "strongs_def") inDefinition = false;
    else if (name === "strongs") inHeader = false;
    else if (name === "entry") current = undefined;
  };
  parser.ontext = (text) => {
    if (current && inDefinition && !inHeader) current.definition.push(text);
  };
  parser.write(xml).close();

  const entries = new Map<string, StrongsEntry>();
  for (const [strong, entry] of raw) {
    const definition = entry.definition
      .map((part) => (typeof part === "string" ? part : raw.get(part.ref)?.lemma ?? part.ref))
      .join("")
      .replace(/\s+/g, " ")
      .trim()
      .normalize("NFC");
    entries.set(strong, {
      lemma: entry.lemma,
      pronunciation: respellPronunciation(entry.pronunciation),
      definition: definition || undefined,
    });
  }
  return entries;
}

interface Unit {
  verseIndex: number;
  tokenIndex: number;
  surface: string;
  norm: string;
}

interface FormAnalysis {
  strong?: string;
  morph?: string;
  count: number;
}

/** Every analysis RP2018 gives each inflected form, for words tcgnt has where RP2018 does not. */
function buildFormIndex(byz: Map<string, SourceWord[]>): Map<string, FormAnalysis[]> {
  const index = new Map<string, FormAnalysis[]>();
  for (const words of byz.values()) {
    for (const word of words) {
      const analyses = index.get(word.norm) ?? [];
      const existing = analyses.find((a) => a.strong === word.strong && a.morph === word.morph);
      if (existing) existing.count++;
      else analyses.push({ strong: word.strong, morph: word.morph, count: 1 });
      index.set(word.norm, analyses);
    }
  }
  for (const analyses of index.values()) analyses.sort((a, b) => b.count - a.count);
  return index;
}

function pickAnalysis(analyses: FormAnalysis[], hint: TagntWord | undefined): FormAnalysis {
  return (
    analyses.find((a) => hint && a.strong === hint.strong && a.morph === hint.morph) ??
    analyses.find((a) => hint && a.morph === hint.morph) ??
    analyses.find((a) => hint && a.strong === hint.strong) ??
    analyses[0]!
  );
}

type TagSource = "rp2018" | "rp2018-form" | "tagnt" | "none";

async function tagGreek() {
  const translationPath = join(PARSED_DIR, "tcgnt.json");
  const translation = JSON.parse(await readFile(translationPath, "utf8")) as ParsedTranslation;

  const [byz, tbesg, strongs] = await Promise.all([readByztxt(), readTbesg(), readStrongsGreek()]);
  const lemmaStrong = new Map<string, string>();
  for (const entry of tbesg.values()) {
    const key = normalizeWord(entry.lemma);
    if (!lemmaStrong.has(key)) lemmaStrong.set(key, entry.strong);
  }
  const tagnt = await readTagnt(lemmaStrong);
  const formIndex = buildFormIndex(byz);

  const byChapter = new Map<string, number[]>();
  translation.verses.forEach((verse, index) => push(byChapter, chapterKey(verse.book, verse.chapter), index));

  const sourceCounts: Record<TagSource, number> = { rp2018: 0, "rp2018-form": 0, tagnt: 0, none: 0 };
  const glossCounts = { contextual: 0, lexicon: 0, none: 0 };
  const report: string[] = [];
  const occurrences = new Map<string, number>();

  for (const [key, verseIndexes] of byChapter) {
    const units: Unit[] = [];
    const verseTokens = new Map<number, string[]>();
    for (const verseIndex of verseIndexes) {
      const tokens = tokenizeVerse(translation.verses[verseIndex]!.text);
      verseTokens.set(verseIndex, tokens);
      tokens.forEach((token, tokenIndex) => {
        for (const surface of splitTokenWords(token)) {
          units.push({ verseIndex, tokenIndex, surface, norm: normalizeWord(surface) });
        }
      });
    }

    const byzWords = byz.get(key) ?? [];
    const tagntWords = tagnt.get(key) ?? [];
    const norms = units.map((unit) => unit.norm);
    const byzAlignment = alignSequences(norms, byzWords.map((word) => word.norm));
    const tagntAlignment = alignSequences(norms, tagntWords.map((word) => word.norm));

    const tagged: Array<{ part: WordPart; source: TagSource }> = units.map((unit, i) => {
      const byzPair = byzAlignment[i]!;
      const tagntPair = tagntAlignment[i]!;
      const hint = tagntPair.index >= 0 ? tagntWords[tagntPair.index] : undefined;
      const known = movableVariants(unit.norm).map((form) => formIndex.get(form)).find(Boolean);

      let strong: string | undefined;
      let morph: string | undefined;
      let source: TagSource = "none";
      if (byzPair.index >= 0) {
        const word = byzWords[byzPair.index]!;
        // A fuzzy pair (ἐπεκάλεσαν ~ ἐκάλεσαν) is trusted only if RP2018 never uses
        // this exact form for a different word.
        const trusted = byzPair.score >= MATCH_MOVABLE || !known || known.some((a) => a.strong === word.strong);
        if (trusted) {
          strong = word.strong;
          morph = word.morph;
          source = "rp2018";
        }
      }
      if (source === "none" && known) {
        const analysis = pickAnalysis(known, hint);
        strong = analysis.strong;
        morph = analysis.morph;
        source = "rp2018-form";
      }
      if (source === "none" && hint && tagntPair.score >= MATCH_FUZZY) {
        strong = hint.strong;
        morph = hint.morph;
        source = "tagnt";
      }

      // Contextual gloss only when TAGNT's word is the same lemma we tagged.
      let gloss: string | undefined;
      if (hint && strong && (hint.strong === strong || lemmaStrong.get(normalizeWord(hint.lemma)) === strong)) {
        gloss = hint.gloss;
      }
      if (gloss) glossCounts.contextual++;
      else if (strong && tbesg.get(strong)?.gloss) {
        gloss = tbesg.get(strong)!.gloss;
        glossCounts.lexicon++;
      } else glossCounts.none++;

      const lemma = strong ? tbesg.get(strong)?.lemma ?? strongs.get(strong)?.lemma : undefined;
      sourceCounts[source]++;
      if (strong) occurrences.set(strong, (occurrences.get(strong) ?? 0) + 1);
      return { part: compact({ surface: unit.surface, lemma, strong, morph, gloss }), source };
    });

    for (const verseIndex of verseIndexes) {
      const verse = translation.verses[verseIndex]!;
      const tokens = verseTokens.get(verseIndex)!;
      const words: VerseWord[] = tokens.map((surface, tokenIndex) => {
        const parts = tagged.filter((_, i) => units[i]!.verseIndex === verseIndex && units[i]!.tokenIndex === tokenIndex);
        if (parts.length === 1) return { ...parts[0]!.part, surface };
        // Several words in one whitespace token: the first is the main word.
        const { surface: _surface, ...main } = parts[0]?.part ?? { surface };
        return compact({ surface, ...main, parts: parts.map((p) => p.part) });
      });
      verse.words = words;

      const issues = tagged
        .filter((_, i) => units[i]!.verseIndex === verseIndex)
        .filter((t) => t.source !== "rp2018");
      if (issues.length) {
        report.push(
          `${verse.book} ${verse.chapter}:${verse.verse}\t` +
            issues.map((t) => `${t.part.surface}=${t.source === "none" ? "untagged" : `${t.part.strong ?? "?"}/${t.part.morph ?? "?"} (${t.source})`}`).join("; ")
        );
      }
    }
  }

  await writeFile(translationPath, JSON.stringify(translation, null, 2));

  // Lexicon: every Strong's-range entry, plus anything the tags point at.
  const ids = new Set<string>([...tbesg.keys()].filter((id) => lexiconNumber(id) <= 5624));
  const lexicon = await writeLexicon("grc", ids, occurrences, (id) => {
    const step = tbesg.get(id);
    const strong = strongs.get(id);
    return { ...step, lemma: step?.lemma ?? strong?.lemma, pronunciation: strong?.pronunciation, definition: strong?.definition };
  });

  const total = Object.values(sourceCounts).reduce((a, b) => a + b, 0);
  const summary = [
    `tcgnt words: ${total}`,
    `  tagged from aligned RP2018:      ${sourceCounts.rp2018}`,
    `  tagged from RP2018 form index:   ${sourceCounts["rp2018-form"]}`,
    `  tagged from TAGNT:               ${sourceCounts.tagnt}`,
    `  untagged:                        ${sourceCounts.none}`,
    `glosses: contextual ${glossCounts.contextual}, lexicon ${glossCounts.lexicon}, none ${glossCounts.none}`,
    `verses where tcgnt departs from RP2018: ${report.length}`,
    `lexicon entries: ${lexicon.length}`,
  ];
  await writeFile(
    join(PARSED_DIR, "tcgnt-tagging-report.txt"),
    [...summary, "", "Verse\tWords not tagged from the aligned RP2018 word (surface=strong/morph (source))", ...report].join("\n") + "\n"
  );
  console.log(summary.join("\n"));
}

const lexiconNumber = (id: string) => Number.parseInt(id.slice(1), 10);

/** Write data/parsed/lexicon/<language>.json from lexicon ids (plus every id the tags use). */
async function writeLexicon(
  language: string,
  ids: Set<string>,
  occurrences: Map<string, number>,
  lookup: (id: string) => Partial<Omit<LexiconEntry, "strong" | "language" | "occurrences">>
): Promise<LexiconEntry[]> {
  for (const id of occurrences.keys()) ids.add(id);
  const sorted = [...ids].sort((a, b) => lexiconNumber(a) - lexiconNumber(b) || a.localeCompare(b));
  const lexicon: LexiconEntry[] = [];
  for (const id of sorted) {
    const found = lookup(id);
    if (!found.lemma) continue;
    lexicon.push(
      compact({
        strong: id,
        lemma: found.lemma,
        language,
        transliteration: found.transliteration,
        pronunciation: found.pronunciation,
        partOfSpeech: found.partOfSpeech,
        gloss: found.gloss,
        definition: found.definition,
        occurrences: occurrences.get(id) ?? 0,
      })
    );
  }
  await mkdir(LEXICON_DIR, { recursive: true });
  await writeFile(join(LEXICON_DIR, `${language}.json`), JSON.stringify({ language, entries: lexicon }));
  return lexicon;
}

// ---------------------------------------------------------------------------
// Hebrew OT (wlc)
// ---------------------------------------------------------------------------

interface TahotPart {
  text: string;
  strong?: string;
  morph?: string;
  gloss?: string;
}

interface TahotWord {
  verse: number;
  norm: string;
  parts: TahotPart[];
  /** Index of the part wrapped in {} (the word itself, not a prefix or suffix). */
  main: number;
  /** OSHB code for the whole word, as-is ("HC/Td/Ncfsa"). */
  morph?: string;
  gloss?: string;
  /** Written form (Ketiv) of a Qere row: the WLC text shows these unpointed. */
  ketiv?: TahotWord;
}

function tahotParts(texts: string[], strongs: string[], morphs: string[], glosses: string[]): TahotPart[] {
  // Morph parts after the first omit the language letter: HC/Td/Ncfsa → HC, HTd, HNcfsa.
  const language = morphs[0]?.[0] ?? "H";
  return texts.map((partText, i) => ({
    text: partText,
    strong: strongs[i] ? strongId("H", strongs[i]!) : undefined,
    morph: morphs[i] ? (i === 0 ? morphs[i] : `${language}${morphs[i]}`) : undefined,
    gloss: texts.length === glosses.length ? cleanGloss(glosses[i]) : undefined,
  }));
}

/** Qere rows note the Ketiv: `K= tzei.dah (צֵידָה\׃) "food" (H6720\H9016=HNcbsa)`. */
function parseKetiv(note: string | undefined, verse: number): TahotWord | undefined {
  const match = note?.match(/K=\s*\S+\s*\(([^)]*)\)\s*"([^"]*)"\s*\(([^=)]*)=([^)]*)\)/);
  if (!match) return undefined;
  const texts = match[1]!.split("\\")[0]!.split("/").map((t) => t.trim());
  const strongs = match[3]!.split("\\")[0]!.split("/").map((t) => t.trim());
  const morphs = match[4]!.trim().split("/");
  const glosses = match[2]!.split("/").map((g) => g.trim());
  const parts = tahotParts(texts, strongs, morphs, glosses);
  // No braces here: the main word is the first part that is not a prefix/suffix (H9001+).
  const main = Math.max(0, parts.findIndex((part) => part.strong && lexiconNumber(part.strong) < 9000));
  return { verse, norm: normalizeWord(texts.join("")), parts, main, morph: match[4]!.trim(), gloss: cleanGloss(glosses.join(" ")) };
}

/**
 * TAHOT word rows: `Gen.1.2#01=L 	 וְ/הָ/אָ֗רֶץ 	 translit 	 and/ the/ earth 	 H9002/H9009/{H0776G} 	 HC/Td/Ncfsa …`.
 * `/` separates prefixes and suffixes, `\` trailing punctuation (maqaf, sof pasuq).
 * References are English, with the Hebrew versification in parentheses when it differs
 * (`Gen.31.55(32.1)`); WLC follows the Hebrew, so that one is used.
 */
async function readTahot(): Promise<Map<string, TahotWord[]>> {
  const chapters = new Map<string, TahotWord[]>();
  for (const range of ["Gen-Deu", "Jos-Est", "Job-Sng", "Isa-Mal"]) {
    const text = await readFile(join(WORDS_DIR, `TAHOT-${range}.txt`), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const ref = line.match(/^([0-9A-Za-z]{3})\.(\d+)\.(\d+)(?:\((\d+)\.(\d+)\))?[^#\t]*#\d+=/);
      if (!ref) continue;
      const fields = line.split("\t");
      const texts = (fields[1] ?? "").split("\\")[0]!.split("/").map((t) => t.trim());
      const strongs = (fields[4] ?? "").split("\\")[0]!.split("/").map((t) => t.trim());
      const morphs = (fields[5] ?? "").trim().split("/");
      const glosses = (fields[3] ?? "").split("/").map((g) => g.trim());
      if (!texts.join("")) continue;
      const verse = Number(ref[5] ?? ref[3]);
      push(chapters, chapterKey(ref[1]!.toUpperCase(), Number(ref[4] ?? ref[2])), {
        verse,
        norm: normalizeWord(texts.join("")),
        parts: tahotParts(texts, strongs, morphs, glosses),
        main: Math.max(0, strongs.findIndex((value) => value.startsWith("{"))),
        morph: fields[5]?.trim() || undefined,
        gloss: cleanGloss(glosses.join(" ")),
        ketiv: parseKetiv(fields[6], verse),
      });
    }
  }
  return chapters;
}

/** TBESH rows: eStrong ("H1254a"), dStrong, uStrong, Hebrew, transliteration, morph, gloss, meaning. */
async function readTbesh(): Promise<Map<string, TbesgEntry>> {
  const entries = new Map<string, TbesgEntry>();
  const text = await readFile(join(WORDS_DIR, "TBESH.txt"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!/^H\d{4}[a-f]?\t/.test(line)) continue;
    const fields = line.split("\t");
    const strong = strongId("H", fields[0]!);
    if (!strong || entries.has(strong)) continue;
    const gloss = fields[6]?.split(/:\s/)[0]?.trim();
    entries.set(strong, {
      strong,
      // Prefix entries are written "/וְ"; transliterations mark syllables with dots ("e.lo.him").
      lemma: fields[3]!.replace(/\//g, "").trim().normalize("NFC"),
      transliteration: fields[4]?.replace(/\./g, "").trim().normalize("NFC") || undefined,
      partOfSpeech: describePartOfSpeech(fields[5]),
      gloss: gloss || undefined,
    });
  }
  return entries;
}

/** Strong's Hebrew dictionary (OSIS): pronunciation (the POS attribute) and definition (explanation note). */
async function readStrongsHebrew(): Promise<Map<string, StrongsEntry>> {
  const xml = await readFile(join(WORDS_DIR, "StrongHebrewG.xml"), "utf8");
  const entries = new Map<string, StrongsEntry>();
  const parser = sax.parser(true, { trim: false });
  let current: StrongsEntry | undefined;
  let definition: string | undefined;
  parser.onopentag = (node) => {
    const attrs = node.attributes as Record<string, string>;
    if (node.name === "div" && attrs.type === "entry") current = {};
    else if (current && node.name === "w" && attrs.ID && !current.lemma) {
      current.lemma = attrs.lemma?.normalize("NFC");
      current.pronunciation = respellPronunciation(attrs.POS);
      entries.set(attrs.ID.replace(/^H0*/, "H"), current);
    } else if (current && node.name === "note" && attrs.type === "explanation") definition = "";
  };
  parser.onclosetag = (name) => {
    if (name === "note" && current && definition !== undefined) {
      current.definition = definition.replace(/\s+/g, " ").trim().normalize("NFC") || undefined;
      definition = undefined;
    } else if (name === "div") current = undefined;
  };
  parser.ontext = (text) => {
    if (definition !== undefined) definition += text;
  };
  parser.write(xml).close();
  return entries;
}

// Paragraph markers (petucha, setumah) stand as their own tokens in the WLC text.
const PARAGRAPH_MARKERS = new Set(["פ", "ס"]);

async function tagHebrew() {
  const translationPath = join(PARSED_DIR, "wlc.json");
  const translation = JSON.parse(await readFile(translationPath, "utf8")) as ParsedTranslation;
  const [tahot, tbesh, strongs] = await Promise.all([readTahot(), readTbesh(), readStrongsHebrew()]);
  // Strong's has no letter splits (H1254 covers H1254A and H1254B).
  const strongsFor = (id: string) => strongs.get(id.replace(/[A-F]$/, ""));

  const byChapter = new Map<string, number[]>();
  translation.verses.forEach((verse, index) => push(byChapter, chapterKey(verse.book, verse.chapter), index));

  const counts = { tagged: 0, untagged: 0, markers: 0, ketiv: 0, partsFromText: 0, partsFromTahot: 0 };
  const report: string[] = [];
  const occurrences = new Map<string, number>();

  const toPart = (part: TahotPart, surface: string): WordPart => {
    if (part.strong) occurrences.set(part.strong, (occurrences.get(part.strong) ?? 0) + 1);
    return compact({
      surface,
      lemma: part.strong ? tbesh.get(part.strong)?.lemma ?? strongsFor(part.strong)?.lemma : undefined,
      strong: part.strong,
      morph: part.morph,
      gloss: part.gloss,
    });
  };

  for (const [key, verseIndexes] of byChapter) {
    const units: Unit[] = [];
    const verseTokens = new Map<number, string[]>();
    for (const verseIndex of verseIndexes) {
      const tokens = tokenizeVerse(translation.verses[verseIndex]!.text);
      verseTokens.set(verseIndex, tokens);
      tokens.forEach((token, tokenIndex) => {
        if (PARAGRAPH_MARKERS.has(token)) return;
        for (const surface of splitTokenWords(token)) {
          units.push({ verseIndex, tokenIndex, surface, norm: normalizeWord(surface) });
        }
      });
    }

    const tahotWords = tahot.get(key) ?? [];
    const alignment = alignSequences(units.map((u) => u.norm), tahotWords.map((w) => w.norm));
    const used = new Set(alignment.map((pair) => pair.index));

    // Per unit: its word parts and the TAHOT row they came from.
    const unitWords = units.map((unit, i) => {
      const pair = alignment[i]!;
      let row = pair.index >= 0 ? tahotWords[pair.index] : undefined;
      if (!row) {
        // WLC prints the Ketiv where TAHOT's row is the Qere: match the written form in the same verse.
        const verseNumber = translation.verses[unit.verseIndex]!.verse;
        const index = tahotWords.findIndex(
          (word, j) => !used.has(j) && word.verse === verseNumber && word.ketiv && wordMatchScore(word.ketiv.norm, unit.norm) >= MATCH_FUZZY
        );
        if (index >= 0) {
          used.add(index);
          row = tahotWords[index]!.ketiv;
          counts.ketiv++;
        }
      }
      if (!row) {
        counts.untagged++;
        return { row, parts: [{ surface: unit.surface } as WordPart] };
      }
      counts.tagged++;
      // Cut prefixes/suffixes out of the WLC word itself so part surfaces match the text.
      const letterCounts = row.parts.map((part) => normalizeWord(part.text).length);
      const pieces = unit.norm === row.norm ? splitByLetterCounts(unit.surface, letterCounts) : undefined;
      if (pieces) counts.partsFromText++;
      else counts.partsFromTahot++;
      const parts = row.parts.map((part, j) => toPart(part, pieces?.[j] ?? part.text));
      return { row, parts };
    });

    for (const verseIndex of verseIndexes) {
      const verse = translation.verses[verseIndex]!;
      const tokens = verseTokens.get(verseIndex)!;
      const untagged: string[] = [];
      verse.words = tokens.map((surface, tokenIndex) => {
        if (PARAGRAPH_MARKERS.has(surface)) {
          counts.markers++;
          return { surface };
        }
        const inToken = unitWords.filter((_, i) => units[i]!.verseIndex === verseIndex && units[i]!.tokenIndex === tokenIndex);
        for (const word of inToken) if (!word.row) untagged.push(word.parts[0]!.surface);
        const parts = inToken.flatMap((word) => word.parts);
        const mainWord = inToken.find((word) => word.row);
        if (!mainWord?.row) return { surface };
        const main = mainWord.parts[mainWord.row.main]!;
        if (parts.length === 1) return { ...main, surface };
        return compact({
          surface,
          lemma: main.lemma,
          strong: main.strong,
          morph: mainWord.row.morph,
          gloss: inToken.length === 1 ? mainWord.row.gloss : main.gloss,
          parts,
        });
      });
      if (untagged.length) report.push(`${verse.book} ${verse.chapter}:${verse.verse}\t${untagged.join(" ")}`);
    }
  }

  await writeFile(translationPath, JSON.stringify(translation, null, 2));

  const ids = new Set<string>([...tbesh.keys()].filter((id) => lexiconNumber(id) <= 8674));
  const lexicon = await writeLexicon("he", ids, occurrences, (id) => {
    const step = tbesh.get(id);
    const strong = strongsFor(id);
    return { ...step, lemma: step?.lemma ?? strong?.lemma, pronunciation: strong?.pronunciation, definition: strong?.definition };
  });

  const summary = [
    `wlc words: ${counts.tagged + counts.untagged} (+ ${counts.markers} paragraph markers)`,
    `  tagged from aligned TAHOT: ${counts.tagged} (${counts.ketiv} from a Ketiv reading)`,
    `  untagged:                  ${counts.untagged}`,
    `  part surfaces cut from WLC text: ${counts.partsFromText}, taken from TAHOT: ${counts.partsFromTahot}`,
    `verses with untagged words: ${report.length}`,
    `lexicon entries: ${lexicon.length}`,
  ];
  await writeFile(
    join(PARSED_DIR, "wlc-tagging-report.txt"),
    [...summary, "", "Verse\tWords with no aligned TAHOT word", ...report].join("\n") + "\n"
  );
  console.log(summary.join("\n"));
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== "")) as T;
}

async function main() {
  console.log("Word tagger");
  console.log("===========\n");
  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
  if (!only || only === "tcgnt") await tagGreek();
  if (!only || only === "wlc") {
    console.log("");
    await tagHebrew();
  }
  console.log("\nDone! Run 'npm run db:seed' (fresh DB) or 'npm run db:backfill:words' (existing DB).");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
