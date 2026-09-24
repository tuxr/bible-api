/**
 * Lexicon route handler
 * GET /v1/lexicon/:id        — one entry ("G1841"), or 404
 * GET /v1/lexicon?ids=a,b,…  — up to 200 entries as { entries, attribution }
 *
 * Entries have the same shape as the `lexicon` map on `/v1/chapters/...&words=1`.
 */

import { Hono } from "hono";
import type { Env, LexiconApiResponse } from "../types.js";
import { getLexiconEntries } from "../lib/db.js";
import { badRequest, notFound, serviceUnavailable, jsonWithCache, CACHE_IMMUTABLE } from "../lib/response.js";
import { MAX_LEXICON_IDS, normalizeLexiconId, toLexiconMap } from "../lib/words.js";
import { lexiconAttribution } from "../lib/word-sources.js";

const lexicon = new Hono<{ Bindings: Env }>();

lexicon.get("/", async (c) => {
  const raw = c.req.query("ids");
  if (!raw?.trim()) {
    return badRequest(c, "Missing ids parameter (e.g. ?ids=G1841,H7225)");
  }
  const requested = raw.split(",").map((id) => id.trim()).filter(Boolean);
  if (requested.length > MAX_LEXICON_IDS) {
    return badRequest(c, `Too many ids: ${requested.length} (maximum ${MAX_LEXICON_IDS})`);
  }
  const ids: string[] = [];
  for (const id of requested) {
    const normalized = normalizeLexiconId(id);
    if (!normalized) return badRequest(c, `Invalid lexicon id: ${id}`);
    if (!ids.includes(normalized)) ids.push(normalized);
  }

  const result = await getLexiconEntries(c.env.DB, ids);
  if (!result.success) {
    return serviceUnavailable(c, result.error);
  }
  const entries = toLexiconMap(ids, result.data);
  const response: LexiconApiResponse = { entries, attribution: lexiconAttribution(Object.keys(entries)) };
  return jsonWithCache(c, response, CACHE_IMMUTABLE);
});

lexicon.get("/:id", async (c) => {
  const idParam = c.req.param("id");
  const id = normalizeLexiconId(idParam);
  if (!id) {
    return badRequest(c, `Invalid lexicon id: ${idParam}`);
  }

  const result = await getLexiconEntries(c.env.DB, [id]);
  if (!result.success) {
    return serviceUnavailable(c, result.error);
  }
  const entry = toLexiconMap([id], result.data)[id];
  if (!entry) {
    return notFound(c, `Lexicon entry not found: ${id}`);
  }
  return jsonWithCache(c, { ...entry, attribution: lexiconAttribution([id]) }, CACHE_IMMUTABLE);
});

export default lexicon;
