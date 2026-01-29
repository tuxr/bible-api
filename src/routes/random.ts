/**
 * Random verse route handler
 * GET /v1/random
 */

import { Hono } from "hono";
import type { Env, VersesApiResponse } from "../types.js";
import { getRandomVerse, getTranslation, getBookName } from "../lib/db.js";
import { notFound } from "../lib/response.js";

const random = new Hono<{ Bindings: Env }>();

random.get("/", async (c) => {
  const translationId = c.req.query("translation") ?? "web";

  // Verify translation exists
  const translation = await getTranslation(c.env.DB, translationId);
  if (!translation) {
    return notFound(c, `Translation not found: ${translationId}`);
  }

  // Get random verse
  const verse = await getRandomVerse(c.env.DB, translationId);

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

  return c.json(response);
});

export default random;
