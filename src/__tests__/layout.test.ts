import { describe, expect, it } from "vitest";
import { layoutText, parseStoredLayout, type LayoutItem } from "../lib/layout.js";

const text = "The LORD is my shepherd; I shall not want.";
const psalm23: LayoutItem[] = [
  { type: "heading", text: "The LORD Is My Shepherd", level: 2 },
  { type: "title", text: "A Psalm of David." },
  { type: "text", text: "The LORD is my shepherd;", block: "q1" },
  { type: "text", text: " I shall not want.", block: "q2" },
];

describe("layoutText", () => {
  it("joins the text items and nothing else", () => {
    expect(layoutText(psalm23)).toBe(text);
    expect(layoutText([{ type: "break" }, { type: "speaker", text: "Beloved" }])).toBe("");
  });
});

describe("parseStoredLayout", () => {
  it("returns a stored layout whose text items join to the verse text", () => {
    expect(parseStoredLayout(JSON.stringify(psalm23), text)).toEqual(psalm23);
  });

  it("accepts every item type, and a text item with no block", () => {
    const layout: LayoutItem[] = [
      { type: "heading", text: "BOOK 2", level: 1 },
      { type: "speaker", text: "Beloved" },
      { type: "break" },
      { type: "text", text: "Rise up," },
      { type: "text", text: " my love.", block: "pi" },
    ];
    expect(parseStoredLayout(JSON.stringify(layout), "Rise up, my love.")).toEqual(layout);
  });

  it("treats a missing layout as none", () => {
    expect(parseStoredLayout(null, text)).toBeUndefined();
    expect(parseStoredLayout(undefined, text)).toBeUndefined();
    expect(parseStoredLayout("", text)).toBeUndefined();
    expect(parseStoredLayout("[]", text)).toBeUndefined();
  });

  it("leaves out a layout that no longer partitions the text it would be served with", () => {
    expect(parseStoredLayout(JSON.stringify(psalm23), "The LORD is my shepherd; I lack nothing.")).toBeUndefined();
  });

  it.each([
    ["malformed JSON", "[{"],
    ["an object, not an array", JSON.stringify({ type: "text", text })],
    ["an unknown item type", JSON.stringify([{ type: "footnote", text }])],
    ["an unknown block", JSON.stringify([{ type: "text", text, block: "q9" }])],
    ["a heading level out of range", JSON.stringify([{ type: "heading", text: "x", level: 4 }, { type: "text", text }])],
    ["a text item without text", JSON.stringify([{ type: "text" }])],
  ])("leaves out %s", (_label, raw) => {
    expect(parseStoredLayout(raw, text)).toBeUndefined();
  });
});
