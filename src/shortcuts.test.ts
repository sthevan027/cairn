import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  DEFAULT_SHORTCUTS,
  comboFromEvent,
  conflictFor,
  matches,
  normalizeCombo,
  normalizeShortcuts,
} from "./shortcuts";

const ev = (key: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}) => ({
  key,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
});

describe("comboFromEvent", () => {
  it("monta na ordem Ctrl, Alt, Shift, tecla", () => {
    expect(comboFromEvent(ev("t", { ctrl: true, shift: true }))).toBe("Ctrl+Shift+T");
    expect(comboFromEvent(ev("x", { ctrl: true, alt: true, shift: true }))).toBe("Ctrl+Alt+Shift+X");
  });

  it("ignora tecla que é só modificador", () => {
    expect(comboFromEvent(ev("Control", { ctrl: true }))).toBeNull();
    expect(comboFromEvent(ev("Shift", { shift: true }))).toBeNull();
  });

  it("nomeia espaço e teclas especiais", () => {
    expect(comboFromEvent(ev(" ", { ctrl: true }))).toBe("Ctrl+Space");
    expect(comboFromEvent(ev("Tab", { ctrl: true }))).toBe("Ctrl+Tab");
    expect(comboFromEvent(ev(",", { ctrl: true }))).toBe("Ctrl+,");
  });
});

describe("normalizeCombo", () => {
  it("padroniza maiúsculas e espaços", () => {
    expect(normalizeCombo("ctrl + shift + t")).toBe("Ctrl+Shift+T");
    expect(normalizeCombo("ALT+tab")).toBe("Alt+Tab");
  });

  it("aceita vírgula e o próprio + como tecla", () => {
    expect(normalizeCombo("Ctrl+,")).toBe("Ctrl+,");
    expect(normalizeCombo("Ctrl++")).toBe("Ctrl++");
  });

  it("rejeita sem Ctrl ou Alt, só Shift, tecla solta e lixo", () => {
    expect(normalizeCombo("T")).toBeNull();
    expect(normalizeCombo("Shift+T")).toBeNull();
    expect(normalizeCombo("Meta+T")).toBeNull();
    expect(normalizeCombo("Ctrl+")).toBeNull();
    expect(normalizeCombo("")).toBeNull();
  });
});

describe("matches", () => {
  it("só casa a combinação exata", () => {
    expect(matches(ev("t", { ctrl: true, shift: true }), "Ctrl+Shift+T")).toBe(true);
    expect(matches(ev("t", { ctrl: true }), "Ctrl+Shift+T")).toBe(false);
    expect(matches(ev("t", { ctrl: true, shift: true, alt: true }), "Ctrl+Shift+T")).toBe(false);
  });
});

describe("normalizeShortcuts", () => {
  it("vazio ou lixo vira os padrões", () => {
    expect(normalizeShortcuts(null)).toEqual(DEFAULT_SHORTCUTS);
    expect(normalizeShortcuts({ newTab: 12, nope: "Ctrl+Q" })).toEqual(DEFAULT_SHORTCUTS);
  });

  it("mantém personalização válida, já padronizada", () => {
    expect(normalizeShortcuts({ newTab: "ctrl+alt+n" }).newTab).toBe("Ctrl+Alt+N");
  });

  it("combinação inválida volta ao padrão da ação", () => {
    expect(normalizeShortcuts({ closeTab: "W" }).closeTab).toBe(DEFAULT_SHORTCUTS.closeTab);
  });

  it("duas ações na mesma combinação: a segunda volta ao padrão", () => {
    const s = normalizeShortcuts({ newTab: "Ctrl+J", closeTab: "Ctrl+J" });
    expect(s.newTab).toBe("Ctrl+J");
    expect(s.closeTab).toBe(DEFAULT_SHORTCUTS.closeTab);
  });

  it("os padrões não colidem entre si", () => {
    const values = ACTIONS.map((a) => a.default);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("conflictFor", () => {
  it("acha a outra ação que usa a combinação", () => {
    expect(conflictFor(DEFAULT_SHORTCUTS, "newTab", "Ctrl+K")).toBe("aiBar");
    expect(conflictFor(DEFAULT_SHORTCUTS, "newTab", "Ctrl+Shift+T")).toBeNull();
    expect(conflictFor(DEFAULT_SHORTCUTS, "newTab", "Ctrl+Alt+Z")).toBeNull();
  });
});
