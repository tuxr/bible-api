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

      expect(nav.previous).toEqual({ book: "GEN", chapter: 24, testament: "OT" });
      expect(nav.next).toEqual({ book: "GEN", chapter: 26, testament: "OT" });
    });
  });

  describe("first chapter of a book", () => {
    it("returns previous book's last chapter for Genesis 1", () => {
      const genesis = findBook("Genesis")!;
      const nav = getChapterNavigation(genesis, 1);

      // Genesis is the first book, no previous
      expect(nav.previous).toBeNull();
      expect(nav.next).toEqual({ book: "GEN", chapter: 2, testament: "OT" });
    });

    it("returns previous book's last chapter for Exodus 1", () => {
      const exodus = findBook("Exodus")!;
      const nav = getChapterNavigation(exodus, 1);

      // Genesis has 50 chapters
      expect(nav.previous).toEqual({ book: "GEN", chapter: 50, testament: "OT" });
      expect(nav.next).toEqual({ book: "EXO", chapter: 2, testament: "OT" });
    });

    it("returns Malachi as previous for Matthew 1", () => {
      const matthew = findBook("Matthew")!;
      const nav = getChapterNavigation(matthew, 1);

      // Malachi has 4 chapters - crosses OT to NT boundary
      expect(nav.previous).toEqual({ book: "MAL", chapter: 4, testament: "OT" });
      expect(nav.next).toEqual({ book: "MAT", chapter: 2, testament: "NT" });
    });
  });

  describe("last chapter of a book", () => {
    it("returns next book's first chapter for Genesis 50", () => {
      const genesis = findBook("Genesis")!;
      const nav = getChapterNavigation(genesis, 50);

      expect(nav.previous).toEqual({ book: "GEN", chapter: 49, testament: "OT" });
      expect(nav.next).toEqual({ book: "EXO", chapter: 1, testament: "OT" });
    });

    it("returns Tobit as next for Revelation 22 (crosses into Apocrypha)", () => {
      const revelation = findBook("Revelation")!;
      const nav = getChapterNavigation(revelation, 22);

      expect(nav.previous).toEqual({ book: "REV", chapter: 21, testament: "NT" });
      // Apocrypha follows NT - client can use testament to decide behavior
      expect(nav.next).toEqual({ book: "TOB", chapter: 1, testament: "AP" });
    });
  });

  describe("single-chapter books", () => {
    it("handles Jude (single chapter)", () => {
      const jude = findBook("Jude")!;
      const nav = getChapterNavigation(jude, 1);

      // Jude only has 1 chapter, so next goes to Revelation
      expect(nav.previous).toEqual({ book: "3JN", chapter: 1, testament: "NT" });
      expect(nav.next).toEqual({ book: "REV", chapter: 1, testament: "NT" });
    });

    it("handles Obadiah (single chapter)", () => {
      const obadiah = findBook("Obadiah")!;
      const nav = getChapterNavigation(obadiah, 1);

      // Amos has 9 chapters, Jonah follows Obadiah
      expect(nav.previous).toEqual({ book: "AMO", chapter: 9, testament: "OT" });
      expect(nav.next).toEqual({ book: "JON", chapter: 1, testament: "OT" });
    });
  });

  describe("Apocrypha books", () => {
    it("handles Tobit navigation", () => {
      const tobit = findBook("Tobit")!;
      const nav = getChapterNavigation(tobit, 7);

      expect(nav.previous).toEqual({ book: "TOB", chapter: 6, testament: "AP" });
      expect(nav.next).toEqual({ book: "TOB", chapter: 8, testament: "AP" });
    });

    it("handles first Apocrypha book (Tobit chapter 1)", () => {
      const tobit = findBook("Tobit")!;
      const nav = getChapterNavigation(tobit, 1);

      // Revelation (22 chapters) comes before Tobit - crosses NT to AP boundary
      expect(nav.previous).toEqual({ book: "REV", chapter: 22, testament: "NT" });
      expect(nav.next).toEqual({ book: "TOB", chapter: 2, testament: "AP" });
    });
  });

  describe("testament boundaries", () => {
    it("shows testament change from OT to NT", () => {
      const matthew = findBook("Matthew")!;
      const nav = getChapterNavigation(matthew, 1);

      expect(nav.previous?.testament).toBe("OT");
      expect(nav.next?.testament).toBe("NT");
    });

    it("shows testament change from NT to AP", () => {
      const revelation = findBook("Revelation")!;
      const nav = getChapterNavigation(revelation, 22);

      expect(nav.previous?.testament).toBe("NT");
      expect(nav.next?.testament).toBe("AP");
    });
  });
});
