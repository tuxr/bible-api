/**
 * Chapters route handler
 * GET /v1/chapters/:book/:chapter
 *
 * Provides a clean endpoint for fetching full chapters with navigation hints.
 * Designed for sequential reading apps (e.g., mobile Bible readers).
 */

import { Hono } from "hono";
import type { Env, ChapterApiResponse } from "../types.js";
import { getChapterVerses, getTranslation } from "../lib/db.js";
import { findBook, getChapterNavigation } from "../lib/books-data.js";
import { badRequest, notFound } from "../lib/response.js";

const chapters = new Hono<{ Bindings: Env }>();

chapters.get("/:book/:chapter", async (c) => {
  const bookParam = c.req.param("book");
  const chapterParam = c.req.param("chapter");
  const translationId = (c.req.query("translation") ?? "web").toLowerCase();

  // Resolve book (accepts "Genesis", "GEN", "Gen", etc.)
  const book = findBook(bookParam);
  if (!book) {
    return badRequest(c, `Unknown book: ${bookParam}`);
  }

  // Validate chapter number
  const chapter = parseInt(chapterParam, 10);
  if (isNaN(chapter) || chapter < 1) {
    return badRequest(c, `Invalid chapter: ${chapterParam}`);
  }
  if (chapter > book.chapters) {
    return badRequest(
      c,
      `Invalid chapter: ${chapterParam} (${book.name} has ${book.chapters} chapter${book.chapters === 1 ? "" : "s"})`
    );
  }

  // Verify translation exists
  const translation = await getTranslation(c.env.DB, translationId);
  if (!translation) {
    return notFound(c, `Translation not found: ${translationId}`);
  }

  // Fetch verses for this chapter
  const verseRows = await getChapterVerses(c.env.DB, book.id, chapter, translationId);

  if (verseRows.length === 0) {
    return notFound(c, `No verses found for ${book.name} ${chapter}`);
  }

  // Calculate navigation
  const navigation = getChapterNavigation(book, chapter);

  const response: ChapterApiResponse = {
    book: {
      id: book.id,
      name: book.name,
      testament: book.testament,
    },
    chapter,
    translation: {
      id: translation.id,
      name: translation.name,
    },
    verses: verseRows.map((v) => ({
      verse: v.verse,
      text: v.text,
    })),
    verse_count: verseRows.length,
    navigation,
  };

  return c.json(response);
});

export default chapters;
