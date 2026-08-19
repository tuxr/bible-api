import { describe, expect, it } from "vitest";
import { parseSegmentsFlag, parseStoredSegments } from "../lib/segments.js";

describe("segments helpers", () => {
  it("treats missing and empty as off and accepts strict opt-in values", () => {
    expect(parseSegmentsFlag(undefined)).toBe("off");
    expect(parseSegmentsFlag("")).toBe("off");
    for (const value of ["1", "true", "TRUE", "yes", "Yes"]) expect(parseSegmentsFlag(value)).toBe("on");
    for (const value of ["0", "false", "2", "foo", "1 "]) expect(parseSegmentsFlag(value)).toBe("invalid");
  });

  it("omits malformed stored JSON", () => {
    expect(parseStoredSegments("not-json")).toBeUndefined();
    expect(parseStoredSegments('[{"text": 1}]')).toBeUndefined();
  });
});
