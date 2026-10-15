import { describe, expect, it } from "vitest";
import { isClearCommand } from "./clear";

describe("isClearCommand", () => {
  it("reconhece clear, cls e clear-host", () => {
    expect(isClearCommand("clear")).toBe(true);
    expect(isClearCommand("cls")).toBe(true);
    expect(isClearCommand("Clear-Host")).toBe(true);
    expect(isClearCommand("  CLS  ")).toBe(true);
  });

  it("não pega comando que só começa com clear ou tem outra coisa junto", () => {
    expect(isClearCommand("cls && ls")).toBe(false);
    expect(isClearCommand("clear foo")).toBe(false);
    expect(isClearCommand("ls")).toBe(false);
    expect(isClearCommand("")).toBe(false);
  });
});
