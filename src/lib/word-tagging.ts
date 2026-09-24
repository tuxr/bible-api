/**
 * Pure helpers for the word-tagging import (data/scripts/tag-words.ts).
 *
 * Kept free of Node APIs so the alignment and formatting rules can be unit tested
 * in the Workers test pool alongside the rest of src/lib.
 */

export interface WordPart {
  surface: string;
  lemma?: string;
  strong?: string;
  morph?: string;
  gloss?: string;
}

/** One entry per whitespace token of the verse text, in reading order. */
export interface VerseWord extends WordPart {
  /** Present when one whitespace token holds several tagged words (Hebrew prefixes, "λόγος—καὶ"). */
  parts?: WordPart[];
}

export interface LexiconEntry {
  strong: string;
  lemma: string;
  language: string;
  transliteration?: string;
  pronunciation?: string;
  partOfSpeech?: string;
  gloss?: string;
  definition?: string;
  occurrences?: number;
}

export interface Attribution {
  id: string;
  name: string;
  license: string;
  url: string;
}

// Elision marks stay on the surface (ἀλλ᾽, κατ᾽); everything else at the edges is punctuation.
const ELISION = "᾽’ʼ'";
const LEADING_PUNCT = /^[^\p{L}\p{M}]+/u;
const TRAILING_PUNCT = new RegExp(`[^\\p{L}\\p{M}${ELISION}]+$`, "u");

/** Strip surrounding punctuation from a whitespace token. */
export function tokenSurface(token: string): string {
  return token.replace(LEADING_PUNCT, "").replace(TRAILING_PUNCT, "");
}

/**
 * Split verse text into word tokens the way the web client does: on whitespace,
 * dropping punctuation-only tokens.
 */
export function tokenizeVerse(text: string): string[] {
  return text.split(/\s+/).filter((token) => /\p{L}/u.test(token)).map(tokenSurface);
}

/** Split a token into the words it contains ("ἁμαρτίας—τότε", Hebrew maqaf "עַל־פְּנֵי" → two words). */
export function splitTokenWords(surface: string): string[] {
  return surface.split(/[—–\u05BE]+/).map(tokenSurface).filter((part) => /\p{L}/u.test(part));
}

/**
 * Split a word into pieces with the given letter counts, keeping each letter's points and
 * accents with it ("וְהָאָ֗רֶץ", [1, 1, 3] → "וְ", "הָ", "אָ֗רֶץ"). Undefined if the counts do not add up.
 */
export function splitByLetterCounts(word: string, counts: number[]): string[] | undefined {
  const clusters = word.match(/\p{L}\p{M}*/gu) ?? [];
  if (clusters.join("") !== word || counts.reduce((a, b) => a + b, 0) !== clusters.length) return undefined;
  const pieces: string[] = [];
  let start = 0;
  for (const count of counts) {
    pieces.push(clusters.slice(start, start + count).join(""));
    start += count;
  }
  return pieces;
}

/** Comparison key: no accents or breathings, lowercase, final sigma folded, letters only. */
export function normalizeWord(word: string): string {
  return word
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    .replace(/[^\p{L}]/gu, "");
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length]!;
}

export const MATCH_EXACT = 4;
export const MATCH_MOVABLE = 3;
export const MATCH_FUZZY = 2;

/**
 * Score how likely two normalized forms are the same word in two editions.
 * 0 means "not the same word": the aligner will never pair them.
 */
export function wordMatchScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return MATCH_EXACT;
  // Movable ν/ς (ἔμελλε/ἔμελλεν, οὕτω/οὕτως) and elided final vowels (δι᾽/διά).
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (longer.length === shorter.length + 1 && longer.startsWith(shorter) && /[νσαεοι]$/.test(longer)) {
    return MATCH_MOVABLE;
  }
  // Spelling variants of the same word (Δαυίδ/Δαβίδ, Νεφθαλείμ/Νεφθαλίμ, ἠδύνασθε/ἐδύνασθε).
  if (shorter.length >= 4) {
    const allowed = a[0] !== b[0] ? (shorter.length >= 5 ? 1 : 0) : shorter.length >= 7 ? 2 : 1;
    // Ignore a final movable ν/ς so ἔμελλε ~ ἤμελλεν counts as one edit.
    const [x, y] = [a, b].map((word) => word.replace(/[νσ]$/, "")) as [string, string];
    if (allowed > 0 && levenshtein(x, y, allowed) <= allowed) return MATCH_FUZZY;
  }
  return 0;
}

