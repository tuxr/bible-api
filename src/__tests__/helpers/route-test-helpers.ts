/**
 * Shared helpers for route-level tests with mocked bindings.
 */

import { vi } from "vitest";
import type { Env } from "../../types.js";

export function createMockLimiter(success: boolean) {
  return {
    limit: vi.fn().mockResolvedValue({ success }),
  } satisfies RateLimit;
}

export function createRouteEnv(overrides?: Partial<Env>): Env {
  return {
    DB: {} as D1Database,
    SEARCH_RATE_LIMITER: createMockLimiter(true),
    RANDOM_RATE_LIMITER: createMockLimiter(true),
    ...overrides,
  };
}

export async function parseJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

export const sampleTranslation = {
  id: "web",
  name: "World English Bible",
  language: "en",
  license: "Public Domain",
  description: null,
};