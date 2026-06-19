/**
 * @vitest-environment node
 *
 * High-signal versification anchor tests.
 *
 * Each anchor asserts WLC↔WEB textual correspondence at a known divergence
 * boundary, using real verse text from the local seeded D1 database.
 */

import { describe, it, expect } from "vitest";
import { stripHebrewDiacritics } from "../lib/hebrew.js";
import { versificationMap } from "../lib/versification-map.js";
import {
  fetchVerse,
  isLocalD1Seeded,
  type VerseRow,
} from "./helpers/local-d1.js";

interface VerseLoc {
  bookId: string;
  chapter: number;
  verse: number;
}

interface CorrespondenceAnchor {
  label: string;
  wlc: VerseLoc;
  web: VerseLoc;
  hebrewMarkers: string[];
  englishMarkers: string[];
}

interface AlignedAnchor {
  label: string;
  bookId: string;
  chapter: number;
  verse: number;
  hebrewMarkers: string[];
  englishMarkers: string[];
}

function plainHebrew(text: string): string {
  return stripHebrewDiacritics(text)
    .replace(/\u05BE/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactHebrew(text: string): string {
  return plainHebrew(text).replace(/\s+/g, "");
}

function normalizeEnglish(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function assertHebrewMarkers(verse: VerseRow, markers: string[]): void {
  const compact = compactHebrew(verse.text);
  for (const marker of markers) {
    expect(compact, `WLC ${verse.book_id} ${verse.chapter}:${verse.verse}`).toContain(
      compactHebrew(marker)
    );
  }
}

function assertEnglishMarkers(verse: VerseRow, markers: string[]): void {
  const normalized = normalizeEnglish(verse.text);
  for (const marker of markers) {
    expect(normalized, `WEB ${verse.book_id} ${verse.chapter}:${verse.verse}`).toContain(
      normalizeEnglish(marker)
    );
  }
}

function assertCorrespondence(anchor: CorrespondenceAnchor): void {
  const wlc = fetchVerse("wlc", anchor.wlc.bookId, anchor.wlc.chapter, anchor.wlc.verse);
  const web = fetchVerse("web", anchor.web.bookId, anchor.web.chapter, anchor.web.verse);

  expect(wlc, `${anchor.label}: missing WLC verse`).toBeDefined();
  expect(web, `${anchor.label}: missing WEB verse`).toBeDefined();

  assertHebrewMarkers(wlc!, anchor.hebrewMarkers);
  assertEnglishMarkers(web!, anchor.englishMarkers);
}

function assertAligned(anchor: AlignedAnchor): void {
  const wlc = fetchVerse("wlc", anchor.bookId, anchor.chapter, anchor.verse);
  const web = fetchVerse("web", anchor.bookId, anchor.chapter, anchor.verse);

  expect(wlc, `${anchor.label}: missing WLC verse`).toBeDefined();
  expect(web, `${anchor.label}: missing WEB verse`).toBeDefined();

  assertHebrewMarkers(wlc!, anchor.hebrewMarkers);
  assertEnglishMarkers(web!, anchor.englishMarkers);

  // Guard against false-positive drift: an intentional +1 WEB offset must not match.
  const shiftedWeb = fetchVerse("web", anchor.bookId, anchor.chapter, anchor.verse + 1);
  if (shiftedWeb) {
    const shiftedLower = normalizeEnglish(shiftedWeb.text);
    const primaryMarker = normalizeEnglish(anchor.englishMarkers[0]!);
    expect(
      shiftedLower,
      `${anchor.label}: shifted WEB verse should not share primary marker`
    ).not.toContain(primaryMarker);
  }
}

const correspondenceAnchors: CorrespondenceAnchor[] = [
  // Psalm superscription offsets
  {
    label: "Psalm 1 — no superscription offset",
    wlc: { bookId: "PSA", chapter: 1, verse: 1 },
    web: { bookId: "PSA", chapter: 1, verse: 1 },
    hebrewMarkers: ["אשרי האיש"],
    englishMarkers: ["blessed is the man"],
  },
  {
    label: "Psalm 3 — +1 offset (WLC 3:2 ↔ WEB 3:1)",
    wlc: { bookId: "PSA", chapter: 3, verse: 2 },
    web: { bookId: "PSA", chapter: 3, verse: 1 },
    hebrewMarkers: ["מה רבו צרי"],
    englishMarkers: ["adversaries have increased"],
  },
  {
    label: "Psalm 51 — +2 offset (WLC 51:3 ↔ WEB 51:1)",
    wlc: { bookId: "PSA", chapter: 51, verse: 3 },
    web: { bookId: "PSA", chapter: 51, verse: 1 },
    hebrewMarkers: ["חנני אלהים"],
    englishMarkers: ["have mercy on me, god"],
  },

  // Chapter-boundary splits
  {
    label: "Joel — WLC 3:1 ↔ WEB 2:28",
    wlc: { bookId: "JOL", chapter: 3, verse: 1 },
    web: { bookId: "JOL", chapter: 2, verse: 28 },
    hebrewMarkers: ["אשפוך את רוחי", "על כל בשר"],
    englishMarkers: ["pour out my spirit", "all flesh"],
  },
  {
    label: "Malachi — WLC 3:19 ↔ WEB 4:1",
    wlc: { bookId: "MAL", chapter: 3, verse: 19 },
    web: { bookId: "MAL", chapter: 4, verse: 1 },
    hebrewMarkers: ["היום בא", "בער כתנור"],
    englishMarkers: ["day comes", "burning like a furnace"],
  },
  {
    label: "Jonah — WLC 2:1 ↔ WEB 1:17",
    wlc: { bookId: "JON", chapter: 2, verse: 1 },
    web: { bookId: "JON", chapter: 1, verse: 17 },
    hebrewMarkers: ["דג גדול", "לבלע את יונה"],
    englishMarkers: ["huge fish", "swallow up jonah"],
  },

  // Ecclesiastes 5 (+1 English offset from ch4/5 boundary)
  {
    label: "Ecclesiastes — WLC 4:17 ↔ WEB 5:1 chapter boundary",
    wlc: { bookId: "ECC", chapter: 4, verse: 17 },
    web: { bookId: "ECC", chapter: 5, verse: 1 },
    hebrewMarkers: ["שמר רגליך", "בית האלהים"],
    englishMarkers: ["guard your steps", "go to god", "house"],
  },
  {
    label: "Ecclesiastes 5 — WLC 5:1 ↔ WEB 5:2",
    wlc: { bookId: "ECC", chapter: 5, verse: 1 },
    web: { bookId: "ECC", chapter: 5, verse: 2 },
    hebrewMarkers: ["אל תבהל על פיך"],
    englishMarkers: ["rash with your mouth"],
  },
  {
    label: "Ecclesiastes 5 — WLC 5:16 ↔ WEB 5:17",
    wlc: { bookId: "ECC", chapter: 5, verse: 16 },
    web: { bookId: "ECC", chapter: 5, verse: 17 },
    hebrewMarkers: ["בחשך יאכל"],
    englishMarkers: ["eats in darkness"],
  },
  {
    label: "Ecclesiastes 5 — WLC 5:18 ↔ WEB 5:19",
    wlc: { bookId: "ECC", chapter: 5, verse: 18 },
    web: { bookId: "ECC", chapter: 5, verse: 19 },
    hebrewMarkers: ["נתן לו האלהים", "עשר ונכסים"],
    englishMarkers: ["gift of god", "riches and wealth"],
  },

  // Samuel/Kings/Chronicles/Nehemiah/Hosea cluster
  {
    label: "1 Kings — WLC 5:1 ↔ WEB 4:21",
    wlc: { bookId: "1KI", chapter: 5, verse: 1 },
    web: { bookId: "1KI", chapter: 4, verse: 21 },
    hebrewMarkers: ["שלמה", "מושל", "ארץ פלשתים"],
    englishMarkers: ["solomon ruled", "philistines"],
  },
  {
    label: "2 Samuel — WLC 19:1 ↔ WEB 18:33",
    wlc: { bookId: "2SA", chapter: 19, verse: 1 },
    web: { bookId: "2SA", chapter: 18, verse: 33 },
    hebrewMarkers: ["בני אבשלום"],
    englishMarkers: ["my son absalom"],
  },
  {
    label: "1 Samuel — WLC 24:1 ↔ WEB 23:29",
    wlc: { bookId: "1SA", chapter: 24, verse: 1 },
    web: { bookId: "1SA", chapter: 23, verse: 29 },
    hebrewMarkers: ["מצדות עין גדי"],
    englishMarkers: ["strongholds of en gedi"],
  },
  {
    label: "Nehemiah — WLC 3:33 ↔ WEB 4:1",
    wlc: { bookId: "NEH", chapter: 3, verse: 33 },
    web: { bookId: "NEH", chapter: 4, verse: 1 },
    hebrewMarkers: ["סנבלט", "בונים את החומה"],
    englishMarkers: ["sanballat", "building the wall"],
  },
  {
    label: "Hosea — WLC 2:1 ↔ WEB 1:10",
    wlc: { bookId: "HOS", chapter: 2, verse: 1 },
    web: { bookId: "HOS", chapter: 1, verse: 10 },
    hebrewMarkers: ["מספר בני ישראל", "חול הים"],
    englishMarkers: ["children of israel", "sand of the sea"],
  },
];

const alignedAnchors: AlignedAnchor[] = [
  {
    label: "1 Samuel 17:1 — no versification drift",
    bookId: "1SA",
    chapter: 17,
    verse: 1,
    hebrewMarkers: ["פלשתים", "מחניהם"],
    englishMarkers: ["philistines gathered"],
  },
  {
    label: "1 Samuel 17:47 — no versification drift",
    bookId: "1SA",
    chapter: 17,
    verse: 47,
    hebrewMarkers: ["לא בחרב ובחנית"],
    englishMarkers: ["save with sword and spear"],
  },
  {
    label: "1 Samuel 17:48 — no versification drift",
    bookId: "1SA",
    chapter: 17,
    verse: 48,
    hebrewMarkers: ["הפלשתי", "דוד"],
    englishMarkers: ["philistine arose", "david hurried"],
  },
];

describe("versification map artifact", () => {
  it("has expected structure and WLC inventory total", () => {
    expect(versificationMap.version).toBe(1);
    expect(versificationMap.wlc_inventory).toHaveLength(39);

    const total = versificationMap.wlc_inventory.reduce((s, b) => s + b.total_verses, 0);
    expect(total).toBe(23213);
  });

  it("documents design rationale", () => {
    expect(versificationMap.design.principle).toMatch(/preserves/i);
    expect(versificationMap.design.principle).toMatch(/never normalized/i);
  });
});

describe("WLC pointed-text golden verses", () => {
  const d1Ready = isLocalD1Seeded();

  it.each(versificationMap.golden_verses.map((g) => [g.ref, g] as const))(
    "%s preserves exact niqqud + cantillation in D1",
    (_ref, golden) => {
      if (!d1Ready) return;

      const row = fetchVerse("wlc", golden.book_id, golden.chapter, golden.verse);
      expect(row?.text).toBe(golden.text);
      expect(golden.text).toMatch(/[\u0591-\u05C7]/);
    }
  );
});

describe("versification correspondence anchors (local D1)", () => {
  const d1Ready = isLocalD1Seeded();

  it("requires seeded local D1 with WLC data", () => {
    expect(d1Ready).toBe(true);
  });

  it.each(correspondenceAnchors.map((a) => [a.label, a] as const))(
    "%s",
    (_label, anchor) => {
      if (!d1Ready) return;
      assertCorrespondence(anchor);
    }
  );

  it("Psalm 3:1 — WLC superscription has no English counterpart", () => {
    if (!d1Ready) return;

    const wlc = fetchVerse("wlc", "PSA", 3, 1);
    const webV1 = fetchVerse("web", "PSA", 3, 1);

    expect(wlc).toBeDefined();
    expect(webV1).toBeDefined();

    const wlcPlain = plainHebrew(wlc!.text);
    expect(wlcPlain).toMatch(/מזמור/);
    expect(wlcPlain).not.toContain("מה רבו צרי");

    // WEB 3:1 is WLC 3:2 content, not the superscription.
    assertEnglishMarkers(webV1!, ["adversaries have increased"]);
    expect(compactHebrew(wlc!.text)).not.toContain(compactHebrew("מה רבו צרי"));
  });

  it("Psalm 51 — two-line superscription before +2 content offset", () => {
    if (!d1Ready) return;

    const wlc1 = fetchVerse("wlc", "PSA", 51, 1);
    const wlc2 = fetchVerse("wlc", "PSA", 51, 2);
    const wlc3 = fetchVerse("wlc", "PSA", 51, 3);
    const web1 = fetchVerse("web", "PSA", 51, 1);

    expect(wlc1).toBeDefined();
    expect(wlc2).toBeDefined();
    expect(wlc3).toBeDefined();
    expect(web1).toBeDefined();

    expect(plainHebrew(wlc1!.text)).toMatch(/מזמור/);
    expect(plainHebrew(wlc2!.text)).toContain("נתן הנביא");
    assertHebrewMarkers(wlc3!, ["חנני אלהים"]);
    assertEnglishMarkers(web1!, ["have mercy on me, god"]);

    // Wrong offset: WEB 51:2 is not the penitential opening.
    const web2 = fetchVerse("web", "PSA", 51, 2);
    expect(normalizeEnglish(web2?.text ?? "")).not.toContain("have mercy on me, god");
  });
});

describe("versification negative control — aligned references (local D1)", () => {
  const d1Ready = isLocalD1Seeded();

  it.each(alignedAnchors.map((a) => [a.label, a] as const))(
    "%s",
    (_label, anchor) => {
      if (!d1Ready) return;
      assertAligned(anchor);
    }
  );
});