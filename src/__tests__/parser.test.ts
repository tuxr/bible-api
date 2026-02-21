/**
 * Tests for the Bible reference parser
 */

import { describe, it, expect } from "vitest";
import { parseReference, formatReference, parseMultipleReferences, type ParsedReference } from "../lib/parser.js";
import { findBook } from "../lib/books-data.js";

describe("parseReference", () => {
  describe("single verse", () => {
    it("parses John 3:16", () => {
      const result = parseReference("John 3:16");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("JHN");
        expect(result.reference.startChapter).toBe(3);
        expect(result.reference.startVerse).toBe(16);
        expect(result.reference.endChapter).toBe(3);
        expect(result.reference.endVerse).toBe(16);
        expect(result.normalized).toBe("John 3:16");
      }
    });

    it("parses abbreviated Jn 3:16", () => {
      const result = parseReference("Jn 3:16");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("JHN");
        expect(result.normalized).toBe("John 3:16");
      }
    });

    it("parses Genesis 1:1", () => {
      const result = parseReference("Genesis 1:1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("GEN");
        expect(result.reference.startChapter).toBe(1);
        expect(result.reference.startVerse).toBe(1);
      }
    });

    it("parses Gen 1:1", () => {
      const result = parseReference("Gen 1:1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("GEN");
      }
    });
  });

  describe("verse range", () => {
    it("parses Romans 8:28-39", () => {
      const result = parseReference("Romans 8:28-39");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("ROM");
        expect(result.reference.startChapter).toBe(8);
        expect(result.reference.startVerse).toBe(28);
        expect(result.reference.endChapter).toBe(8);
        expect(result.reference.endVerse).toBe(39);
        expect(result.normalized).toBe("Romans 8:28-39");
      }
    });
  });

  describe("full chapter", () => {
    it("parses Psalm 23", () => {
      const result = parseReference("Psalm 23");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("PSA");
        expect(result.reference.startChapter).toBe(23);
        expect(result.reference.startVerse).toBe(null);
        expect(result.reference.endChapter).toBe(23);
        expect(result.reference.endVerse).toBe(null);
        expect(result.normalized).toBe("Psalms 23");
      }
    });

    it("parses 1 Corinthians 13", () => {
      const result = parseReference("1 Corinthians 13");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("1CO");
        expect(result.reference.startChapter).toBe(13);
        expect(result.reference.startVerse).toBe(null);
        expect(result.normalized).toBe("1 Corinthians 13");
      }
    });

    it("parses 1Cor 13 (no space)", () => {
      const result = parseReference("1Cor 13");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("1CO");
      }
    });
  });

  describe("multi-chapter range", () => {
    it("parses Genesis 1:1-2:3", () => {
      const result = parseReference("Genesis 1:1-2:3");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("GEN");
        expect(result.reference.startChapter).toBe(1);
        expect(result.reference.startVerse).toBe(1);
        expect(result.reference.endChapter).toBe(2);
        expect(result.reference.endVerse).toBe(3);
        expect(result.normalized).toBe("Genesis 1:1-2:3");
      }
    });
  });

  describe("numbered books", () => {
    it("parses 1 Samuel 1:1", () => {
      const result = parseReference("1 Samuel 1:1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("1SA");
      }
    });

    it("parses I Samuel 1:1", () => {
      const result = parseReference("I Samuel 1:1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("1SA");
      }
    });

    it("parses First Samuel 1:1", () => {
      const result = parseReference("First Samuel 1:1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("1SA");
      }
    });
  });

  describe("URL encoded input", () => {
    it("parses john+3:16", () => {
      const result = parseReference("john+3:16");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("JHN");
      }
    });

    // Note: %20 is now handled at the route level via decodeURIComponent()
    // The parser only handles + for query string compatibility
    it("does not parse %20 directly (routes handle URL decoding)", () => {
      const result = parseReference("John%203:16");
      // This fails because %20 is not decoded - routes should call decodeURIComponent first
      expect(result.success).toBe(false);
    });
  });

  describe("single-chapter books", () => {
    it("parses Jude 5 as Jude 1:5", () => {
      const result = parseReference("Jude 5");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("JUD");
        expect(result.reference.startChapter).toBe(1);
        expect(result.reference.startVerse).toBe(5);
        expect(result.normalized).toBe("Jude 5");
      }
    });

    it("parses Philemon 15", () => {
      const result = parseReference("Philemon 15");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("PHM");
        expect(result.reference.startChapter).toBe(1);
        expect(result.reference.startVerse).toBe(15);
      }
    });

    it("parses 2 John 9", () => {
      const result = parseReference("2 John 9");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("2JN");
        expect(result.reference.startChapter).toBe(1);
        expect(result.reference.startVerse).toBe(9);
      }
    });

    it("parses Obadiah 1", () => {
      const result = parseReference("Obadiah 1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("OBA");
        expect(result.reference.startChapter).toBe(1);
        expect(result.reference.startVerse).toBe(1);
      }
    });
  });

  describe("Apocrypha books", () => {
    it("parses Tobit 1:1", () => {
      const result = parseReference("Tobit 1:1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("TOB");
        expect(result.reference.startChapter).toBe(1);
        expect(result.reference.startVerse).toBe(1);
      }
    });

    it("parses Wisdom 1:1", () => {
      const result = parseReference("Wisdom 1:1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("WIS");
      }
    });

    it("parses Sirach 1:1", () => {
      const result = parseReference("Sirach 1:1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("SIR");
      }
    });

    it("parses 1 Maccabees 1:1", () => {
      const result = parseReference("1 Maccabees 1:1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.reference.book.id).toBe("1MA");
      }
    });
  });

  describe("error cases", () => {
    it("rejects empty input", () => {
      const result = parseReference("");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Empty");
      }
    });

    it("rejects unknown book", () => {
      const result = parseReference("FakeBook 1:1");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Unknown book");
      }
    });

    it("rejects invalid chapter", () => {
      const result = parseReference("John 50:1");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("out of range");
      }
    });

    it("rejects reversed verse range", () => {
      const result = parseReference("John 3:20-10");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cannot be before");
      }
    });

    it("rejects verse 0", () => {
      const result = parseReference("John 3:0");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("at least 1");
      }
    });

    it("rejects verse 0 in range", () => {
      const result = parseReference("John 3:0-5");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("at least 1");
      }
    });
  });
});

