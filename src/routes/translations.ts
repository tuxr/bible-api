/**
 * Translations route handler
 * GET /v1/translations
 */

import { Hono } from "hono";
import type { Env, TranslationApiResponse } from "../types.js";
import { getTranslations } from "../lib/db.js";
import { serviceUnavailable, jsonWithCache, CACHE_IMMUTABLE } from "../lib/response.js";

const translations = new Hono<{ Bindings: Env }>();

translations.get("/", async (c) => {
  const result = await getTranslations(c.env.DB);
  if (!result.success) {
    return serviceUnavailable(c, result.error);
  }

  const response: TranslationApiResponse[] = result.data.map((t) => ({
    id: t.id,
    name: t.name,
    language: t.language,
    license: t.license,
    description: t.description,
  }));

  return jsonWithCache(c, response, CACHE_IMMUTABLE);
});

export default translations;
