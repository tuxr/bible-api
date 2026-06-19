/**
 * Route-level tests for GET /v1/books
 */

import { describe, it, expect } from "vitest";
import { createRouteEnv, parseJson } from "../helpers/route-test-helpers.js";
import type { BookApiResponse } from "../../types.js";
import books from "../../routes/books.js";

describe("GET /v1/books route", () => {
  it("returns all books", async () => {
    const res = await books.request("/", {}, createRouteEnv());

    expect(res.status).toBe(200);
    const body = await parseJson<BookApiResponse[]>(res);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(60);
    expect(body[0]).toMatchObject({
      id: "GEN",
      name: "Genesis",
      testament: "OT",
      chapters: 50,
      aliases: expect.any(Array),
    });
  });

  it("filters books by testament", async () => {
    const res = await books.request("/?testament=NT", {}, createRouteEnv());

    expect(res.status).toBe(200);
    const body = await parseJson<BookApiResponse[]>(res);
    expect(body.length).toBe(27);
    expect(body.every((book) => book.testament === "NT")).toBe(true);
  });

  it("returns 400 for invalid testament filter", async () => {
    const res = await books.request("/?testament=invalid", {}, createRouteEnv());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Testament must be OT, NT, or AP",
    });
  });
});