import { describe, expect, it } from "vitest";
import { CsvParseError, parseCsv } from "../src/lib/csv.ts";

describe("CSV parsing", () => {
  it("parses quoted fields, escaped quotes, and embedded line breaks", () => {
    expect(parseCsv('a,b\r\n"one,two","a""b"\r\n"line one\nline two",value\r\n')).toEqual([
      ["a", "b"],
      ["one,two", 'a"b'],
      ["line one\nline two", "value"]
    ]);
  });

  it.each([
    ['"unclosed'],
    ['value"quote,value'],
    ['"quoted"value,next']
  ])("rejects malformed CSV %s", (contents) => {
    expect(() => parseCsv(contents)).toThrow(CsvParseError);
  });
});
