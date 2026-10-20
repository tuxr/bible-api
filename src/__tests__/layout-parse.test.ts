import { describe, expect, it } from "vitest";
import { layoutBlock, parseUSFXBuffer, type ParsedVerse } from "../lib/usfx-parse.js";
import { bsbUsfmCleanup, parseUSFMBooks } from "../lib/usfm-parse.js";

const usfx = (body: string) => parseUSFXBuffer(Buffer.from(`<usfx>${body}</usfx>`), "web");
const usfm = (name: string, lines: string[]) =>
  parseUSFMBooks([{ name, content: lines.join("\n") }], "bsb", { cleanup: bsbUsfmCleanup });
const joined = (verse: ParsedVerse) => verse.layout?.map((item) => (item.type === "text" ? item.text : "")).join("");

describe("USFX layout", () => {
  it("splits a poetry verse into its lines, with the Psalm's title before them", () => {
    const [verse] = usfx(
      '<book id="PSA"><c id="23"/><d style="d">A Psalm by David.\n</d>' +
        '<q style="q1"><v id="1"/>The LORD is my shepherd;\n</q><q level="2" style="q2">I shall lack nothing.\n<ve/></q></book>'
    ).verses;
    expect(verse).toEqual({
      book: "PSA", chapter: 23, verse: 1, text: "The LORD is my shepherd; I shall lack nothing.",
      layout: [
        { type: "title", text: "A Psalm by David." },
        { type: "text", text: "The LORD is my shepherd;", block: "q1" },
        { type: "text", text: " I shall lack nothing.", block: "q2" },
      ],
    });
  });

  it("marks a paragraph that opens mid-verse, and leaves a verse inside a paragraph without layout", () => {
    const verses = usfx(
      '<book id="GEN"><c id="1"/><p style="p"><v id="1"/>In the beginning. <v id="2"/>The earth was formless.\n</p>' +
        '<p style="p">God said, “Let there be light.”</p></book>'
    ).verses;
    expect(verses[0]!.layout).toEqual([{ type: "text", text: "In the beginning.", block: "p" }]);
    expect(verses[1]).toEqual({
      book: "GEN", chapter: 1, verse: 2, text: "The earth was formless. God said, “Let there be light.”",
      layout: [
        { type: "text", text: "The earth was formless." },
        { type: "text", text: " God said, “Let there be light.”", block: "p" },
      ],
    });
  });

  it("sets a heading before the text that follows it, between verses or within one", () => {
    const verses = parseUSFXBuffer(
      Buffer.from(
        '<usfx><book id="MRK"><c id="6"/><p style="p"><v id="5"/>He could do no mighty work.</p>' +
          '<s style="s">Jesus Sends<f>note</f> Out the Twelve</s><p style="m"><v id="6"/>He marveled. ' +
          '<s style="s">The Mission</s>He went around.</p></book></usfx>'
      ),
      "tcgnt"
    ).verses;
    expect(verses[0]!.layout).toEqual([{ type: "text", text: "He could do no mighty work.", block: "p" }]);
    expect(verses[1]!.text).toBe("He marveled. He went around.");
    expect(verses[1]!.layout).toEqual([
      { type: "heading", text: "Jesus Sends Out the Twelve", level: 2 },
      { type: "text", text: "He marveled.", block: "m" },
      { type: "heading", text: "The Mission", level: 2 },
      { type: "text", text: " He went around." },
    ]);
  });

  it("marks stanza breaks and major sections", () => {
    const [verse] = usfx(
      '<book id="PSA"><c id="42"/><p sfm="ms" style="ms1">BOOK 2\n</p><b style="b"/><q style="q1"><v id="1"/>As the deer pants.</q></book>'
    ).verses;
    expect(verse!.layout).toEqual([
      { type: "heading", text: "BOOK 2", level: 1 },
      { type: "break" },
      { type: "text", text: "As the deer pants.", block: "q1" },
    ]);
  });

  it("takes Psalm 119's letters and the Song of Songs' speakers out of the verse text", () => {
    const psalm = usfx(
      '<book id="PSA"><c id="119"/><q style="q1"><v id="8"/>Don’t utterly forsake me.\n</q><d style="d">BETH\n<ve/>\n</d>' +
        '<q style="q1"><v id="9"/>How can a young man keep his way pure?</q></book>'
    ).verses;
    expect(psalm.map((verse) => verse.text)).toEqual(["Don’t utterly forsake me.", "How can a young man keep his way pure?"]);
    expect(psalm[1]!.layout?.[0]).toEqual({ type: "title", text: "BETH" });

    const song = usfx(
      '<book id="SNG"><c id="1"/><q style="q1"><v id="4"/>The king has brought me into his rooms.\n</q>' +
        '<p sfm="sp" style="sp">Friends\n</p><q style="q1">We will be glad.</q></book>'
    ).verses;
    expect(song[0]).toEqual({
      book: "SNG", chapter: 1, verse: 4, text: "The king has brought me into his rooms. We will be glad.",
      layout: [
        { type: "text", text: "The king has brought me into his rooms.", block: "q1" },
        { type: "speaker", text: "Friends" },
        { type: "text", text: " We will be glad.", block: "q1" },
      ],
    });
  });

  it("keeps the labels in the verse text, with no layout, in legacy mode", () => {
    const parsed = parseUSFXBuffer(
      Buffer.from('<usfx><book id="SNG"><c id="1"/><q style="q1"><v id="4"/>Into his rooms.\n</q><p style="sp">Friends\n</p><q>We will be glad.</q></book></usfx>'),
      "web",
      { legacy: true }
    );
    expect(parsed.verses).toEqual([{ book: "SNG", chapter: 1, verse: 4, text: "Into his rooms. Friends We will be glad." }]);
  });

  it("partitions a red-letter poetry verse by both speaker and line", () => {
    const [verse] = usfx(
      '<book id="MAT"><c id="5"/><q style="q1"><v id="3"/><wj>“Blessed are the poor in spirit,\n</wj></q>' +
        '<q level="2" style="q2"><wj>for theirs is the Kingdom of Heaven.</wj></q></book>'
    ).verses;
    expect(verse!.segments).toEqual([{ text: "“Blessed are the poor in spirit, for theirs is the Kingdom of Heaven.", speaker: "jesus" }]);
    expect(verse!.layout).toEqual([
      { type: "text", text: "“Blessed are the poor in spirit,", block: "q1" },
      { type: "text", text: " for theirs is the Kingdom of Heaven.", block: "q2" },
    ]);
  });

  it("drops layout left at a chapter's end, as it drops the text", () => {
    const verses = usfx('<book id="ROM"><c id="16"/><p><v id="27"/>Amen.</p><s style="s">Written to the Romans.</s></book>').verses;
    expect(verses).toEqual([
      { book: "ROM", chapter: 16, verse: 27, text: "Amen.", layout: [{ type: "text", text: "Amen.", block: "p" }] },
    ]);
  });
});

