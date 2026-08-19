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
import { parseDecimalInteger } from "../lib/numbers.js";
import { badRequest, notFound, serviceUnavailable, jsonWithCache, CACHE_IMMUTABLE } from "../lib/response.js";
import { parseSegmentsFlag, parseStoredSegments } from "../lib/segments.js";

const chapters = new Hono<{ Bindings: Env }>();

chapters.get("/:book/:chapter", async (c) => {
  const bookParam = c.req.param("book");
  const chapterParam = c.req.param("chapter");
  const translationId = (c.req.query("translation") ?? "web").toLowerCase();
  const segmentsFlag = parseSegmentsFlag(c.req.query("segments"));
  if (segmentsFlag === "invalid") return badRequest(c, "Invalid segments flag");
  const includeSegments = segmentsFlag === "on";

  // Resolve book (accepts "Genesis", "GEN", "Gen", etc.)
  const book = findBook(bookParam);
  if (!book) {
    return badRequest(c, `Unknown book: ${bookParam}`);
  }

  // Validate chapter number
  const chapter = parseDecimalInteger(chapterParam);
  if (chapter === null || chapter < 1) {
    return badRequest(c, `Invalid chapter: ${chapterParam}`);
  }
  if (chapter > book.chapters) {
    return badRequest(
      c,
      `Invalid chapter: ${chapterParam} (${book.name} has ${book.chapters} chapter${book.chapters === 1 ? "" : "s"})`
    );
  }

  // Verify translation exists
  const translationResult = await getTranslation(c.env.DB, translationId);
  if (!translationResult.success) {
    return serviceUnavailable(c, translationResult.error);
  }
  if (!translationResult.data) {
    return notFound(c, `Translation not found: ${translationId}`);
  }
  const translation = translationResult.data;

  // Fetch verses for this chapter
  const versesResult = await getChapterVerses(c.env.DB, book.id, chapter, translationId);
  if (!versesResult.success) {
    return serviceUnavailable(c, versesResult.error);
  }
  const verseRows = versesResult.data;

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
      language: translation.language,
    },
    verses: verseRows.map((v) => ({
      verse: v.verse,
      text: v.text,
      ...(includeSegments && parseStoredSegments(v.segments) ? { segments: parseStoredSegments(v.segments) } : {}),
    })),
    verse_count: verseRows.length,
    navigation,
  };

  return jsonWithCache(c, response, CACHE_IMMUTABLE);
});

export default chapters;
