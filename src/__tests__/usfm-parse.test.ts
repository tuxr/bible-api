import { describe, expect, it } from "vitest";
import { bsbUsfmCleanup, parseUSFMBooks } from "../lib/usfm-parse.js";

const book = (name: string, content: string) => ({ name, content });

describe("USFM parsing", () => {
  // As with USFX, the space at a speaker change opens the next segment.
  it("marks \\wj as jesus segments, across verses within a paragraph, keeping the space after \\wj*", () => {
    const parsed = parseUSFMBooks(
      [book("JHN.usfm", [
        "\\id JHN",
        "\\c 3",
        "\\p \\wj \\v 10 “You are Israel’s teacher,”\\wj* said Jesus, \\wj “and you do not understand? \\v 11 Truly, I tell you.”\\wj*",
      ].join("\n"))],
      "bsb",
    );
    expect(parsed.verses).toEqual([
      {
        book: "JHN", chapter: 3, verse: 10,
        text: "“You are Israel’s teacher,” said Jesus, “and you do not understand?",
        segments: [
          { text: "“You are Israel’s teacher,”", speaker: "jesus" },
          { text: " said Jesus,", speaker: "narrator" },
          { text: " “and you do not understand?", speaker: "jesus" },
        ],
      },
      { book: "JHN", chapter: 3, verse: 11, text: "Truly, I tell you.”", segments: [{ text: "Truly, I tell you.”", speaker: "jesus" }] },
    ]);
  });

  it("ends \\wj at the paragraph, and leaves unmarked verses without segments", () => {
    const parsed = parseUSFMBooks(
      [book("MAT.usfm", ["\\id MAT", "\\c 1", "\\p \\v 1 He said, \\wj “Come.", "\\p \\v 2 And they came."].join("\n"))],
      "bsb",
    );
    expect(parsed.verses[0]!.segments).toEqual([{ text: "He said,", speaker: "narrator" }, { text: " “Come.", speaker: "jesus" }]);
    expect(parsed.verses[1]).toEqual({ book: "MAT", chapter: 1, verse: 2, text: "And they came." });
  });

  it("drops headings, references, footnotes, Psalm titles and acrostic letters, and keeps Selah", () => {
    const parsed = parseUSFMBooks(
      [book("PSA.usfm", [
        "\\id PSA",
        "\\c 3",
        "\\ms BOOK I",
        "\\s1 Deliver Me, O LORD!",
        "\\r (\\ref 2 Samuel 15:13–29|2SA 15:13-29\\ref*)",
        "\\d \\v 1 A Psalm of David, when he fled from his son Absalom.",
        "\\b ",
        "\\q1 O LORD, how my foes have increased!",
        "\\q2 How many rise up against me!",
        "\\q1 \\v 2 Many say of me,",
        "\\q2 “God will not deliver him.”",
        "\\qr Selah\\f + \\fr 3:2 \\fqa Selah \\ft or \\fqa Interlude\\f*",
        "\\qa ALEPH",
        "\\q1 \\v 3 But You, O LORD, are a shield around me.",
      ].join("\n"))],
      "bsb",
    );
    expect(parsed.verses.map((verse) => verse.text)).toEqual([
      "O LORD, how my foes have increased! How many rise up against me!",
      "Many say of me, “God will not deliver him.” Selah",
      "But You, O LORD, are a shield around me.",
    ]);
  });

  it("keeps \\d outside the Psalms, and \\mr, as verse text", () => {
    const zec = book("ZEC.usfm", ["\\id ZEC", "\\c 12", "\\s1 The Coming Deliverance", "\\d \\v 1 This is the burden of the word of the LORD.", "\\p Thus declares the LORD."].join("\n"));
    const hab = book("HAB.usfm", ["\\id HAB", "\\c 3", "\\q1 \\v 19 He makes me walk upon the heights!", "\\mr For the choirmaster."].join("\n"));
    const parsed = parseUSFMBooks([zec, hab], "bsb");
    expect(parsed.verses.map((verse) => `${verse.book} ${verse.chapter}:${verse.verse} ${verse.text}`)).toEqual([
      "HAB 3:19 He makes me walk upon the heights! For the choirmaster.",
      "ZEC 12:1 This is the burden of the word of the LORD. Thus declares the LORD.",
    ]);
  });

  it("rejects a book with no \\id", () => {
    expect(() => parseUSFMBooks([book("X.usfm", "\\c 1\n\\p \\v 1 Text.")], "bsb")).toThrow(/no \\id line/);
  });
});

describe("bsbUsfmCleanup", () => {
  it.each([
    ["morning — the first day", "morning—the first day"],
    ["one to help him.[’’]", "one to help him."],
    ["the 1,775 shekels [of silver] he made", "the 1,775 shekels of silver he made"],
    ["she named vvv him Ben-oni.", "she named him Ben-oni."],
    ["their registration numbered... 40,500.", "their registration numbered 40,500."],
    ["(for he had removed it... ) and jumped", "(for he had removed it) and jumped"],
    ["the brothers ( a gathering of about a hundred and twenty ) and said,", "the brothers (a gathering of about a hundred and twenty) and said,"],
    ["of whom we can inquire? ”", "of whom we can inquire?”"],
    ["saying, ‘ I never saw you.’", "saying, ‘I never saw you.’"],
    ["She named him Samuel,saying, “Because", "She named him Samuel, saying, “Because"],
    ["in Hebrew,‘Saul, Saul", "in Hebrew, ‘Saul, Saul"],
    ["“evenif you, Coniah", "“even if you, Coniah"],
  ])("repairs %j", (artifact, repaired) => {
    expect(bsbUsfmCleanup(artifact)).toBe(repaired);
  });

  it("leaves the publisher's own ellipses and numbers alone", () => {
    for (const text of ["forgive their sin.... But if not,", "to forgive sins...” Then He said", "the 1,775 shekels", "3:16"]) {
      expect(bsbUsfmCleanup(text)).toBe(text);
    }
  });

  it("repairs whole verses without breaking the segment partition", () => {
    const parsed = parseUSFMBooks(
      [book("JHN.usfm", ["\\id JHN", "\\c 13", "\\p \\v 38 Jesus replied. \\wj “Before the rooster crows, you will deny Me three times.[’’]\\wj*"].join("\n"))],
      "bsb",
      { cleanup: bsbUsfmCleanup },
    );
    const verse = parsed.verses[0]!;
    expect(verse.text).toBe("Jesus replied. “Before the rooster crows, you will deny Me three times.");
    expect(verse.segments?.map((segment) => segment.text).join("")).toBe(verse.text);
    expect(verse.segments?.[1]).toEqual({ text: " “Before the rooster crows, you will deny Me three times.", speaker: "jesus" });
  });
});
