/**
 * Verses route handler
 * GET /v1/verses/:reference
 */

import { Hono } from "hono";
import type { Env, VersesApiResponse } from "../types.js";
import { parseReference } from "../lib/parser.js";
import { getVerses, getTranslation, getBookName } from "../lib/db.js";
import { badRequest, notFound } from "../lib/response.js";

const verses = new Hono<{ Bindings: Env }>();

verses.get("/:reference", async (c) => {
  const reference = c.req.param("reference");
  const translationId = (c.req.query("translation") ?? "web").toLowerCase();

  // Parse the reference
  const parsed = parseReference(decodeURIComponent(reference));
  if (!parsed.success) {
    return badRequest(c, parsed.error);
  }

  // Verify translation exists
  const translation = await getTranslation(c.env.DB, translationId);
  if (!translation) {
    return notFound(c, `Translation not found: ${translationId}`);
  }

  // Fetch verses
  const verseRows = await getVerses(c.env.DB, parsed.reference, translationId);

  if (verseRows.length === 0) {
    return notFound(c, `No verses found for: ${parsed.normalized}`);
  }

  // Build response
  const response: VersesApiResponse = {
    reference: parsed.normalized,
    translation: {
      id: translation.id,
      name: translation.name,
    },
    verses: verseRows.map((v) => ({
      book: v.book_id,
      book_name: getBookName(v.book_id),
      chapter: v.chapter,
      verse: v.verse,
      text: v.text,
    })),
    text: verseRows.map((v) => v.text).join(" "),
  };

  return c.json(response);
});

export default verses;
