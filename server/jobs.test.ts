import { describe, expect, it } from "vitest";
import { splitScript } from "./jobs";

describe("Burmese script chunking", () => {
  it("keeps sentence punctuation and does not impose a total script limit", () => {
    const input = "ပထမဝါကျ။ ဒုတိယဝါကျ၊ ဆက်လက်ရေးသားပါ။ တတိယဝါကျ!";
    const chunks = splitScript(input, 24);
    expect(chunks.join(" ")).toContain("ပထမဝါကျ။");
    expect(chunks.join(" ")).toContain("တတိယဝါကျ!");
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("splits an overlong sentence into bounded provider-safe pieces", () => {
    const chunks = splitScript("က".repeat(53), 20);
    expect(chunks).toHaveLength(3);
    expect(chunks.every(chunk => chunk.length <= 20)).toBe(true);
    expect(chunks.join("")).toBe("က".repeat(53));
  });
});
