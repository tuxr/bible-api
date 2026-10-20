/** Verse layout (`layout=1` on chapters), against the seeded test D1. */

import { beforeAll, describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
import { setupTestDatabase, webGenesis11Layout } from "../helpers/test-db.js";
import { parseJson } from "../helpers/route-test-helpers.js";
import type { ChapterApiResponse } from "../../types.js";

beforeAll(async () => {
  await setupTestDatabase(env.DB);
});

describe("layout=1 on /v1/chapters", () => {
  it("adds the stored layout to the verses that have one", async () => {
    const res = await SELF.fetch("http://localhost/v1/chapters/Genesis/1?translation=web&layout=1");
    expect(res.status).toBe(200);
    const body = await parseJson<ChapterApiResponse>(res);
    expect(body.verses[0]).toEqual({
      verse: 1,
      text: "In the beginning God created the heaven and the earth.",
      layout: webGenesis11Layout,
    });
    // Inside the paragraph: no layout key at all.
    expect(Object.keys(body.verses[1]!)).toEqual(["verse", "text"]);
  });

  it("combines with segments and words", async () => {
    const res = await SELF.fetch("http://localhost/v1/chapters/Genesis/1?translation=web&layout=1&segments=1&words=1");
    expect(res.status).toBe(200);
    const body = await parseJson<ChapterApiResponse>(res);
    expect(body.verses[0]!.layout).toEqual(webGenesis11Layout);
  });

  it("keeps the payload unchanged without layout=1", async () => {
    const res = await SELF.fetch("http://localhost/v1/chapters/Genesis/1?translation=web");
    const body = await parseJson<ChapterApiResponse>(res);
    expect(Object.keys(body.verses[0]!)).toEqual(["verse", "text"]);
  });

  it("rejects an invalid flag", async () => {
    const res = await SELF.fetch("http://localhost/v1/chapters/Genesis/1?translation=web&layout=maybe");
    expect(res.status).toBe(400);
  });
});
