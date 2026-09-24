/** Word tags (`words=1` on chapters) and the lexicon endpoints, against the seeded test D1. */

import { beforeAll, describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase } from "../helpers/test-db.js";
import { parseJson } from "../helpers/route-test-helpers.js";
import { tokenizeVerse, normalizeWord } from "../../lib/word-tagging.js";
import type { ChapterApiResponse, LexiconApiResponse, LexiconEntry } from "../../types.js";

const nfc = (value: string | undefined) => value?.normalize("NFC");

beforeAll(async () => {
  await setupTestDatabase(env.DB);
});

describe("words=1 on /v1/chapters", () => {
  it("adds words, the chapter's lexicon entries and attribution for tcgnt", async () => {
    const res = await SELF.fetch("http://localhost/v1/chapters/John/3?translation=tcgnt&words=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=86400");

    const body = await parseJson<ChapterApiResponse>(res);
    const verse = body.verses[0]!;
    expect(verse.words).toHaveLength(tokenizeVerse(verse.text).length);
    verse.words!.forEach((word, i) => expect(normalizeWord(word.surface)).toBe(normalizeWord(tokenizeVerse(verse.text)[i]!)));
    expect({ ...verse.words![2], lemma: nfc(verse.words![2]!.lemma) }).toEqual({
      surface: "ἠγάπησεν", lemma: nfc("ἀγαπάω"), strong: "G25", morph: "V-AAI-3S", gloss: "loved",
    });

    // Only entries this chapter points at, and only those that exist.
    expect(Object.keys(body.lexicon!).sort()).toEqual(["G2316", "G25", "G2889"]);
    expect(body.lexicon!.G25).toMatchObject({ strong: "G25", language: "grc", pronunciation: "ag-ap-AH-o" });
    expect(nfc(body.lexicon!.G25!.lemma)).toBe(nfc("ἀγαπάω"));
    expect(body.attribution!.map((a) => a.id)).toContain("stepbible-tagnt");
    expect(body.attribution!.every((a) => a.name && a.license && a.url)).toBe(true);
  });

  it("returns Hebrew words with prefix parts", async () => {
    const res = await SELF.fetch("http://localhost/v1/chapters/Genesis/1?translation=wlc&words=1");
    expect(res.status).toBe(200);
    const body = await parseJson<ChapterApiResponse>(res);
    const first = body.verses[0]!.words![0]!;
    expect(nfc(first.surface)).toBe(nfc("בְּרֵאשִׁ֖ית"));
    expect(first).toMatchObject({ strong: "H7225", morph: "HR/Ncfsa" });
    expect(first.parts!.map((part) => [nfc(part.surface), part.strong])).toEqual([[nfc("בְּ"), "H9003"], [nfc("רֵאשִׁ֖ית"), "H7225"]]);
    // Verse 2 has no tags in the fixture: it keeps the normal shape.
    expect(Object.keys(body.verses[1]!)).toEqual(["verse", "text"]);
    expect(body.attribution!.map((a) => a.id)).toContain("oshb-morphhb");
  });

  it("keeps the payload unchanged without words=1", async () => {
    const res = await SELF.fetch("http://localhost/v1/chapters/John/3?translation=tcgnt");
    const body = await parseJson<Record<string, unknown> & ChapterApiResponse>(res);
    expect(Object.keys(body)).toEqual(["book", "chapter", "translation", "verses", "verse_count", "navigation"]);
    expect(Object.keys(body.verses[0]!)).toEqual(["verse", "text"]);
  });

  it("returns the normal payload for an untagged translation", async () => {
    const res = await SELF.fetch("http://localhost/v1/chapters/Genesis/1?translation=web&words=1");
    expect(res.status).toBe(200);
    const body = await parseJson<Record<string, unknown> & ChapterApiResponse>(res);
    expect(body.lexicon).toBeUndefined();
    expect(body.attribution).toBeUndefined();
    expect(body.verses.every((verse) => verse.words === undefined)).toBe(true);
  });

  it("rejects an invalid words flag", async () => {
    const res = await SELF.fetch("http://localhost/v1/chapters/John/3?translation=tcgnt&words=maybe");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid words flag" });
  });

  it("does not expose words on /v1/verses", async () => {
    const res = await SELF.fetch("http://localhost/v1/verses/John%203:16?translation=tcgnt&words=1");
    const body = await parseJson<{ verses: Array<Record<string, unknown>> }>(res);
    expect(Object.keys(body.verses[0]!).sort()).toEqual(["book", "book_name", "chapter", "text", "verse"]);
  });
});

describe("/v1/lexicon", () => {
  it("returns one entry with attribution", async () => {
    const res = await SELF.fetch("http://localhost/v1/lexicon/G1841");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=86400");
    const body = await parseJson<LexiconEntry & { attribution: Array<{ id: string }> }>(res);
    expect(nfc(body.lemma)).toBe(nfc("ἔξοδος"));
    expect(body).toMatchObject({
      strong: "G1841",
      language: "grc",
      transliteration: "exodos",
      pronunciation: "EX-od-os",
      partOfSpeech: "noun, feminine",
      occurrences: 3,
    });
    expect(body.attribution.map((a) => a.id)).toEqual(["stepbible-tbesg", "strongs-greek"]);
  });

  it("normalizes the id", async () => {
    const res = await SELF.fetch("http://localhost/v1/lexicon/g01841");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ strong: "G1841" });
  });

  it("returns 404 for a missing entry and 400 for a malformed id", async () => {
    expect((await SELF.fetch("http://localhost/v1/lexicon/G9999")).status).toBe(404);
    expect((await SELF.fetch("http://localhost/v1/lexicon/logos")).status).toBe(400);
  });

  it("returns several entries, skipping unknown ids", async () => {
    const res = await SELF.fetch("http://localhost/v1/lexicon?ids=G1841,h7225,G9999,G1841");
    expect(res.status).toBe(200);
    const body = await parseJson<LexiconApiResponse>(res);
    expect(Object.keys(body.entries)).toEqual(["G1841", "H7225"]);
    expect(body.attribution.map((a) => a.id)).toEqual(["stepbible-tbesg", "strongs-greek", "stepbible-tbesh", "strongs-hebrew"]);
  });

  it("caps the number of ids and requires the parameter", async () => {
    const tooMany = Array.from({ length: 201 }, (_, i) => `G${i + 1}`).join(",");
    expect((await SELF.fetch(`http://localhost/v1/lexicon?ids=${tooMany}`)).status).toBe(400);
    expect((await SELF.fetch("http://localhost/v1/lexicon")).status).toBe(400);
    expect((await SELF.fetch("http://localhost/v1/lexicon?ids=G1,nope")).status).toBe(400);
  });
});

describe("FTS update trigger", () => {
  const search = async (q: string) =>
    parseJson<{ total: number }>(await SELF.fetch(`http://localhost/v1/search?q=${q}&translation=web`));

  it("ignores words writes but re-indexes text_plain changes", async () => {
    await env.DB.prepare("UPDATE verses SET words = '[]' WHERE translation_id = 'web' AND book_id = 'EXO'").run();
    expect((await search("names")).total).toBe(1);

    await env.DB.prepare(
      "UPDATE verses SET text = 'Now these are the tribes of Israel.', text_plain = 'Now these are the tribes of Israel.' WHERE translation_id = 'web' AND book_id = 'EXO'"
    ).run();
    expect((await search("names")).total).toBe(0);
    expect((await search("tribes")).total).toBe(1);
  });
});
