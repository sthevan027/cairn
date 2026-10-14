import { describe, expect, it } from "vitest";
import { DEFAULTS, fontStack, normalizeSettings } from "./settings";
import { THEMES, getTheme } from "./themes";

describe("normalizeSettings", () => {
  it("lixo ou vazio vira os padrões", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULTS);
    expect(normalizeSettings("oi")).toEqual(DEFAULTS);
    expect(normalizeSettings({})).toEqual(DEFAULTS);
  });

  it("mantém valores válidos", () => {
    const s = normalizeSettings({
      theme: "daylight",
      fontFamily: "JetBrains Mono",
      fontSize: 16,
      cursorBlink: false,
      defaultShell: "C:/Program Files/Git/bin/bash.exe",
      aiModel: "claude-haiku-5-5",
    });
    expect(s.theme).toBe("daylight");
    expect(s.fontFamily).toBe("JetBrains Mono");
    expect(s.fontSize).toBe(16);
    expect(s.cursorBlink).toBe(false);
    expect(s.defaultShell).toBe("C:/Program Files/Git/bin/bash.exe");
    expect(s.aiModel).toBe("claude-haiku-5-5");
  });

  it("tema desconhecido volta ao padrão e tamanho da fonte é limitado", () => {
    expect(normalizeSettings({ theme: "nao-existe" }).theme).toBe(DEFAULTS.theme);
    expect(normalizeSettings({ fontSize: 2 }).fontSize).toBe(10);
    expect(normalizeSettings({ fontSize: 99 }).fontSize).toBe(24);
    expect(normalizeSettings({ fontSize: "abc" }).fontSize).toBe(DEFAULTS.fontSize);
    expect(normalizeSettings({ fontSize: 13.6 }).fontSize).toBe(14);
  });

  it("tipos errados e textos vazios caem no padrão", () => {
    expect(normalizeSettings({ cursorBlink: "sim" }).cursorBlink).toBe(DEFAULTS.cursorBlink);
    expect(normalizeSettings({ fontFamily: "   " }).fontFamily).toBe(DEFAULTS.fontFamily);
    expect(normalizeSettings({ aiModel: 5 }).aiModel).toBe(DEFAULTS.aiModel);
    expect(normalizeSettings({ defaultShell: "  " }).defaultShell).toBeNull();
  });
});

describe("fontStack", () => {
  it("coloca o nome primeiro e mantém as alternativas", () => {
    expect(fontStack("Fira Code")).toBe('"Fira Code", "Cascadia Code", Consolas, monospace');
  });

  it("não deixa aspas e chaves escaparem para o CSS", () => {
    expect(fontStack('x"; } body { color: red')).not.toMatch(/[;{}]/);
    expect(fontStack("   ")).toBe('"Cascadia Code", Consolas, monospace');
  });
});

describe("temas", () => {
  it("ids são únicos e getTheme cai no primeiro", () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(getTheme("xyz")).toBe(THEMES[0]);
  });

  it("todo tema define as 16 cores ANSI e as cores de interface", () => {
    const ansi = [
      "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
      "brightBlack", "brightRed", "brightGreen", "brightYellow",
      "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
    ] as const;
    for (const theme of THEMES) {
      for (const color of ansi) expect(theme.term[color], `${theme.id}.${color}`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(Object.values(theme.ui).every(Boolean), theme.id).toBe(true);
    }
  });

  it("o fundo do terminal acompanha o fundo da interface", () => {
    for (const theme of THEMES) expect(theme.term.background).toBe(theme.ui.bg);
  });
});

describe("arquivo de configuração", () => {
  it("ida e volta preserva tudo, inclusive o prompt", async () => {
    const { parseSettingsFile, serializeSettings } = await import("./settings");
    const original = normalizeSettings({
      theme: "graphite",
      fontSize: 16,
      prompt: { mode: "cairn", position: "bottom", segments: [{ type: "cwd", side: "right", fg: "#ff8800" }] },
    });
    const voltou = parseSettingsFile(serializeSettings(original));
    expect(voltou).toEqual(original);
    expect(voltou?.prompt.mode).toBe("cairn");
    expect(voltou?.prompt.segments[0].fg).toBe("#ff8800");
  });

  it("JSON quebrado (edição pela metade) é ignorado, sem derrubar nada", async () => {
    const { parseSettingsFile } = await import("./settings");
    expect(parseSettingsFile('{"theme": "graphite", ')).toBeNull();
    expect(parseSettingsFile("")).toBeNull();
  });

  it("o prompt entra na normalização e prompt inválido volta ao padrão", () => {
    expect(normalizeSettings({}).prompt).toEqual(DEFAULTS.prompt);
    expect(normalizeSettings({ prompt: "lixo" }).prompt.segments.length).toBe(5);
  });
});
