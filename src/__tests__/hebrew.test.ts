/**
 * Unit tests for Hebrew text normalization utilities.
 */

import { describe, it, expect } from "vitest";
import {
  containsHebrew,
  stripHebrewDiacritics,
  toSearchPlainText,
  normalizeSearchQuery,
} from "../lib/hebrew.js";

const GENESIS_1_1_POINTED =
  "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃";
const GENESIS_1_1_UNPOINTED = "בראשית ברא אלהים את השמים ואת הארץ׃";

describe("stripHebrewDiacritics", () => {
  it("removes niqqud and cantillation from pointed text", () => {
    expect(stripHebrewDiacritics(GENESIS_1_1_POINTED)).toBe(GENESIS_1_1_UNPOINTED);
  });

  it("leaves unpointed text unchanged", () => {
    expect(stripHebrewDiacritics("בראשית")).toBe("בראשית");
  });
});

describe("containsHebrew", () => {
  it("detects Hebrew characters", () => {
    expect(containsHebrew("בראשית")).toBe(true);
    expect(containsHebrew("hello")).toBe(false);
    expect(containsHebrew("love בראשית")).toBe(true);
  });
});

describe("toSearchPlainText", () => {
  it("strips diacritics for WLC", () => {
    expect(toSearchPlainText("wlc", GENESIS_1_1_POINTED)).toBe(GENESIS_1_1_UNPOINTED);
  });

  it("returns text unchanged for English translations", () => {
    const text = "For God so loved the world";
    expect(toSearchPlainText("web", text)).toBe(text);
    expect(toSearchPlainText("kjv", text)).toBe(text);
  });
});

describe("normalizeSearchQuery", () => {
  it("strips diacritics from Hebrew queries", () => {
    expect(normalizeSearchQuery("בְּרֵאשִׁ֖ית")).toBe("בראשית");
  });

  it("leaves English queries unchanged", () => {
    expect(normalizeSearchQuery("  God so loved  ")).toBe("God so loved");
  });
});