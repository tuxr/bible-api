/**
 * Verse layout, as stored in `verses.layout` and served under `layout=1` on /v1/chapters.
 *
 * The parsers (`usfx-parse.ts`, `usfm-parse.ts`) write it; the shape is theirs (`LayoutItem`).
 * Its `text` items partition the verse text exactly, as `segments` do, and a layout is only
 * served alongside the text it partitions: a stored layout that no longer joins to the stored
 * text (a revision adopted without re-running db:backfill:layout) is left out rather than
 * served wrong.
 */

import type { LayoutBlock, LayoutItem } from "./usfx-parse.js";

export type { LayoutBlock, LayoutItem };

const BLOCKS: ReadonlySet<string> = new Set<LayoutBlock>(["p", "m", "pi", "q1", "q2", "q3", "qr", "pc", "li1", "li2"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLayoutItem(value: unknown): value is LayoutItem {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "text":
      return typeof value.text === "string" && (value.block === undefined || (typeof value.block === "string" && BLOCKS.has(value.block)));
    case "heading":
      return typeof value.text === "string" && (value.level === 1 || value.level === 2 || value.level === 3);
    case "title":
    case "speaker":
      return typeof value.text === "string";
    case "break":
      return true;
    default:
      return false;
  }
}

/** The text a layout's `text` items join to: the verse text, when the layout is current. */
export function layoutText(layout: readonly LayoutItem[]): string {
  return layout.map((item) => (item.type === "text" ? item.text : "")).join("");
}

/**
 * The stored layout, or `undefined` when there is none, it is malformed, or its text items do
 * not join to `text` exactly.
 */
export function parseStoredLayout(raw: string | null | undefined, text: string): LayoutItem[] | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isLayoutItem)) return undefined;
  return layoutText(parsed) === text ? parsed : undefined;
}
