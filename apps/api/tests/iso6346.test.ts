import { describe, expect, it } from "vitest";
import {
  calculateIso6346CheckDigit,
  isValidIso6346ContainerNumber
} from "../src/features/containers/iso6346.ts";

describe("ISO 6346 container numbers", () => {
  it("validates the check digit from the ISO letter values and powers-of-two weights", () => {
    expect(calculateIso6346CheckDigit("CSQU305438")).toBe(3);
    expect(isValidIso6346ContainerNumber("CSQU3054383")).toBe(true);
    expect(isValidIso6346ContainerNumber("MSCU6639870")).toBe(true);
  });

  it("rejects an incorrect check digit, invalid category, or malformed number", () => {
    expect(isValidIso6346ContainerNumber("CSQU3054384")).toBe(false);
    expect(isValidIso6346ContainerNumber("CSQA3054383")).toBe(false);
    expect(isValidIso6346ContainerNumber("CSQU30543A3")).toBe(false);
    expect(isValidIso6346ContainerNumber("CSQU305438")).toBe(false);
  });

  it("handles check-digit remainder ten as zero", () => {
    expect(calculateIso6346CheckDigit("ABCU000007")).toBe(0);
    expect(isValidIso6346ContainerNumber("ABCU0000070")).toBe(true);
  });
});
