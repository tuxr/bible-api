/**
 * Bible Reference Parser
 *
 * Parses human-readable Bible references into structured data.
 * Handles single verses, verse ranges, full chapters, and multi-chapter ranges.
 */

import { findBook, type BookData } from "./books-data.js";

export interface ParsedReference {
  book: BookData;
  startChapter: number;
  startVerse: number | null; // null means whole chapter
  endChapter: number;
  endVerse: number | null; // null means to end of chapter
}

export interface ParseResult {
  success: true;
  reference: ParsedReference;
  normalized: string;
}

export interface ParseError {
  success: false;
  error: string;
}

export type ParseOutcome = ParseResult | ParseError;

// Single-chapter books - when verse is given without chapter, it's chapter 1
const SINGLE_CHAPTER_BOOKS = new Set([
  "OBA", // Obadiah
  "PHM", // Philemon
  "2JN", // 2 John
  "3JN", // 3 John
  "JUD", // Jude
  "LJE", // Letter of Jeremiah
  "S3Y", // Prayer of Azariah
  "SUS", // Susanna
  "BEL", // Bel and the Dragon
  "MAN", // Prayer of Manasseh
  "PS2", // Psalm 151
]);

// Pattern to extract numeric reference from end of string
// Matches: chapter, chapter:verse, chapter:verse-verse, chapter:verse-chapter:verse
const REF_PATTERN = /\s*(\d+)(?::(\d+)(?:\s*[-–—]\s*(\d+)(?::(\d+))?)?)?$/;

/**
 * Parse a Bible reference string into structured data
 *
 * Supported formats:
 * - "John 3:16" - single verse
 * - "Romans 8:28-39" - verse range in single chapter
 * - "Psalm 23" - full chapter
 * - "Genesis 1:1-2:3" - multi-chapter range
 * - "1 Corinthians 13" - numbered books
 * - "Jn 3:16", "Gen 1:1" - abbreviations
 * - "john+3:16" - URL encoded spaces
 */
export function parseReference(input: string): ParseOutcome {
  // Normalize input
  // Note: Only handle + for query string compatibility (where + means space)
  // Don't handle %20 here - URL decoding should happen at the route level
  let ref = input
    .trim()
    .replace(/\+/g, " ") // Query string encoded space
    .replace(/\s+/g, " "); // Collapse multiple spaces

  if (!ref) {
    return { success: false, error: "Empty reference" };
  }

  // Match numeric reference at end of string using module-level pattern
  const match = ref.match(REF_PATTERN);

  if (!match) {
    return { success: false, error: `Could not parse reference: "${input}"` };
  }

  // Extract book name (everything before the numeric part)
  const bookPart = ref.slice(0, match.index).trim();

  if (!bookPart) {
    return { success: false, error: "No book name found" };
  }

  // Find the book
  const book = findBook(bookPart);
  if (!book) {
    return { success: false, error: `Unknown book: "${bookPart}"` };
  }

  // Parse numeric components
  const num1 = parseInt(match[1] ?? "0", 10);
  const num2 = match[2] ? parseInt(match[2], 10) : null;
  const num3 = match[3] ? parseInt(match[3], 10) : null;
  const num4 = match[4] ? parseInt(match[4], 10) : null;

  let startChapter: number;
  let startVerse: number | null;
  let endChapter: number;
  let endVerse: number | null;

  if (num2 === null && num3 === null) {
    // Just one number: either chapter or verse for single-chapter books
    if (SINGLE_CHAPTER_BOOKS.has(book.id)) {
      // Single-chapter book: treat as verse
      startChapter = 1;
      startVerse = num1;
      endChapter = 1;
      endVerse = num1;
    } else {
      // Full chapter
      startChapter = num1;
      startVerse = null;
      endChapter = num1;
      endVerse = null;
    }
  } else if (num2 !== null && num3 === null) {
    // Chapter:verse format (e.g., "3:16")
    startChapter = num1;
    startVerse = num2;
    endChapter = num1;
    endVerse = num2;
  } else if (num2 !== null && num3 !== null && num4 === null) {
    // Chapter:verse-verse OR Chapter:verse-chapter (ambiguous)
    // We assume chapter:verse-verse format (same chapter range)
    // If num3 > num2, it's verse-verse. If num3 < num2, could be chapter range.
    startChapter = num1;
    startVerse = num2;
    endChapter = num1;
    endVerse = num3;
  } else if (num2 !== null && num3 !== null && num4 !== null) {
    // Full multi-chapter range: chapter:verse-chapter:verse
    startChapter = num1;
    startVerse = num2;
    endChapter = num3;
    endVerse = num4;
  } else {
    return { success: false, error: `Invalid reference format: "${input}"` };
  }

  // Verse number validation
  if (startVerse !== null && startVerse < 1) {
    return { success: false, error: "Verse number must be at least 1" };
  }
  if (endVerse !== null && endVerse < 1) {
    return { success: false, error: "Verse number must be at least 1" };
  }

  // Chapter validation
  if (startChapter < 1 || startChapter > book.chapters) {
    return {
      success: false,
      error: `Chapter ${startChapter} out of range for ${book.name} (1-${book.chapters})`,
    };
  }

  if (endChapter < 1 || endChapter > book.chapters) {
    return {
      success: false,
      error: `Chapter ${endChapter} out of range for ${book.name} (1-${book.chapters})`,
    };
  }

  if (endChapter < startChapter) {
    return {
      success: false,
      error: `End chapter (${endChapter}) cannot be before start chapter (${startChapter})`,
    };
  }

  if (startChapter === endChapter && startVerse !== null && endVerse !== null && endVerse < startVerse) {
    return {
      success: false,
      error: `End verse (${endVerse}) cannot be before start verse (${startVerse})`,
    };
  }

  // Build normalized reference string
  const normalized = formatReference(book, startChapter, startVerse, endChapter, endVerse);

  return {
    success: true,
    reference: {
      book,
      startChapter,
      startVerse,
      endChapter,
      endVerse,
    },
    normalized,
  };
}

/**
 * Format a parsed reference back to a readable string
 */
export function formatReference(
  book: BookData,
  startChapter: number,
  startVerse: number | null,
  endChapter: number,
  endVerse: number | null
): string {
  // Handle single-chapter books
  if (SINGLE_CHAPTER_BOOKS.has(book.id)) {
    if (startVerse === endVerse) {
      return `${book.name} ${startVerse}`;
    }
    return `${book.name} ${startVerse}-${endVerse}`;
  }

  // Whole chapter(s)
  if (startVerse === null && endVerse === null) {
    if (startChapter === endChapter) {
      return `${book.name} ${startChapter}`;
    }
    return `${book.name} ${startChapter}-${endChapter}`;
  }

  // Single verse
  if (startChapter === endChapter && startVerse === endVerse) {
    return `${book.name} ${startChapter}:${startVerse}`;
  }

  // Verse range in same chapter
  if (startChapter === endChapter) {
    return `${book.name} ${startChapter}:${startVerse}-${endVerse}`;
  }

  // Multi-chapter range
  return `${book.name} ${startChapter}:${startVerse}-${endChapter}:${endVerse}`;
}

/**
 * Parse multiple references separated by semicolons or commas
 * e.g., "John 3:16; Romans 8:28"
 */
export function parseMultipleReferences(input: string): ParseOutcome[] {
  const refs = input.split(/[;,]/).map((r) => r.trim()).filter((r) => r);
  return refs.map(parseReference);
}
