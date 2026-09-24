/**
 * @vitest-environment node
 *
 * Property and acceptance tests over the real tagged data in the local seeded D1
 * (npm run data:download && data:parse && data:tag && db:seed). Skipped when absent.
 *
 * The web client pairs `words` with its own whitespace tokens in order, ignoring accents
 * and case, and drops a verse's tags if anything is left unpaired. So every verse must
 * have exactly one entry per non-punctuation token, each matching its token.
 */

import { describe, expect, it } from "vitest";
import { fetchLexiconEntry, fetchTaggedVerses, hasLocalWords } from "./helpers/local-d1.js";

interface Word {
  surface: string;
  strong?: string;
  morph?: string;
  parts?: Array<{ surface: string; strong?: string }>;
}

// Independent of the importer's own helpers on purpose: this mirrors the web client.
const fold = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
const tokensOf = (text: string) => text.split(/\s+/).filter((token) => /\p{L}/u.test(token));

function mismatches(translationId: string): string[] {
  const failures: string[] = [];
  for (const row of fetchTaggedVerses(translationId)) {
    const ref = `${row.book_id} ${row.chapter}:${row.verse}`;
    if (!row.words) {
      failures.push(`${ref}: no words`);
      continue;
    }
    const words = JSON.parse(row.words) as Word[];
    const tokens = tokensOf(row.text);
    if (words.length !== tokens.length) {
      failures.push(`${ref}: ${words.length} words for ${tokens.length} tokens`);
      continue;
    }
    words.forEach((word, i) => {
      if (fold(word.surface) !== fold(tokens[i]!)) failures.push(`${ref}: "${word.surface}" ≠ "${tokens[i]}"`);
    });
  }
  return failures;
}

function verseWords(translationId: string, book: string, chapter: number, verse: number): Word[] {
  const row = fetchTaggedVerses(translationId).find((v) => v.book_id === book && v.chapter === chapter && v.verse === verse);
  return row?.words ? (JSON.parse(row.words) as Word[]) : [];
}

const tag = (words: Word[], surface: string) => words.filter((w) => w.surface === surface).map((w) => `${w.strong} ${w.morph}`);

describe.skipIf(!hasLocalWords("tcgnt"))("tcgnt word tags (local D1)", () => {
  it("has one matching entry per token in every NT verse", () => {
    expect(mismatches("tcgnt")).toEqual([]);
  });

  it("tags Luke 9:31", () => {
    const words = verseWords("tcgnt", "LUK", 9, 31);
    expect(words).toHaveLength(13);
    expect(tag(words, "ἔξοδον")).toEqual(["G1841 N-ASF"]);
    expect(tag(words, "ὀφθέντες")).toEqual(["G3708 V-APP-NPM"]);
    expect(tag(words, "ἔμελλε")).toEqual(["G3195 V-IAI-3S"]);
    expect(tag(words, "πληροῦν")).toEqual(["G4137 V-PAN"]);
    expect(tag(words, "Ἱερουσαλήμ")).toEqual(["G2419 N-PRI"]);
  });

  it("tags Hebrews 11:22", () => {
    const words = verseWords("tcgnt", "HEB", 11, 22);
    expect(words).toHaveLength(16);
    expect(tag(words, "ἐξόδου")).toEqual(["G1841 N-GSF"]);
    expect(tag(words, "ἐνετείλατο")).toEqual(["G1781 V-ADI-3S"]);
    expect(tag(words, "ὀστέων")).toEqual(["G3747 N-GPN"]);
  });

  it("tags 2 Peter 1:15 without the leaked heading", () => {
    const words = verseWords("tcgnt", "2PE", 1, 15);
    expect(words).toHaveLength(14);
    expect(tag(words, "ἔξοδον")).toEqual(["G1841 N-ASF"]);
    expect(tag(words, "ἐμὴν")).toEqual(["G1699 S-1SASF"]);
    expect(tag(words, "ὑμᾶς")).toEqual(["G4771 P-2AP"]);
    expect(tag(words, "ποιεῖσθαι")).toEqual(["G4160 V-PMN"]);
  });

  it("tags John 1:1 and 3:16", () => {
    const john11 = verseWords("tcgnt", "JHN", 1, 1);
    expect(john11).toHaveLength(17);
    // Robinson's own parsing: imperfect active indicative (both sources; no "X" voice code).
    expect(tag(john11, "ἦν")).toEqual(["G1510 V-IAI-3S", "G1510 V-IAI-3S", "G1510 V-IAI-3S"]);
    expect(tag(john11, "λόγος")).toEqual(["G3056 N-NSM", "G3056 N-NSM", "G3056 N-NSM"]);
    expect(tag(john11, "Θεόν")).toEqual(["G2316 N-ASM"]);

    const john316 = verseWords("tcgnt", "JHN", 3, 16);
    expect(john316).toHaveLength(26);
    expect(tag(john316, "ἠγάπησεν")).toEqual(["G25 V-AAI-3S"]);
    expect(tag(john316, "ἀπόληται")).toEqual(["G622 V-2AMS-3S"]);
    expect(tag(john316, "ἀλλ᾽")).toEqual(["G235 CONJ"]);
    expect(tag(john316, "μονογενῆ")).toEqual(["G3439 A-ASM"]);
  });

  it("counts G1841 three times in the NT", () => {
    expect(fetchLexiconEntry("G1841")).toMatchObject({ strong: "G1841", occurrences: 3, pronunciation: "EX-od-os" });
  });
});

describe.skipIf(!hasLocalWords("wlc"))("wlc word tags (local D1)", () => {
  it("has one matching entry per token in every OT verse", () => {
    expect(mismatches("wlc")).toEqual([]);
  });

  it("splits prefixes into parts", () => {
    const [first] = verseWords("wlc", "GEN", 1, 1);
    expect(first).toMatchObject({ strong: "H7225", morph: "HR/Ncfsa" });
    expect(first!.parts!.map((part) => part.strong)).toEqual(["H9003", "H7225"]);
  });
});