/** The form itself plus its movable-ν/ς partners (ἤκουε ↔ ἤκουεν, οὕτω ↔ οὕτως). */
export function movableVariants(norm: string): string[] {
  const variants = [norm, `${norm}ν`, `${norm}σ`];
  if (/[νσ]$/.test(norm) && norm.length > 2) variants.push(norm.slice(0, -1));
  return variants;
}

/**
 * Global alignment of two word sequences that maximizes total match score.
 * Returns, for each index of `a`, the paired index of `b` (or -1) and the pair's score.
 */
export function alignSequences(
  a: readonly string[],
  b: readonly string[],
  score: (x: string, y: string) => number = wordMatchScore
): Array<{ index: number; score: number }> {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Int32Array((n + 1) * width);
  // 0 = diagonal, 1 = skip a, 2 = skip b
  const moves = new Uint8Array((n + 1) * width);
  for (let i = 1; i <= n; i++) moves[i * width] = 1;
  for (let j = 1; j <= m; j++) moves[j] = 2;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const pair = score(a[i - 1]!, b[j - 1]!);
      const diagonal = pair > 0 ? table[(i - 1) * width + j - 1]! + pair : -1;
      const up = table[(i - 1) * width + j]!;
      const left = table[i * width + j - 1]!;
      let best = diagonal;
      let move = 0;
      if (up > best) { best = up; move = 1; }
      if (left > best) { best = left; move = 2; }
      table[i * width + j] = best;
      moves[i * width + j] = move;
    }
  }

  const result = Array.from({ length: n }, () => ({ index: -1, score: 0 }));
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const move = moves[i * width + j];
    if (move === 0) {
      result[i - 1] = { index: j - 1, score: score(a[i - 1]!, b[j - 1]!) };
      i--;
      j--;
    } else if (move === 1) i--;
    else j--;
  }
  return result;
}

/**
 * Lemma-level ids: "1841" / "G01841" / "G3708H" → "G1841".
 *
 * Hebrew extended Strong's split some numbers into separate dictionary entries with
 * letters a–f (H1254a "to create", H1254b "to fatten"); those letters are kept, upper-cased.
 * Letters from G on are STEPBible disambiguation of one entry (H0430G) and are dropped.
 */
export function strongId(prefix: "G" | "H", raw: string): string | undefined {
  const match = raw.match(/(\d+)([A-Za-z])?/);
  if (!match) return undefined;
  const number = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  const letter = prefix === "H" && match[2] && /[a-f]/i.test(match[2]) ? match[2].toUpperCase() : "";
  return `${prefix}${number}${letter}`;
}

/**
 * Tidy a STEPBible contextual gloss for display: drop punctuation copied from the
 * Greek ("to make." → "to make") and the <> marking untranslated words.
 */