describe("USFM layout", () => {
  it("reads the BSB's Psalm 23: heading, title inside verse 1's line, lines and a stanza break", () => {
    const verses = usfm("PSA.usfm", [
      "\\id PSA",
      "\\c 23",
      "\\s1 The LORD Is My Shepherd",
      "\\r (\\ref Ezekiel 34:11–24|EZK 34:11-24\\ref*)",
      "\\d \\v 1 A Psalm of David.",
      "\\q1 The LORD is my shepherd;\\f + \\fr 23:1 \\ft See \\ref Revelation 7:17|REV 7:17\\ref*.\\f*",
      "\\q2 I shall not want.",
      "\\b ",
      "\\q1 \\v 2 He makes me lie down in green pastures;",
    ]).verses;
    expect(verses).toEqual([
      {
        book: "PSA", chapter: 23, verse: 1, text: "The LORD is my shepherd; I shall not want.",
        layout: [
          { type: "heading", text: "The LORD Is My Shepherd", level: 2 },
          { type: "title", text: "A Psalm of David." },
          { type: "text", text: "The LORD is my shepherd;", block: "q1" },
          { type: "text", text: " I shall not want.", block: "q2" },
        ],
      },
      {
        book: "PSA", chapter: 23, verse: 2, text: "He makes me lie down in green pastures;",
        layout: [{ type: "break" }, { type: "text", text: "He makes me lie down in green pastures;", block: "q1" }],
      },
    ]);
  });

  it("sets acrostic letters as titles, Selah right, subsections at level 3 and list items by indent", () => {
    const verses = usfm("PSA.usfm", [
      "\\id PSA",
      "\\c 119",
      "\\qa BETH",
      "\\q1 \\v 9 How can a young man keep his way pure?",
      "\\qr Selah",
      "\\s2 The Sons",
      "\\li1 \\v 10 Of the sons of Phinehas,",
      "\\li2 Gershom.",
      "\\nb and Daniel.",
    ]).verses;
    expect(verses[0]!.layout).toEqual([
      { type: "title", text: "BETH" },
      { type: "text", text: "How can a young man keep his way pure?", block: "q1" },
      { type: "text", text: " Selah", block: "qr" },
    ]);
    expect(verses[1]!.layout).toEqual([
      { type: "heading", text: "The Sons", level: 3 },
      { type: "text", text: "Of the sons of Phinehas,", block: "li1" },
      { type: "text", text: " Gershom. and Daniel.", block: "li2" },
    ]);
  });

  it("keeps a heading within a verse where it falls", () => {
    const [verse] = usfm("DEU.usfm", [
      "\\id DEU",
      "\\c 7",
      "\\p \\v 11 So keep the commandments.",
      "\\s1 The Promises of God",
      "\\p Then the LORD will keep His covenant.",
    ]).verses;
    expect(verse!.text).toBe("So keep the commandments. Then the LORD will keep His covenant.");
    expect(verse!.layout).toEqual([
      { type: "text", text: "So keep the commandments.", block: "p" },
      { type: "heading", text: "The Promises of God", level: 2 },
      { type: "text", text: " Then the LORD will keep His covenant.", block: "p" },
    ]);
  });

  it("keeps the partition where the cleanup joins two lines with no space", () => {
    const [verse] = usfm("ISA.usfm", ["\\id ISA", "\\c 1", "\\q1 \\v 1 They have forsaken the LORD —", "\\q2 they have turned away."]).verses;
    expect(verse!.text).toBe("They have forsaken the LORD—they have turned away.");
    expect(verse!.layout).toEqual([
      { type: "text", text: "They have forsaken the LORD—", block: "q1" },
      { type: "text", text: "they have turned away.", block: "q2" },
    ]);
    expect(joined(verse!)).toBe(verse!.text);
  });
});

describe("layoutBlock", () => {
  it.each([
    ["p", "p"], ["pmo", "p"], ["m", "m"], ["mr", "m"], ["pi1", "pi"], ["q", "q1"], ["q2", "q2"], ["q4", "q3"],
    ["qr", "qr"], ["pc", "pc"], ["li", "li1"], ["li2", "li2"], ["d", "p"],
  ])("sets %s as %s", (marker, block) => {
    expect(layoutBlock(marker)).toBe(block);
  });

  it("continues the block at \\nb and ignores introductions and book titles", () => {
    expect(layoutBlock("nb")).toBeUndefined();
    for (const marker of ["ip", "is1", "imt1", "mt1", "toc2", "h"]) expect(layoutBlock(marker)).toBeNull();
  });
});
