/** Greek text utilities for search indexing and query normalization. */

const GREEK_LETTER = /[\u0370-\u03FF\u1F00-\u1FFF]/;

/** Detect Greek script characters in a string. */
export function containsGreek(text: string): boolean {
  return GREEK_LETTER.test(text);
}

/** Strip polytonic marks, lowercase, and fold final sigma for FTS matching. */
export function stripGreekDiacritics(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/ς/g, "σ")
    .replace(/Ϲ/g, "Σ")
    .toLocaleLowerCase("el");
}
