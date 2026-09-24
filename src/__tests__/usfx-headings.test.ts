import { describe, expect, it } from "vitest";
import { parseUSFXBuffer, repairEscapedMarkup } from "../lib/usfx-parse.js";

describe("USFX section headings", () => {
  it("does not append a heading to the previous verse", () => {
    const parsed = parseUSFXBuffer(
      Buffer.from('<usfx><book id="LUK"><c id="9"/><p><v id="27"/>τοῦ Θεοῦ.<ve/></p><s style="s">The Transfiguration\n</s><p><v id="28"/>Ἐγένετο δὲ</p></book></usfx>'),
      "tcgnt"
    );
    expect(parsed.verses.map((verse) => verse.text)).toEqual(["τοῦ Θεοῦ.", "Ἐγένετο δὲ"]);
  });

  it("drops a heading in the middle of a verse, footnotes inside it included", () => {
    const parsed = parseUSFXBuffer(
      Buffer.from('<usfx><book id="MRK"><c id="6"/><v id="6"/>καὶ ἐθαύμαζε. <s style="s">Jesus Sends<f>note</f> Out</s>Καὶ περιῆγε.</book></usfx>'),
      "tcgnt"
    );
    expect(parsed.verses[0]!.text).toBe("καὶ ἐθαύμαζε. Καὶ περιῆγε.");
  });

  it("keeps red-letter segments consistent with the stripped text", () => {
    const parsed = parseUSFXBuffer(
      Buffer.from('<usfx><book id="MRK"><c id="9"/><v id="1"/><wj>ἐν δυνάμει.</wj><s style="s">The Transfiguration</s></book></usfx>'),
      "tcgnt"
    );
    expect(parsed.verses[0]).toEqual({
      book: "MRK", chapter: 9, verse: 1, text: "ἐν δυνάμει.",
      segments: [{ text: "ἐν δυνάμει.", speaker: "jesus" }],
    });
  });
});

describe("escaped markup in eBible WLC", () => {
  it("repairs Deut 6:4's large ayin and dalet", () => {
    const raw = `'l s="H8085"'שְׁמַ֖'seg type="x-large"'ע'seg''/l' יִשְׂרָאֵ֑ל יְהוָ֥ה אֱלֹהֵ֖ינוּ יְהוָ֥ה ׀ 'l s="H259"'אֶחָֽ'seg type="x-large"'ד'seg''/l'׃`;
    expect(repairEscapedMarkup(raw)).toBe("שְׁמַ֖ע יִשְׂרָאֵ֑ל יְהוָ֥ה אֱלֹהֵ֖ינוּ יְהוָ֥ה ׀ אֶחָֽד׃");
  });

  it("repairs it during parsing", () => {
    const parsed = parseUSFXBuffer(
      Buffer.from(`<usfx><book id="DEU"><c id="6"/><v id="4"/> 'l s="H8085"'שְׁמַ֖'seg type="x-large"'ע'seg''/l' יִשְׂרָאֵ֑ל</book></usfx>`),
      "wlc"
    );
    expect(parsed.verses[0]!.text).toBe("שְׁמַ֖ע יִשְׂרָאֵ֑ל");
  });

  it("leaves ordinary apostrophes alone", () => {
    expect(repairEscapedMarkup("the LORD's house")).toBe("the LORD's house");
  });
});

describe("legacy parse mode", () => {
  it("reproduces the pre-fix output so backfills can tell fixes from upstream revisions", () => {
    const usfx = Buffer.from(
      `<usfx><book id="DEU"><c id="6"/><v id="4"/>'l s="H8085"'שְׁמַ֖'seg type="x-large"'ע'seg''/l' יִשְׂרָאֵ֑ל<s style="s">Heading</s></book></usfx>`
    );
    expect(parseUSFXBuffer(usfx, "wlc").verses[0]!.text).toBe("שְׁמַ֖ע יִשְׂרָאֵ֑ל");
    expect(parseUSFXBuffer(usfx, "wlc", { legacy: true }).verses[0]!.text).toBe(
      `'l s="H8085"'שְׁמַ֖'seg type="x-large"'ע'seg''/l' יִשְׂרָאֵ֑לHeading`
    );
  });
});
