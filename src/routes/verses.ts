/**
 * Verses route handler
 * GET /v1/verses/:reference
 */

import { Hono } from "hono";
import type { Env, VersesApiResponse } from "../types.js";
import { parseReference, parseMultipleReferences } from "../lib/parser.js";
import { getVerses, getVersesForMultipleReferences, getTranslation, getBookName } from "../lib/db.js";
import { badRequest, notFound, serviceUnavailable, jsonWithCache, CACHE_IMMUTABLE } from "../lib/response.js";

const verses = new Hono<{ Bindings: Env }>();

verses.get("/:reference", async (c) => {
  const reference = decodeURIComponent(c.req.param("reference"));
  const translationId = (c.req.query("translation") ?? "web").toLowerCase();

  // Verify translation exists (shared by both paths)
  const translationResult = await getTranslation(c.env.DB, translationId);
  if (!translationResult.success) {
    return serviceUnavailable(c, translationResult.error);
  }
  if (!translationResult.data) {
    return notFound(c, `Translation not found: ${translationId}`);
  }
  const translation = translationResult.data;

  // Comma-separated references: fetch via single batched UNION ALL query
  if (reference.includes(",")) {
    const parsed = parseMultipleReferences(reference);
    if (!parsed.success) {
      return badRequest(c, parsed.error);
    }

    const versesResult = await getVersesForMultipleReferences(
      c.env.DB,
      parsed.references,
      translationId
    );
    if (!versesResult.success) {
      return serviceUnavailable(c, versesResult.error);
    }
    const allVerseRows = versesResult.data;

    if (allVerseRows.length === 0) {
      return notFound(c, `No verses found for: ${parsed.normalized}`);
    }

    const response: VersesApiResponse = {
      reference: parsed.normalized,
      translation: {
        id: translation.id,
        name: translation.name,
        language: translation.language,
      },
      verses: allVerseRows.map((v) => ({
        book: v.book_id,
        book_name: getBookName(v.book_id),
        chapter: v.chapter,
        verse: v.verse,
        text: v.text,
      })),
      text: allVerseRows.map((v) => v.text).join(" "),
    };

    return jsonWithCache(c, response, CACHE_IMMUTABLE);
  }

  // Single reference path (unchanged)
  const parsed = parseReference(reference);
  if (!parsed.success) {
    return badRequest(c, parsed.error);
  }

  // Fetch verses
  const versesResult = await getVerses(c.env.DB, parsed.reference, translationId);
  if (!versesResult.success) {
    return serviceUnavailable(c, versesResult.error);
  }
  const verseRows = versesResult.data;

  if (verseRows.length === 0) {
    return notFound(c, `No verses found for: ${parsed.normalized}`);
  }

  // Build response
  const response: VersesApiResponse = {
    reference: parsed.normalized,
    translation: {
      id: translation.id,
      name: translation.name,
      language: translation.language,
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

  return jsonWithCache(c, response, CACHE_IMMUTABLE);
});

export default verses;
