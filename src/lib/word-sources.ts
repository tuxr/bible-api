/**
 * Attribution for word tags and lexicon entries. CC BY sources require visible
 * credit, so every response that carries their data also carries this list.
 */

import type { Attribution } from "./word-tagging.js";

const STEPBIBLE_URL = "https://github.com/STEPBible/STEPBible-Data";
const STRONGS_URL = "https://github.com/openscriptures/strongs";

const SOURCES = {
  byztxt: {
    id: "byztxt-rp2018",
    name: "Robinson–Pierpont Byzantine Textform 2018 with Strong's numbers and parsing (Maurice A. Robinson)",
    license: "Public Domain",
    url: "https://github.com/byztxt/byzantine-majority-text",
  },
  tagnt: {
    id: "stepbible-tagnt",
    name: "STEPBible TAGNT (Tyndale House, Cambridge)",
    license: "CC BY 4.0",
    url: STEPBIBLE_URL,
  },
  tbesg: {
    id: "stepbible-tbesg",
    name: "STEPBible TBESG lexicon, based on Abbott-Smith (Tyndale House, Cambridge)",
    license: "CC BY 4.0",
    url: STEPBIBLE_URL,
  },
  strongsGreek: {
    id: "strongs-greek",
    name: "Strong's Greek Dictionary (XML by Ulrik Petersen)",
    license: "Public Domain",
    url: STRONGS_URL,
  },
  oshb: {
    id: "oshb-morphhb",
    name: "Open Scriptures Hebrew Bible lemmas and morphology",
    license: "CC BY 4.0",
    url: "https://github.com/openscriptures/morphhb",
  },
  tahot: {
    id: "stepbible-tahot",
    name: "STEPBible TAHOT (Tyndale House, Cambridge)",
    license: "CC BY 4.0",
    url: STEPBIBLE_URL,
  },
  tbesh: {
    id: "stepbible-tbesh",
    name: "STEPBible TBESH lexicon, based on BDB (Tyndale House, Cambridge)",
    license: "CC BY 4.0",
    url: STEPBIBLE_URL,
  },
  strongsHebrew: {
    id: "strongs-hebrew",
    name: "Strong's Hebrew Dictionary",
    license: "Public Domain",
    url: STRONGS_URL,
  },
} satisfies Record<string, Attribution>;

const LEXICON_ATTRIBUTION: Record<string, Attribution[]> = {
  G: [SOURCES.tbesg, SOURCES.strongsGreek],
  H: [SOURCES.tbesh, SOURCES.strongsHebrew],
};

/** Sources behind the `words` tags of each tagged translation (lexicon sources included). */
const WORD_ATTRIBUTION: Record<string, Attribution[]> = {
  tcgnt: [SOURCES.byztxt, SOURCES.tagnt, ...LEXICON_ATTRIBUTION.G!],
  wlc: [SOURCES.oshb, SOURCES.tahot, ...LEXICON_ATTRIBUTION.H!],
};

export function wordAttribution(translationId: string): Attribution[] {
  return WORD_ATTRIBUTION[translationId] ?? [];
}

/** Sources for a set of lexicon ids ("G1841", "H7225"), in first-seen language order. */
export function lexiconAttribution(ids: Iterable<string>): Attribution[] {
  const prefixes = new Set<string>();
  for (const id of ids) prefixes.add(id[0]!);
  return [...prefixes].flatMap((prefix) => LEXICON_ATTRIBUTION[prefix] ?? []);
}
