import { describe, expect, it } from "vitest";
import { clipToInput, isClearKey, isPasteKey, pathsToInput, quotePath, toPtyPaste } from "./paste";

const ev = (key: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}) => ({
  key,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
});

describe("isPasteKey", () => {
  it("Ctrl+V e Shift+Insert colam", () => {
    expect(isPasteKey(ev("v", { ctrl: true }))).toBe(true);
    expect(isPasteKey(ev("V", { ctrl: true, shift: true }))).toBe(true);
    expect(isPasteKey(ev("Insert", { shift: true }))).toBe(true);
  });

  it("não pega V sozinho, Ctrl+Alt+V nem outras teclas", () => {
    expect(isPasteKey(ev("v"))).toBe(false);
    expect(isPasteKey(ev("v", { ctrl: true, alt: true }))).toBe(false);
    expect(isPasteKey(ev("c", { ctrl: true }))).toBe(false);
    expect(isPasteKey(ev("Insert"))).toBe(false);
  });
});

describe("isClearKey", () => {
  it("só Ctrl+L sozinho", () => {
    expect(isClearKey(ev("l", { ctrl: true }))).toBe(true);
    expect(isClearKey(ev("L", { ctrl: true }))).toBe(true);
    expect(isClearKey(ev("l", { ctrl: true, shift: true }))).toBe(false);
    expect(isClearKey(ev("l", { ctrl: true, alt: true }))).toBe(false);
    expect(isClearKey(ev("l"))).toBe(false);
  });
});

describe("clipToInput", () => {
  it("texto vira colagem, com bracketed quando o shell pede", () => {
    expect(clipToInput({ kind: "text", value: "ls\nls" }, false)).toBe("ls\rls");
    expect(clipToInput({ kind: "text", value: "ls" }, true)).toBe("\x1b[200~ls\x1b[201~");
  });

  it("imagem vira o caminho, com aspas se tiver espaço, sem bracketed", () => {
    expect(clipToInput({ kind: "image", value: "C:\\Temp\\a.png" }, true)).toBe("C:\\Temp\\a.png");
    expect(clipToInput({ kind: "image", value: "C:\\Meu Temp\\a.png" }, false)).toBe('"C:\\Meu Temp\\a.png"');
  });

  it("vazio ou texto vazio não escreve nada", () => {
    expect(clipToInput({ kind: "empty" }, true)).toBeNull();
    expect(clipToInput({ kind: "text", value: "" }, true)).toBeNull();
  });
});

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
