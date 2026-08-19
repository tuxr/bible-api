import { describe, expect, it } from "vitest";
import { parseUSFXBuffer } from "../lib/usfx-parse.js";

describe("USFX red-letter parsing", () => {
  it("keeps text flat while preserving wj boundaries", () => {
    const parsed = parseUSFXBuffer(Buffer.from('<usfx><book id="JHN"><c id="3"/><v id="16"/><wj>For God so loved</wj> the world.</book></usfx>'), "web");
    expect(parsed.verses[0]).toEqual({
      book: "JHN", chapter: 3, verse: 16, text: "For God so loved the world.",
      segments: [{ text: "For God so loved", speaker: "jesus" }, { text: " the world.", speaker: "narrator" }],
    });
  });

  it("keeps Jesus state across footnotes and assigns structural whitespace", () => {
    const parsed = parseUSFXBuffer(Buffer.from('<usfx><book id="JHN"><c id="1"/><v id="1"/><wj>Hello<f>note</f><p/>world</wj><q/> after.</book></usfx>'), "web");
    const verse = parsed.verses[0]!;
    expect(verse.text).toBe("Hello world after.");
    expect(verse.segments?.map((segment) => segment.text).join("")).toBe(verse.text);
    expect(verse.segments).toEqual([{ text: "Hello world", speaker: "jesus" }, { text: " after.", speaker: "narrator" }]);
  });

  it("omits segments for narrator-only verses", () => {
    const parsed = parseUSFXBuffer(Buffer.from('<usfx><book id="GEN"><c id="1"/><v id="1"/>In the beginning.</book></usfx>'), "web");
    expect(parsed.verses[0]).toEqual({ book: "GEN", chapter: 1, verse: 1, text: "In the beginning." });
  });
});