describe("findBook", () => {
  it("finds book by full name", () => {
    expect(findBook("Genesis")?.id).toBe("GEN");
    expect(findBook("John")?.id).toBe("JHN");
    expect(findBook("Revelation")?.id).toBe("REV");
  });

  it("finds book by abbreviation", () => {
    expect(findBook("Gen")?.id).toBe("GEN");
    expect(findBook("Jn")?.id).toBe("JHN");
    expect(findBook("Rev")?.id).toBe("REV");
  });

  it("finds book by ID", () => {
    expect(findBook("GEN")?.id).toBe("GEN");
    expect(findBook("JHN")?.id).toBe("JHN");
  });

  it("is case-insensitive", () => {
    expect(findBook("genesis")?.id).toBe("GEN");
    expect(findBook("GENESIS")?.id).toBe("GEN");
    expect(findBook("gEnEsIs")?.id).toBe("GEN");
  });

  it("returns undefined for unknown books", () => {
    expect(findBook("NotABook")).toBeUndefined();
  });
});

describe("formatReference", () => {
  it("formats single verse", () => {
    const book = findBook("John")!;
    expect(formatReference(book, 3, 16, 3, 16)).toBe("John 3:16");
  });

  it("formats verse range", () => {
    const book = findBook("Romans")!;
    expect(formatReference(book, 8, 28, 8, 39)).toBe("Romans 8:28-39");
  });

  it("formats full chapter", () => {
    const book = findBook("Psalms")!;
    expect(formatReference(book, 23, null, 23, null)).toBe("Psalms 23");
  });

  it("formats multi-chapter range", () => {
    const book = findBook("Genesis")!;
    expect(formatReference(book, 1, 1, 2, 3)).toBe("Genesis 1:1-2:3");
  });

  it("formats single-chapter book verse", () => {
    const book = findBook("Jude")!;
    expect(formatReference(book, 1, 5, 1, 5)).toBe("Jude 5");
  });

  it("formats single-chapter book range", () => {
    const book = findBook("Jude")!;
    expect(formatReference(book, 1, 5, 1, 10)).toBe("Jude 5-10");
  });
});

