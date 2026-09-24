/**
 * Real tags for the tcgnt John 3:16 and WLC Genesis 1:1 fixture rows, as written by
 * data/scripts/tag-words.ts, plus a few lexicon entries they point at.
 */

import type { LexiconEntry, VerseWord } from "../../types.js";

/** First 14 words: the fixture verse text is truncated after ἔδωκεν. */
export const tcgntJohn316Words: VerseWord[] = [
  {
    surface: "Οὕτω",
    lemma: "οὕτως",
    strong: "G3779",
    morph: "ADV",
    gloss: "Thus"
  },
  {
    surface: "γὰρ",
    lemma: "γάρ",
    strong: "G1063",
    morph: "CONJ",
    gloss: "for"
  },
  {
    surface: "ἠγάπησεν",
    lemma: "ἀγαπάω",
    strong: "G25",
    morph: "V-AAI-3S",
    gloss: "loved"
  },
  {
    surface: "ὁ",
    lemma: "ὁ",
    strong: "G3588",
    morph: "T-NSM",
    gloss: "the"
  },
  {
    surface: "Θεὸς",
    lemma: "θεός",
    strong: "G2316",
    morph: "N-NSM",
    gloss: "God"
  },
  {
    surface: "τὸν",
    lemma: "ὁ",
    strong: "G3588",
    morph: "T-ASM",
    gloss: "the"
  },
  {
    surface: "κόσμον",
    lemma: "κόσμος",
    strong: "G2889",
    morph: "N-ASM",
    gloss: "world"
  },
  {
    surface: "ὥστε",
    lemma: "ὥστε",
    strong: "G5620",
    morph: "CONJ",
    gloss: "that"
  },
  {
    surface: "τὸν",
    lemma: "ὁ",
    strong: "G3588",
    morph: "T-ASM",
    gloss: "the"
  },
  {
    surface: "υἱὸν",
    lemma: "υἱός",
    strong: "G5207",
    morph: "N-ASM",
    gloss: "Son"
  },
  {
    surface: "αὐτοῦ",
    lemma: "αὐτός",
    strong: "G846",
    morph: "P-GSM",
    gloss: "of him"
  },
  {
    surface: "τὸν",
    lemma: "ὁ",
    strong: "G3588",
    morph: "T-ASM",
    gloss: "the"
  },
  {
    surface: "μονογενῆ",
    lemma: "μονογενής",
    strong: "G3439",
    morph: "A-ASM",
    gloss: "only begotten"
  },
  {
    surface: "ἔδωκεν",
    lemma: "δίδωμι",
    strong: "G1325",
    morph: "V-AAI-3S",
    gloss: "He gave"
  }
];

export const wlcGenesis11Words: VerseWord[] = [
  {
    surface: "בְּרֵאשִׁ֖ית",
    lemma: "רֵאשִׁית",
    strong: "H7225",
    morph: "HR/Ncfsa",
    gloss: "in beginning",
    parts: [
      {
        surface: "בְּ",
        lemma: "ב",
        strong: "H9003",
        morph: "HR",
        gloss: "in"
      },
      {
        surface: "רֵאשִׁ֖ית",
        lemma: "רֵאשִׁית",
        strong: "H7225",
        morph: "HNcfsa",
        gloss: "beginning"
      }
    ]
  },
  {
    surface: "בָּרָ֣א",
    lemma: "בָּרָא",
    strong: "H1254A",
    morph: "HVqp3ms",
    gloss: "he created"
  },
  {
    surface: "אֱלֹהִ֑ים",
    lemma: "אֱלֹהִים",
    strong: "H430",
    morph: "HNcmpa",
    gloss: "God"
  },
  {
    surface: "אֵ֥ת",
    lemma: "אֵת",
    strong: "H853",
    morph: "HTo",
    gloss: "obj"
  },
  {
    surface: "הַשָּׁמַ֖יִם",
    lemma: "שָׁמַיִם",
    strong: "H8064",
    morph: "HTd/Ncmpa",
    gloss: "the heavens",
    parts: [
      {
        surface: "הַ",
        lemma: "ה",
        strong: "H9009",
        morph: "HTd",
        gloss: "the"
      },
      {
        surface: "שָּׁמַ֖יִם",
        lemma: "שָׁמַיִם",
        strong: "H8064",
        morph: "HNcmpa",
        gloss: "heavens"
      }
    ]
  },
  {
    surface: "וְאֵ֥ת",
    lemma: "אֵת",
    strong: "H853",
    morph: "HC/To",
    gloss: "and obj",
    parts: [
      {
        surface: "וְ",
        lemma: "וְ",
        strong: "H9002",
        morph: "HC",
        gloss: "and"
      },
      {
        surface: "אֵ֥ת",
        lemma: "אֵת",
        strong: "H853",
        morph: "HTo",
        gloss: "obj"
      }
    ]
  },
  {
    surface: "הָאָֽרֶץ",
    lemma: "אֶ֫רֶץ",
    strong: "H776",
    morph: "HTd/Ncfsa",
    gloss: "the earth",
    parts: [
      {
        surface: "הָ",
        lemma: "ה",
        strong: "H9009",
        morph: "HTd",
        gloss: "the"
      },
      {
        surface: "אָֽרֶץ",
        lemma: "אֶ֫רֶץ",
        strong: "H776",
        morph: "HNcfsa",
        gloss: "earth"
      }
    ]
  }
];

/**
 * G1841 is used by no fixture verse. Several ids the fixture words point at are left out on
 * purpose, so tests can check that the chapter lexicon holds only entries that exist.
 */
export const lexiconFixtures: LexiconEntry[] = [
  {
    strong: "G25",
    lemma: "ἀγαπάω",
    language: "grc",
    transliteration: "agapaō",
    pronunciation: "ag-ap-AH-o",
    partOfSpeech: "verb",
    gloss: "to love",
    definition: "to love (in a social or moral sense)",
    occurrences: 142
  },
  {
    strong: "G2316",
    lemma: "θεός",
    language: "grc",
    transliteration: "theos",
    pronunciation: "THEH-os",
    partOfSpeech: "noun, masculine/feminine",
    gloss: "God",
    definition: "figuratively, a magistrate; by Hebraism, very",
    occurrences: 1341
  },
  {
    strong: "G2889",
    lemma: "κόσμος",
    language: "grc",
    transliteration: "kosmos",
    pronunciation: "KOS-mos",
    partOfSpeech: "noun, masculine",
    gloss: "world",
    definition: "orderly arrangement, i.e. decoration; by implication, the world (in a wide or narrow sense, including its inhabitants, literally or figuratively (morally))",
    occurrences: 187
  },
  {
    strong: "G1841",
    lemma: "ἔξοδος",
    language: "grc",
    transliteration: "exodos",
    pronunciation: "EX-od-os",
    partOfSpeech: "noun, feminine",
    gloss: "departure",
    definition: "an exit, i.e. (figuratively) death",
    occurrences: 3
  },
  {
    strong: "H7225",
    lemma: "רֵאשִׁית",
    language: "he",
    transliteration: "reshit",
    pronunciation: "ray-SHEETH",
    partOfSpeech: "noun, feminine",
    gloss: "first",
    definition: "the first, in place, time, order or rank (specifically, a firstfruit)",
    occurrences: 51
  },
  {
    strong: "H9003",
    lemma: "ב",
    language: "he",
    transliteration: "b",
    partOfSpeech: "prefix",
    gloss: "in/on/with",
    occurrences: 15766
  }
];
