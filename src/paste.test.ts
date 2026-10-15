import { describe, expect, it } from "vitest";
import { pathsToInput, quotePath, toPtyPaste } from "./paste";

describe("quotePath", () => {
  it("deixa caminho simples sem aspas", () => {
    expect(quotePath("C:\\Users\\Sthev\\foto.png")).toBe("C:\\Users\\Sthev\\foto.png");
  });

  it("põe aspas quando há espaço", () => {
    expect(quotePath("C:\\Minhas Fotos\\a.png")).toBe('"C:\\Minhas Fotos\\a.png"');
  });

  it("escapa aspas dentro do caminho", () => {
    expect(quotePath('a"b c')).toBe('"a\\"b c"');
  });
});

describe("pathsToInput", () => {
  it("junta vários caminhos com espaço e sem Enter", () => {
    expect(pathsToInput(["a.png", "b c.png"])).toBe('a.png "b c.png"');
  });
});

describe("toPtyPaste", () => {
  it("troca quebra de linha por CR", () => {
    expect(toPtyPaste("linha1\nlinha2\r\nlinha3", false)).toBe("linha1\rlinha2\rlinha3");
  });

  it("envolve em bracketed paste quando o shell pediu", () => {
    expect(toPtyPaste("ls", true)).toBe("\x1b[200~ls\x1b[201~");
  });

  it("não envolve quando o shell não pediu", () => {
    expect(toPtyPaste("ls", false)).toBe("ls");
  });
});
