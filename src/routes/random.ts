/**
 * Random verse route handler
 * GET /v1/random
 */

import { Hono } from "hono";
import type { Env, VersesApiResponse } from "../types.js";
import { getRandomVerse, getTranslation, getBookName } from "../lib/db.js";
import { notFound, badRequest, serviceUnavailable, jsonWithCache, CACHE_NONE } from "../lib/response.js";
import { findBook } from "../lib/books-data.js";

const random = new Hono<{ Bindings: Env }>();

random.get("/", async (c) => {
  const translationId = (c.req.query("translation") ?? "web").toLowerCase();
  const bookParam = c.req.query("book");
  const testamentParam = c.req.query("testament");

  // Verify translation exists
  const translationResult = await getTranslation(c.env.DB, translationId);
  if (!translationResult.success) {
    return serviceUnavailable(c, translationResult.error);
  }
  if (!translationResult.data) {
    return notFound(c, `Translation not found: ${translationId}`);
  }
  const translation = translationResult.data;

  // Validate and resolve book parameter
  let bookId: string | undefined;
  if (bookParam) {
    const book = findBook(bookParam);
    if (!book) {
      return badRequest(c, `Unknown book: ${bookParam}`);
    }
    bookId = book.id;
  }

  // Validate testament parameter
  let testament: "OT" | "NT" | "AP" | undefined;
  if (testamentParam) {
    const upper = testamentParam.toUpperCase();
    if (upper !== "OT" && upper !== "NT" && upper !== "AP") {
      return badRequest(c, "Testament must be OT, NT, or AP");
    }
    testament = upper;
  }

  // Get random verse with filters
  const verseResult = await getRandomVerse(c.env.DB, translationId, { bookId, testament });
  if (!verseResult.success) {
    return serviceUnavailable(c, verseResult.error);
  }
  const verse = verseResult.data;

  if (!verse) {
    return notFound(c, "No verses found");
  }

  const bookName = getBookName(verse.book_id);
  const reference = `${bookName} ${verse.chapter}:${verse.verse}`;

  const response: VersesApiResponse = {
    reference,
    translation: {
      id: translation.id,
      name: translation.name,
    },
    verses: [
      {
        book: verse.book_id,
        book_name: bookName,
        chapter: verse.chapter,
        verse: verse.verse,
        text: verse.text,
      },
    ],
    text: verse.text,
  };

  return jsonWithCache(c, response, CACHE_NONE);
});

export default random;
