/**
 * Hebrew and Greek text utilities for search indexing and query normalization.
 */

import { containsGreek, stripGreekDiacritics } from "./greek.js";

/** Unicode range for Hebrew niqqud (vowel points) and cantillation marks. */
const HEBREW_DIACRITICS = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;

/** Detect Hebrew script characters in a string. */
export function containsHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

/** Strip niqqud and cantillation marks for consonantal (unpointed) matching. */
export function stripHebrewDiacritics(text: string): string {
  return text.replace(HEBREW_DIACRITICS, "");
}

/**
 * Build the plain-text value stored in verses.text_plain for FTS indexing.
 * English translations use the display text; WLC stores unpointed Hebrew and
 * TCGNT stores folded Greek.
 */
export function toSearchPlainText(translationId: string, text: string): string {
  if (translationId === "wlc") {
    return stripHebrewDiacritics(text);
  }
  if (translationId === "tcgnt") {
    return stripGreekDiacritics(text);
  }
  return text;
}

/**
 * Normalize a user search query for FTS matching.
 * Strips diacritics when the query contains Hebrew or Greek characters.
 */
export function normalizeSearchQuery(query: string): string {
  let trimmed = query.trim();
  if (containsHebrew(trimmed)) {
    trimmed = stripHebrewDiacritics(trimmed);
  }
  if (containsGreek(trimmed)) {
    trimmed = stripGreekDiacritics(trimmed);
  }
  return trimmed;
}