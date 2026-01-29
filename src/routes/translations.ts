/**
 * Translations route handler
 * GET /v1/translations
 */

import { Hono } from "hono";
import type { Env, TranslationApiResponse } from "../types.js";
import { getTranslations } from "../lib/db.js";

const translations = new Hono<{ Bindings: Env }>();

translations.get("/", async (c) => {
  const translationRows = await getTranslations(c.env.DB);

  const response: TranslationApiResponse[] = translationRows.map((t) => ({
    id: t.id,
    name: t.name,
    language: t.language,
    license: t.license,
    description: t.description,
  }));

  return c.json(response);
});

export default translations;
