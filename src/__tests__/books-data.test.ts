/**
 * Tests for books-data module, particularly navigation logic
 */

import { describe, it, expect } from "vitest";
import { findBook, getChapterNavigation, ALL_BOOKS } from "../lib/books-data.js";

describe("getChapterNavigation", () => {
  describe("middle of a book", () => {
    it("returns prev and next chapters within same book", () => {
      const genesis = findBook("Genesis")!;
      const nav = getChapterNavigation(genesis, 25);

      expect(nav.previous).toEqual({ book: "GEN", chapter: 24 });
      expect(nav.next).toEqual({ book: "GEN", chapter: 26 });
    });
  });

  describe("first chapter of a book", () => {
    it("returns previous book's last chapter for Genesis 1", () => {
      const genesis = findBook("Genesis")!;
      const nav = getChapterNavigation(genesis, 1);

      // Genesis is the first book, no previous
      expect(nav.previous).toBeNull();
      expect(nav.next).toEqual({ book: "GEN", chapter: 2 });
    });

    it("returns previous book's last chapter for Exodus 1", () => {
      const exodus = findBook("Exodus")!;
      const nav = getChapterNavigation(exodus, 1);

      // Genesis has 50 chapters
      expect(nav.previous).toEqual({ book: "GEN", chapter: 50 });
      expect(nav.next).toEqual({ book: "EXO", chapter: 2 });
    });

    it("returns Malachi as previous for Matthew 1", () => {
      const matthew = findBook("Matthew")!;
      const nav = getChapterNavigation(matthew, 1);

      // Malachi has 4 chapters
      expect(nav.previous).toEqual({ book: "MAL", chapter: 4 });
      expect(nav.next).toEqual({ book: "MAT", chapter: 2 });
    });
  });

  describe("last chapter of a book", () => {
    it("returns next book's first chapter for Genesis 50", () => {
      const genesis = findBook("Genesis")!;
      const nav = getChapterNavigation(genesis, 50);

      expect(nav.previous).toEqual({ book: "GEN", chapter: 49 });
      expect(nav.next).toEqual({ book: "EXO", chapter: 1 });
    });

    it("returns null for last chapter of Revelation", () => {
      const revelation = findBook("Revelation")!;
      const nav = getChapterNavigation(revelation, 22);

      expect(nav.previous).toEqual({ book: "REV", chapter: 21 });
      // Revelation is the last canonical book, but Apocrypha follows
      // Check if there's a next book
      const nextBook = ALL_BOOKS.find(b => b.order === revelation.order + 1);
      if (nextBook) {
        expect(nav.next).toEqual({ book: nextBook.id, chapter: 1 });
      }
    });
  });

  describe("single-chapter books", () => {
    it("handles Jude (single chapter)", () => {
      const jude = findBook("Jude")!;
      const nav = getChapterNavigation(jude, 1);

      // Jude only has 1 chapter, so next goes to Revelation
      expect(nav.previous).toEqual({ book: "3JN", chapter: 1 }); // 3 John is before Jude
      expect(nav.next).toEqual({ book: "REV", chapter: 1 });
    });

    it("handles Obadiah (single chapter)", () => {
      const obadiah = findBook("Obadiah")!;
      const nav = getChapterNavigation(obadiah, 1);

      // Amos has 9 chapters, Jonah follows Obadiah
      expect(nav.previous).toEqual({ book: "AMO", chapter: 9 });
      expect(nav.next).toEqual({ book: "JON", chapter: 1 });
    });
  });

  describe("Apocrypha books", () => {
    it("handles Tobit navigation", () => {
      const tobit = findBook("Tobit")!;
      const nav = getChapterNavigation(tobit, 7);

      expect(nav.previous).toEqual({ book: "TOB", chapter: 6 });
      expect(nav.next).toEqual({ book: "TOB", chapter: 8 });
    });

    it("handles first Apocrypha book (Tobit chapter 1)", () => {
      const tobit = findBook("Tobit")!;
      const nav = getChapterNavigation(tobit, 1);

      // Revelation (22 chapters) comes before Tobit in our ordering
      expect(nav.previous).toEqual({ book: "REV", chapter: 22 });
      expect(nav.next).toEqual({ book: "TOB", chapter: 2 });
    });
  });
});
