import { describe, expect, it } from "vitest";
import { containsGreek, stripGreekDiacritics } from "../lib/greek.js";
import { normalizeSearchQuery, toSearchPlainText } from "../lib/hebrew.js";

const JHN_3_16 =
  "Οὕτω γὰρ ἠγάπησεν ὁ Θεὸς τὸν κόσμον, ὥστε τὸν υἱὸν αὐτοῦ τὸν μονογενῆ ἔδωκεν";

describe("stripGreekDiacritics", () => {
  it("strips polytonic marks, lowercases, and folds final sigma", () => {
    expect(stripGreekDiacritics("Ἰησοῦς")).toBe("ιησουσ");
    expect(stripGreekDiacritics("ιησους")).toBe("ιησουσ");
    expect(stripGreekDiacritics("κόσμος")).toBe("κοσμοσ");
    expect(stripGreekDiacritics("κόσμον")).toBe("κοσμον");
    expect(stripGreekDiacritics(JHN_3_16)).not.toMatch(/[ἀ-ὧ]/);
  });
});

describe("containsGreek", () => {
  it("detects Greek letters only", () => {
    expect(containsGreek(JHN_3_16)).toBe(true);
    expect(containsGreek("God so loved")).toBe(false);
    expect(containsGreek("בראשית")).toBe(false);
  });
});

describe("toSearchPlainText", () => {
  it("normalizes tcgnt and leaves web/kjv paths alone", () => {
    expect(toSearchPlainText("tcgnt", JHN_3_16)).toBe(stripGreekDiacritics(JHN_3_16));
    expect(toSearchPlainText("web", JHN_3_16)).toBe(JHN_3_16);
    expect(toSearchPlainText("kjv", JHN_3_16)).toBe(JHN_3_16);
  });
});

describe("normalizeSearchQuery", () => {
  it("strips Greek diacritics in queries", () => {
    expect(normalizeSearchQuery("  ἠγάπησεν  ")).toBe(stripGreekDiacritics("ἠγάπησεν"));
  });

  it("still strips Hebrew and leaves English", () => {
    expect(normalizeSearchQuery("בְּרֵאשִׁ֖ית")).toBe("בראשית");
    expect(normalizeSearchQuery("  God so loved  ")).toBe("God so loved");
  });
});
