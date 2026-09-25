/**
 * The `translations` row fields that the parsed JSON doesn't carry. Shared by db:seed and
 * data:export-sqlite so D1 and the app's bundled database describe translations identically.
 */
export const TRANSLATION_META: Record<string, { name: string; language: string; license: string; description: string }> = {
  web: {
    name: "World English Bible",
    language: "en",
    license: "Public Domain",
    description: "A modern English translation in the public domain. Includes Apocrypha/Deuterocanonical books.",
  },
  kjv: {
    name: "King James Version",
    language: "en",
    license: "Public Domain",
    description: "The 1769 edition of the King James Bible",
  },
  wlc: {
    name: "Westminster Leningrad Codex",
    language: "he",
    license: "Public Domain (text); CC BY 4.0 (OSHB lemma/morphology)",
    description: "Hebrew Old Testament text based on the Westminster Leningrad Codex (Masoretic Text)",
  },
  tcgnt: {
    name: "Text-Critical Greek New Testament",
    language: "grc",
    license: "Public Domain",
    description:
      "Robinson–Pierpont Byzantine Textform 2018 (eBible TCGNT). Public domain. New Testament only. Names of the present editors and this title retained for responsibility.",
  },
};
