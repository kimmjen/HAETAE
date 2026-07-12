import { describe, expect, it } from "vitest";
import { rowsToCsv } from "./export";

describe("rowsToCsv", () => {
  it("returns empty string on empty input", () => {
    expect(rowsToCsv([])).toBe("");
  });

  it("emits header row + value rows in key order", () => {
    expect(
      rowsToCsv([
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ]),
    ).toBe("a,b\n1,2\n3,4");
  });

  it("escapes commas, quotes, and newlines per RFC4180", () => {
    expect(
      rowsToCsv([{ name: 'foo,"bar"\nbaz', count: 1 }]),
    ).toBe('name,count\n"foo,""bar""\nbaz",1');
  });

  it("nullish cells become empty strings", () => {
    expect(rowsToCsv([{ a: null, b: undefined, c: 0 }])).toBe("a,b,c\n,,0");
  });

  it("collects keys from every row (sparse data)", () => {
    expect(
      rowsToCsv([
        { a: 1 },
        { b: 2 },
      ]),
    ).toBe("a,b\n1,\n,2");
  });
});
