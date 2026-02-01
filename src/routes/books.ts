/**
 * Books route handler
 * GET /v1/books
 *
 * Uses static book data from books-data.ts instead of database queries.
 * This is faster (no DB round-trip) and eliminates JSON.parse failure risk.
 */

import { Hono } from "hono";
import type { Env, BookApiResponse } from "../types.js";
import { ALL_BOOKS } from "../lib/books-data.js";
import { badRequest, jsonWithCache, CACHE_IMMUTABLE } from "../lib/response.js";

const books = new Hono<{ Bindings: Env }>();

books.get("/", (c) => {
  const testamentParam = c.req.query("testament");

  // Validate testament parameter
  let testament: "OT" | "NT" | "AP" | undefined;
  if (testamentParam) {
    const upper = testamentParam.toUpperCase();
    if (upper !== "OT" && upper !== "NT" && upper !== "AP") {
      return badRequest(c, "Testament must be OT, NT, or AP");
    }
    testament = upper;
  }

  // Use static data - no database query needed
  const response: BookApiResponse[] = ALL_BOOKS
    .filter((b) => !testament || b.testament === testament)
    .map((b) => ({
      id: b.id,
      name: b.name,
      testament: b.testament,
      chapters: b.chapters,
      aliases: b.aliases,
    }));

  return jsonWithCache(c, response, CACHE_IMMUTABLE);
});

export default books;