export function cleanGloss(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/[<>]/g, "")
    .replace(/^[\s"'“”‘’.,;:!?·]+/u, "")
    .replace(/[\s"'“”‘’.,;:!?·]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

/**
 * STEPBible tags names and titles with extra suffixes (N-GSM-P, N-ASM-T, N-DSF-L).
 * Robinson codes never end that way, so strip them when TAGNT is the fallback.
 */
export function normalizeTagntMorph(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.trim().replace(/^([NA]-[NGDAV][SP][MFN])-(?:P|T|L|LG|PG|G)$/, "$1") || undefined;
}

/**
 * Convert a Strong's dictionary respelling ("ex'-od-os") into the capitalised
 * stressed-syllable style the web card shows ("EX-od-os").
 */
export function respellPronunciation(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  return value
    .split(/([\s-]+)/)
    .map((syllable) => (/['ʹ′]/.test(syllable) ? syllable.replace(/['ʹ′]/g, "").toUpperCase() : syllable))
    .join("");
}

const TYPE_NAMES: Record<string, string> = {
  N: "noun",
  V: "verb",
  A: "adjective",
  ADV: "adverb",
  PREP: "preposition",
  CONJ: "conjunction",
  COND: "conditional",
  PRT: "particle",
  INJ: "interjection",
  T: "article",
  P: "personal pronoun",
  R: "relative pronoun",
  C: "reciprocal pronoun",
  D: "demonstrative pronoun",
  K: "correlative pronoun",
  I: "interrogative pronoun",
  X: "indefinite pronoun",
  Q: "correlative pronoun",
  F: "reflexive pronoun",
  S: "possessive pronoun",
  // TBESH (Hebrew) spells types out
  INTJ: "interjection",
  INTG: "interrogative",
  NEG: "negative particle",
  PART: "particle",
  ART: "article",
  COR: "correlative",
  DEMP: "demonstrative pronoun",
  IMPP: "impersonal pronoun",
  PERP: "personal pronoun",
  POSP: "possessive pronoun",
  REFP: "reflexive pronoun",
  RELP: "relative pronoun",
  PREFIX: "prefix",
  SUFFIX: "pronominal suffix",
};

const UNINFLECTED_TYPES = new Set(["V", "ADV", "PREP", "CONJ", "COND", "PRT", "INJ", "INTJ", "NEG", "PART", "INTG"]);
const NUMBER_NAMES: Record<string, string> = { S: "singular", P: "plural" };

const GENDER_NAMES: Record<string, string> = { M: "masculine", F: "feminine", N: "neuter", C: "common" };

const EXTRA_NAMES: Record<string, string> = {
  P: "person",
  L: "place",
  T: "title",
  LG: "gentilic",
  PG: "gentilic",
  PRI: "indeclinable",
  LI: "letter",
  NUI: "numeral",
  OI: "indeclinable",
  C: "comparative",
  S: "superlative",
  N: "negative",
  I: "interrogative",
};

function describeCode(code: string): string | undefined {
  const [language, body] = code.includes(":") ? code.split(":", 2) as [string, string] : ["", code];
  const [rawType = "", ...segments] = body.trim().replace(/\.$/, "").split("-");
  const type = rawType.toUpperCase();
  const typeName = TYPE_NAMES[type];
  if (!typeName) return undefined;
  const words = [language === "N" && type === "N" ? "proper noun" : typeName];
  for (const segment of segments) {
    if (!segment) continue;
    const genders = segment.split("/").map((g) => GENDER_NAMES[g]);
    const genderNumber = segment.match(/^([MFNC])([SP])$/);
    // Uninflected types reuse N for "negative" (PRT-N, ADV-N), never neuter.
    if (!UNINFLECTED_TYPES.has(type) && genders.every(Boolean)) words.push(genders.join("/"));
    else if (genderNumber) words.push(GENDER_NAMES[genderNumber[1]!]!, NUMBER_NAMES[genderNumber[2]!]!);
    else if (/^[123]$/.test(segment)) words.push(["first", "second", "third"][Number(segment) - 1] + " person");
    // "P" on a name only repeats that it is a person.
    else if (EXTRA_NAMES[segment] && !(language === "N" && segment === "P")) words.push(EXTRA_NAMES[segment]!);
  }
  if (language === "A") words.push("Aramaic");
  return words.join(", ");
}

/**
 * Turn a STEPBible lexicon morph summary (TBESG "G:N-F", "N:N-M-P", "G:A / G:ADV";
 * TBESH "H:N-M", "H:Prep+H:RelP", "A:V") into readable text
 * ("noun, feminine", "proper noun, masculine", "adjective / adverb").
 */
export function describePartOfSpeech(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const alternatives = raw
    .split(/\s*\/\s*(?=[A-Z]:)/)
    .map((alternative) => {
      // "+" joins the pieces of a compound word ("H:Prep+H:RelP").
      const pieces = alternative.split("+").map((code) => describeCode(code.trim()));
      return pieces.every(Boolean) ? pieces.join(" + ") : undefined;
    })
    .filter((value): value is string => Boolean(value));
  return alternatives.length ? [...new Set(alternatives)].join(" / ") : undefined;
}
