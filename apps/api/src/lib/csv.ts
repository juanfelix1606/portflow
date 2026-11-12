import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Response } from "express";

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

export function parseCsv(contents: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let field = "";
  let insideQuotes = false;
  let afterQuote = false;

  function finishField() {
    fields.push(field);
    field = "";
    afterQuote = false;
  }

  function finishRecord() {
    finishField();
    records.push(fields);
    fields = [];
  }

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];

    if (insideQuotes) {
      if (character === '"') {
        if (contents[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          insideQuotes = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new CsvParseError("A quoted CSV value must be followed by a comma or line break.");
    }

    if (character === '"') {
      if (field.length !== 0 || afterQuote) {
        throw new CsvParseError("CSV quotes may only wrap an entire field.");
      }
      insideQuotes = true;
    } else if (character === ",") {
      finishField();
    } else if (character === "\r" || character === "\n") {
      finishRecord();
      if (character === "\r" && contents[index + 1] === "\n") {
        index += 1;
      }
    } else {
      field += character;
    }
  }

  if (insideQuotes) {
    throw new CsvParseError("A quoted CSV value was not closed.");
  }
  if (field.length > 0 || fields.length > 0 || afterQuote) {
    finishRecord();
  }

  return records;
}

function escapeCsvCell(value: string): string {
  const safeValue = /^[\u0000-\u0020]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function formatCsvRow(values: readonly string[]): string {
  return `${values.map(escapeCsvCell).join(",")}\r\n`;
}

export async function sendCsv(
  response: Response,
  filename: string,
  headers: readonly string[],
  rows: AsyncIterable<readonly string[]>
): Promise<void> {
  response.status(200);
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  response.setHeader("Cache-Control", "no-store");

  async function* csvRows(): AsyncGenerator<string> {
    yield formatCsvRow(headers);
    for await (const row of rows) {
      yield formatCsvRow(row);
    }
  }

  await pipeline(Readable.from(csvRows()), response);
}
