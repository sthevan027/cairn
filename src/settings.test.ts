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

describe("barra lateral e abas", () => {
  it("aceita os valores válidos", () => {
    const s = normalizeSettings({ sidebarSide: "right", sidebarWidth: 300, newTabPosition: "afterCurrent", closeOnExit: false });
    expect(s).toMatchObject({ sidebarSide: "right", sidebarWidth: 300, newTabPosition: "afterCurrent", closeOnExit: false });
  });

  it("largura presa ao intervalo e inteira; lixo cai no padrão", () => {
    expect(normalizeSettings({ sidebarWidth: 9000 }).sidebarWidth).toBe(420);
    expect(normalizeSettings({ sidebarWidth: 10 }).sidebarWidth).toBe(200);
    expect(normalizeSettings({ sidebarWidth: 250.6 }).sidebarWidth).toBe(251);
    const bad = normalizeSettings({ sidebarSide: "meio", sidebarWidth: "x", newTabPosition: 3, closeOnExit: "sim" });
    expect(bad).toMatchObject({ sidebarSide: "left", sidebarWidth: 248, newTabPosition: "end", closeOnExit: true });
  });
});

describe("espaçamento do texto", () => {
  it("mantém valores dentro do intervalo", () => {
    const s = normalizeSettings({ lineHeight: 1.3, letterSpacing: 1.5 });
    expect(s.lineHeight).toBe(1.3);
    expect(s.letterSpacing).toBe(1.5);
  });

  it("prende ao intervalo e troca lixo pelo padrão", () => {
    expect(normalizeSettings({ lineHeight: 9, letterSpacing: -3 })).toMatchObject({ lineHeight: 1.6, letterSpacing: 0 });
    expect(normalizeSettings({ lineHeight: "abc", letterSpacing: null })).toMatchObject({ lineHeight: 1, letterSpacing: 0 });
  });
});

describe("cursor", () => {
  it("aceita formato conhecido e cor #rrggbb", () => {
    const s = normalizeSettings({ cursorStyle: "bar", cursorColor: "#ff8800" });
    expect(s.cursorStyle).toBe("bar");
    expect(s.cursorColor).toBe("#ff8800");
  });

  it("formato inválido cai no bloco; cor fora do padrão cai em vazio (tema)", () => {
    const s = normalizeSettings({ cursorStyle: "neon", cursorColor: "vermelho" });
    expect(s.cursorStyle).toBe("block");
    expect(s.cursorColor).toBe("");
  });
});

describe("atalhos dentro das configurações", () => {
  it("o padrão traz todos os atalhos", () => {
    expect(normalizeSettings({}).shortcuts).toEqual(DEFAULTS.shortcuts);
    expect(DEFAULTS.shortcuts.newTab).toBe("Ctrl+Shift+T");
  });

  it("personalização válida é mantida e padronizada; inválida volta ao padrão", () => {
    const s = normalizeSettings({ shortcuts: { newTab: "ctrl+alt+n", closeTab: "W", search: 5 } });
    expect(s.shortcuts.newTab).toBe("Ctrl+Alt+N");
    expect(s.shortcuts.closeTab).toBe(DEFAULTS.shortcuts.closeTab);
    expect(s.shortcuts.search).toBe(DEFAULTS.shortcuts.search);
  });

  it("'shortcuts' que não é objeto vira o padrão", () => {
    expect(normalizeSettings({ shortcuts: "lixo" }).shortcuts).toEqual(DEFAULTS.shortcuts);
  });
});

describe("os padrões novos", () => {
  it("batem com o que a tela mostra ao abrir", () => {
    expect(DEFAULTS).toMatchObject({
      lineHeight: 1,
      letterSpacing: 0,
      cursorStyle: "block",
      cursorColor: "",
      sidebarSide: "left",
      sidebarWidth: 248,
      newTabPosition: "end",
      closeOnExit: true,
    });
  });

  it("configuração vazia ou antiga (sem os campos novos) completa tudo com os padrões", () => {
    const antiga = { theme: "graphite", fontSize: 16, cursorBlink: false };
    const s = normalizeSettings(antiga);
    expect(s).toMatchObject({ theme: "graphite", fontSize: 16, cursorBlink: false });
    expect(s).toMatchObject({
      lineHeight: DEFAULTS.lineHeight,
      sidebarSide: DEFAULTS.sidebarSide,
      closeOnExit: DEFAULTS.closeOnExit,
    });
    expect(s.shortcuts).toEqual(DEFAULTS.shortcuts);
  });
});

describe("arquivo de configuração", () => {
  it("ida e volta preserva as personalizações novas", async () => {
    const { parseSettingsFile, serializeSettings } = await import("./settings");
    const original = normalizeSettings({
      lineHeight: 1.25,
      letterSpacing: 1,
      cursorStyle: "underline",
      cursorColor: "#33ccff",
      sidebarSide: "right",
      sidebarWidth: 320,
      newTabPosition: "afterCurrent",
      closeOnExit: false,
      shortcuts: { newTab: "Ctrl+Alt+N" },
    });
    const voltou = parseSettingsFile(serializeSettings(original));
    expect(voltou).toEqual(original);
    expect(voltou?.shortcuts.newTab).toBe("Ctrl+Alt+N");
    expect(voltou?.sidebarSide).toBe("right");
  });

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
