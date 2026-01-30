/**
 * Search route handler
 * GET /v1/search?q=...
 */

import { Hono } from "hono";
import type { Env, SearchApiResponse } from "../types.js";
import { searchVerses, getBookName } from "../lib/db.js";
import { badRequest } from "../lib/response.js";
import { findBook } from "../lib/books-data.js";

const search = new Hono<{ Bindings: Env }>();

search.get("/", async (c) => {
  const query = c.req.query("q");
  const translationId = (c.req.query("translation") ?? "web").toLowerCase();
  const bookParam = c.req.query("book");
  const testamentParam = c.req.query("testament");
  const limitParam = c.req.query("limit");
  const offsetParam = c.req.query("offset");

  if (!query || query.trim().length === 0) {
    return badRequest(c, "Missing required parameter: q");
  }

  if (query.length > 500) {
    return badRequest(c, "Query too long (max 500 characters)");
  }

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

  // Parse pagination with NaN validation
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : 20;
  const parsedOffset = offsetParam ? parseInt(offsetParam, 10) : 0;
  const limit = Number.isNaN(parsedLimit) ? 20 : Math.min(Math.max(parsedLimit, 1), 100);
  const offset = Number.isNaN(parsedOffset) || parsedOffset < 0 ? 0 : parsedOffset;

  // Execute search
  const { results, total } = await searchVerses(c.env.DB, query, translationId, {
    bookId,
    testament,
    limit,
    offset,
  });

  // Build response
  const response: SearchApiResponse = {
    query,
    translation: translationId,
    total,
    results: results.map((v) => {
      const bookName = getBookName(v.book_id);
      return {
        book: v.book_id,
        book_name: bookName,
        chapter: v.chapter,
        verse: v.verse,
        text: v.text,
        reference: `${bookName} ${v.chapter}:${v.verse}`,
      };
    }),
  };

  return c.json(response);
});

export default search;
