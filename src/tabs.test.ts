import { describe, expect, it } from "vitest";
import { insertTab } from "./tabs";

const tab = (id: number) => ({ id });
const ids = (tabs: Array<{ id: number }>) => tabs.map((t) => t.id);

describe("insertTab", () => {
  const base = [tab(1), tab(2), tab(3)];

  it("no fim da lista, quando a configuração é 'end'", () => {
    expect(ids(insertTab(base, tab(4), 1, "end"))).toEqual([1, 2, 3, 4]);
  });

  it("logo depois da aba ativa, quando é 'afterCurrent'", () => {
    expect(ids(insertTab(base, tab(4), 1, "afterCurrent"))).toEqual([1, 4, 2, 3]);
    expect(ids(insertTab(base, tab(4), 2, "afterCurrent"))).toEqual([1, 2, 4, 3]);
  });

  it("depois da última aba é o mesmo que no fim", () => {
    expect(ids(insertTab(base, tab(4), 3, "afterCurrent"))).toEqual([1, 2, 3, 4]);
  });

  it("aba ativa que não existe cai no fim", () => {
    expect(ids(insertTab(base, tab(4), 99, "afterCurrent"))).toEqual([1, 2, 3, 4]);
  });

  it("não altera a lista original", () => {
    insertTab(base, tab(4), 1, "afterCurrent");
    expect(ids(base)).toEqual([1, 2, 3]);
  });
});