describe("parseMultipleReferences (comma-separated)", () => {
  it("parses 'Romans 14:14, 22-23' — verse-level inheritance", () => {
    const result = parseMultipleReferences("Romans 14:14, 22-23");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.references).toHaveLength(2);
      const [ref0, ref1] = result.references as [ParsedReference, ParsedReference];
      expect(ref0.book.id).toBe("ROM");
      expect(ref0.startChapter).toBe(14);
      expect(ref0.startVerse).toBe(14);
      expect(ref0.endVerse).toBe(14);
      expect(ref1.book.id).toBe("ROM");
      expect(ref1.startChapter).toBe(14);
      expect(ref1.startVerse).toBe(22);
      expect(ref1.endVerse).toBe(23);
      expect(result.normalized).toBe("Romans 14:14, Romans 14:22-23");
    }
  });

  it("parses 'Psalm 23, 24' — chapter-level inheritance", () => {
    const result = parseMultipleReferences("Psalm 23, 24");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.references).toHaveLength(2);
      const [ref0, ref1] = result.references as [ParsedReference, ParsedReference];
      expect(ref0.book.id).toBe("PSA");
      expect(ref0.startChapter).toBe(23);
      expect(ref0.startVerse).toBeNull();
      expect(ref1.book.id).toBe("PSA");
      expect(ref1.startChapter).toBe(24);
      expect(ref1.startVerse).toBeNull();
      expect(result.normalized).toBe("Psalms 23, Psalms 24");
    }
  });

  it("parses 'Genesis 1:1, 2:3' — book-level inheritance with colon", () => {
    const result = parseMultipleReferences("Genesis 1:1, 2:3");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.references).toHaveLength(2);
      const [ref0, ref1] = result.references as [ParsedReference, ParsedReference];
      expect(ref0.book.id).toBe("GEN");
      expect(ref0.startChapter).toBe(1);
      expect(ref0.startVerse).toBe(1);
      expect(ref1.book.id).toBe("GEN");
      expect(ref1.startChapter).toBe(2);
      expect(ref1.startVerse).toBe(3);
      expect(result.normalized).toBe("Genesis 1:1, Genesis 2:3");
    }
  });

  it("parses 'John 3:16, Romans 8:28' — two standalone refs", () => {
    const result = parseMultipleReferences("John 3:16, Romans 8:28");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.references).toHaveLength(2);
      const [ref0, ref1] = result.references as [ParsedReference, ParsedReference];
      expect(ref0.book.id).toBe("JHN");
      expect(ref0.startChapter).toBe(3);
      expect(ref0.startVerse).toBe(16);
      expect(ref1.book.id).toBe("ROM");
      expect(ref1.startChapter).toBe(8);
      expect(ref1.startVerse).toBe(28);
      expect(result.normalized).toBe("John 3:16, Romans 8:28");
    }
  });

  it("parses 'Jude 5, 8-10' — single-chapter book edge case", () => {
    const result = parseMultipleReferences("Jude 5, 8-10");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.references).toHaveLength(2);
      const [ref0, ref1] = result.references as [ParsedReference, ParsedReference];
      expect(ref0.book.id).toBe("JUD");
      expect(ref0.startChapter).toBe(1);
      expect(ref0.startVerse).toBe(5);
      expect(ref1.book.id).toBe("JUD");
      expect(ref1.startChapter).toBe(1);
      expect(ref1.startVerse).toBe(8);
      expect(ref1.endVerse).toBe(10);
      expect(result.normalized).toBe("Jude 5, Jude 8-10");
    }
  });
});
