import { describe, expect, it } from "vitest";
import {
  alignSequences,
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
} from "../lib/word-tagging.js";
import { collectLexiconIds, normalizeLexiconId, parseStoredWords } from "../lib/words.js";

describe("tokenizeVerse", () => {
  it("splits on whitespace, drops punctuation-only tokens and strips edge punctuation", () => {
    expect(tokenizeVerse("καὶ Θεὸς ἦν ὁ λόγος. — (τοῦ Θεοῦ,)")).toEqual(["καὶ", "Θεὸς", "ἦν", "ὁ", "λόγος", "τοῦ", "Θεοῦ"]);
  });

  it("keeps elision marks on the word", () => {
    expect(tokenizeVerse("ἀλλ᾽ ἔχῃ ζωὴν αἰώνιον.")).toEqual(["ἀλλ᾽", "ἔχῃ", "ζωὴν", "αἰώνιον"]);
  });

  it("keeps Hebrew maqaf-joined words as one token and drops sof pasuq and paseq", () => {
    expect(tokenizeVerse("עַל־פְּנֵ֣י תְה֑וֹם ׀ הַמָּֽיִם׃")).toEqual(["עַל־פְּנֵ֣י", "תְה֑וֹם", "הַמָּֽיִם"]);
  });
});

describe("splitTokenWords", () => {
  it("splits em-dash and maqaf joins", () => {
    expect(splitTokenWords("ἀνθρώπων;—ἐφοβοῦντο")).toEqual(["ἀνθρώπων", "ἐφοβοῦντο"]);
    expect(splitTokenWords("עַל־פְּנֵ֣י")).toEqual(["עַל", "פְּנֵ֣י"]);
    expect(splitTokenWords("λόγος")).toEqual(["λόγος"]);
  });
});

describe("normalizeWord / wordMatchScore", () => {
  it("ignores accents, breathings, case and final sigma", () => {
    expect(normalizeWord("Θεόν,")).toBe(normalizeWord("θεον"));
    expect(normalizeWord("λόγος")).toBe("λογοσ");
    expect(normalizeWord("בְּרֵאשִׁ֖ית")).toBe("בראשית");
  });

  it("scores exact, movable ν/ς, spelling variants and non-matches", () => {
    expect(wordMatchScore("λογοσ", "λογοσ")).toBe(4);
    expect(wordMatchScore(normalizeWord("ἔμελλε"), normalizeWord("ἔμελλεν"))).toBe(3);
    expect(wordMatchScore(normalizeWord("Οὕτω"), normalizeWord("οὕτως"))).toBe(3);
    expect(wordMatchScore(normalizeWord("ἠδύνασθε"), normalizeWord("ἐδύνασθε"))).toBe(2);
    expect(wordMatchScore(normalizeWord("ἔμελλε"), normalizeWord("ἤμελλεν"))).toBe(2);
    expect(wordMatchScore("και", "δε")).toBe(0);
    expect(wordMatchScore("ο", "η")).toBe(0);
  });
});

describe("alignSequences", () => {
  it("pairs matching words and leaves insertions unpaired", () => {
    const text = ["εν", "ταισ", "ημεραισ"];
    const source = ["εν", "δε", "ταισ", "ημεραισ"];
    expect(alignSequences(text, source).map((pair) => pair.index)).toEqual([0, 2, 3]);
  });

  it("survives word-order differences by leaving the moved word unpaired", () => {
    const text = ["υμων", "η", "δικαιοσυνη", "πλειον"];
    const source = ["η", "δικαιοσυνη", "υμων", "πλειον"];
    const pairs = alignSequences(text, source).map((pair) => pair.index);
    expect(pairs.filter((index) => index >= 0)).toHaveLength(3);
    expect(pairs[3]).toBe(3);
  });
});

describe("strongId", () => {
  it("produces lemma-level ids", () => {
    expect(strongId("G", "1841")).toBe("G1841");
    expect(strongId("G", "G0025")).toBe("G25");
    expect(strongId("G", "G3708H")).toBe("G3708");
    expect(strongId("H", "{H0430G}")).toBe("H430");
    expect(strongId("H", "H1254a")).toBe("H1254A");
    expect(strongId("H", "{H1254A}")).toBe("H1254A");
    expect(strongId("H", "H9002")).toBe("H9002");
    expect(strongId("G", "none")).toBeUndefined();
  });
});

