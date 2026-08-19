/** TCGNT integration tests — Greek FTS, NT-only boundaries, and response shape. */

import { beforeAll, describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase } from "../helpers/test-db.js";
import { parseJson } from "../helpers/route-test-helpers.js";
import type { SearchApiResponse, VersesApiResponse } from "../../types.js";

describe("TCGNT integration (SELF.fetch)", () => {
  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  it("returns John 3:16 in polytonic Greek with the standard verse keys", async () => {
    const res = await SELF.fetch(
      "http://localhost/v1/verses/John%203:16?translation=tcgnt"
    );
    expect(res.status).toBe(200);

    const body = await parseJson<VersesApiResponse>(res);
    expect(body.translation).toEqual({
      id: "tcgnt",
      name: "Text-Critical Greek New Testament",
      language: "grc",
    });
    expect(body.verses[0]).toMatchObject({
      book: "JHN",
      book_name: "John",
      chapter: 3,
      verse: 16,
    });
    expect(Object.keys(body.verses[0]!).sort()).toEqual(
      ["book", "book_name", "chapter", "text", "verse"].sort()
    );
    expect(body.text).toContain("ἠγάπησεν");
    expect(body.text).not.toContain("<wj>");
  });

  it("returns 404 for Old Testament verse and chapter requests", async () => {
    const verseRes = await SELF.fetch(
      "http://localhost/v1/verses/Genesis%201:1?translation=tcgnt"
    );
    expect(verseRes.status).toBe(404);
    expect(await verseRes.json()).toMatchObject({
      error: expect.stringContaining("No verses found"),
    });

    const chapterRes = await SELF.fetch(
      "http://localhost/v1/chapters/Genesis/1?translation=tcgnt"
    );
    expect(chapterRes.status).toBe(404);
  });

  it("finds the same fixture row with pointed and unpointed Greek queries", async () => {
    const [pointedRes, unpointedRes] = await Promise.all([
      SELF.fetch("http://localhost/v1/search?q=%CE%BA%CF%8C%CF%83%CE%BC%CE%BF%CE%BD&translation=tcgnt"),
      SELF.fetch("http://localhost/v1/search?q=%CE%BA%CE%BF%CF%83%CE%BC%CE%BF%CE%BD&translation=tcgnt"),
    ]);
    expect(pointedRes.status).toBe(200);
    expect(unpointedRes.status).toBe(200);

    const pointed = await parseJson<SearchApiResponse>(pointedRes);
    const unpointed = await parseJson<SearchApiResponse>(unpointedRes);
    expect(pointed.translation).toBe("tcgnt");
    expect(unpointed.translation).toBe("tcgnt");
    expect(pointed.results).toHaveLength(1);
    expect(unpointed.results).toHaveLength(1);
    expect(pointed.results[0]).toMatchObject({ book: "JHN", chapter: 3, verse: 16 });
    expect(unpointed.results[0]).toMatchObject({ book: "JHN", chapter: 3, verse: 16 });
  });

  it("returns zero results for an OT testament filter", async () => {
    const res = await SELF.fetch(
      "http://localhost/v1/search?q=%CE%BA%CF%8C%CF%83%CE%BC%CE%BF%CE%BD&translation=tcgnt&testament=OT"
    );
    expect(res.status).toBe(200);
    const body = await parseJson<SearchApiResponse>(res);
    expect(body.total).toBe(0);
  });

  it("returns the deterministic TCGNT fixture row from random", async () => {
    const res = await SELF.fetch("http://localhost/v1/random?translation=tcgnt");
    expect(res.status).toBe(200);
    const body = await parseJson<VersesApiResponse>(res);
    expect(body.translation).toEqual({
      id: "tcgnt",
      name: "Text-Critical Greek New Testament",
      language: "grc",
    });
    expect(body.reference).toBe("John 3:16");
    expect(body.text).toContain("κόσμον");
  });

  it("keeps default WEB John 3:16 English and its verse object shape", async () => {
    const res = await SELF.fetch("http://localhost/v1/verses/John%203:16");
    expect(res.status).toBe(200);
    const body = await parseJson<VersesApiResponse>(res);
    expect(body.translation).toEqual({
      id: "web",
      name: "World English Bible",
      language: "en",
    });
    expect(body.text).toContain("God so loved");
    expect(Object.keys(body.verses[0]!).sort()).toEqual(
      ["book", "book_name", "chapter", "text", "verse"].sort()
    );
  });
});
