import { describe, expect, it } from "vitest";
import { matchesQuery } from "./search";

describe("matchesQuery", () => {
  it("busca vazia casa com tudo", () => {
    expect(matchesQuery("", "git status", "nada")).toBe(true);
    expect(matchesQuery("   ", "x")).toBe(true);
  });

  it("não diferencia maiúsculas e olha todos os campos", () => {
    expect(matchesQuery("STATUS", "git status", "")).toBe(true);
    expect(matchesQuery("não existe", "Get-Item", "Não existe o caminho")).toBe(true);
  });

  it("ignora espaços nas pontas e rejeita quando nenhum campo contém", () => {
    expect(matchesQuery("  erro  ", "ls", "erro 404")).toBe(true);
    expect(matchesQuery("erro", "ls", "tudo certo")).toBe(false);
  });
});
