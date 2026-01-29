/**
 * Books route handler
 * GET /v1/books
 */

import { Hono } from "hono";
import type { Env, BookApiResponse } from "../types.js";
import { getBooks } from "../lib/db.js";
import { badRequest } from "../lib/response.js";

const books = new Hono<{ Bindings: Env }>();

books.get("/", async (c) => {
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

  const bookRows = await getBooks(c.env.DB, testament);

  const response: BookApiResponse[] = bookRows.map((b) => ({
    id: b.id,
    name: b.name,
    testament: b.testament,
    chapters: b.chapters,
    aliases: JSON.parse(b.aliases) as string[],
  }));

  return c.json(response);
});

export default books;