describe("formatting helpers", () => {
  it("cleans STEPBible glosses", () => {
    expect(cleanGloss("to make.")).toBe("to make");
    expect(cleanGloss("<the>")).toBe("the");
    expect(cleanGloss("He gave,")).toBe("He gave");
    expect(cleanGloss("In [the]")).toBe("In [the]");
    expect(cleanGloss(" ")).toBeUndefined();
  });

  it("strips STEPBible name suffixes from morphology only", () => {
    expect(normalizeTagntMorph("N-ASM-T")).toBe("N-ASM");
    expect(normalizeTagntMorph("N-DSF-L")).toBe("N-DSF");
    expect(normalizeTagntMorph("A-VSM-S")).toBe("A-VSM-S");
    expect(normalizeTagntMorph("PRT-N")).toBe("PRT-N");
  });

  it("capitalises the stressed syllable of a Strong's respelling", () => {
    expect(respellPronunciation("ex'-od-os")).toBe("EX-od-os");
    expect(respellPronunciation("ag-ap-ah'-o")).toBe("ag-ap-AH-o");
    expect(respellPronunciation("el-o-heem'")).toBe("el-o-HEEM");
    expect(respellPronunciation("")).toBeUndefined();
  });

  it("describes lexicon parts of speech", () => {
    expect(describePartOfSpeech("G:N-F")).toBe("noun, feminine");
    expect(describePartOfSpeech("N:N-M-P")).toBe("proper noun, masculine");
    expect(describePartOfSpeech("G:PRT-N")).toBe("particle, negative");
    expect(describePartOfSpeech("G:S-1")).toBe("possessive pronoun, first person");
    expect(describePartOfSpeech("H:Prep+H:RelP")).toBe("preposition + relative pronoun");
    expect(describePartOfSpeech("G:A / G:ADV")).toBe("adjective / adverb");
    expect(describePartOfSpeech("A:N-M")).toBe("noun, masculine, Aramaic");
    expect(describePartOfSpeech("Punct.")).toBeUndefined();
  });

  it("cuts a pointed Hebrew word into prefix parts by letter count", () => {
    expect(splitByLetterCounts("וְהָאָ֗רֶץ", [1, 1, 3])).toEqual(["וְ", "הָ", "אָ֗רֶץ"]);
    expect(splitByLetterCounts("וְהָאָ֗רֶץ", [1, 1])).toBeUndefined();
  });
});

describe("words helpers", () => {
  it("normalizes lexicon ids", () => {
    expect(normalizeLexiconId("g01841")).toBe("G1841");
    expect(normalizeLexiconId(" G25 ")).toBe("G25");
    expect(normalizeLexiconId("h1254a")).toBe("H1254A");
    expect(normalizeLexiconId("G1841A")).toBeUndefined();
    expect(normalizeLexiconId("H1254G")).toBeUndefined();
    expect(normalizeLexiconId("G0")).toBeUndefined();
    expect(normalizeLexiconId("X1")).toBeUndefined();
  });

  it("collects ids from words and their parts once, in order", () => {
    expect(
      collectLexiconIds([
        [{ surface: "וְהָאָ֗רֶץ", strong: "H776", parts: [{ surface: "וְ", strong: "H9002" }, { surface: "אָ֗רֶץ", strong: "H776" }] }],
        [{ surface: "ἔξοδον", strong: "G1841" }, { surface: "ἥξῃ" }],
      ])
    ).toEqual(["H776", "H9002", "G1841"]);
  });

  it("ignores malformed stored words", () => {
    expect(parseStoredWords(null)).toBeUndefined();
    expect(parseStoredWords("nope")).toBeUndefined();
    expect(parseStoredWords("[]")).toBeUndefined();
    expect(parseStoredWords('[{"strong":"G1"}]')).toBeUndefined();
    expect(parseStoredWords('[{"surface":"λόγος"}]')).toEqual([{ surface: "λόγος" }]);
  });
});
