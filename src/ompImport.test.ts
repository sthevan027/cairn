import { describe, expect, it } from "vitest";
import { importOhMyPosh } from "./ompImport";

// Conteúdo real de Documentos\PowerShell\tokyonight_custom.omp.json (sem segredos).
const TOKYO = {
  palette: {
    "main-bg": "#24283b",
    "terminal-red": "#f7768e",
    "terminal-yellow": "#e0af68",
    "terminal-blue": "#7aa2f7",
    "light-sky-blue": "#7dcfff",
    "terminal-magenta": "#bb9af7",
  },
  blocks: [
    {
      alignment: "left",
      type: "prompt",
      segments: [
        { type: "session", style: "plain", foreground: "p:terminal-magenta", template: " {{ .UserName }}  " },
        { type: "path", style: "plain", foreground: "p:light-sky-blue", options: { style: "folder" }, template: "{{ .Path }}" },
        { type: "status", style: "plain", foreground: "p:terminal-red", template: " {{ if gt .Code 0 }}{{ end }}" },
      ],
    },
    {
      alignment: "right",
      type: "prompt",
      segments: [
        {
          type: "executiontime",
          style: "plain",
          foreground: "p:terminal-yellow",
          template: " {{ .Ms }}ms",
          options: { always_enabled: true, threshold: 0 },
        },
        { type: "git", style: "plain", foreground: "p:light-sky-blue", template: "({{ .HEAD}}) " },
      ],
    },
    {
      alignment: "left",
      newline: true,
      type: "prompt",
      segments: [{ type: "text", style: "plain", foreground: "p:terminal-yellow", template: "❯" }],
    },
  ],
};

describe("importOhMyPosh", () => {
  it("traduz o tokyonight_custom do Sthevan nos widgets do Cairn", () => {
    const r = importOhMyPosh(TOKYO)!;
    expect(r.skipped).toBe(0);
    expect(r.segments.map((s) => [s.type, s.side])).toEqual([
      ["user", "left"],
      ["cwd", "left"],
      ["status", "left"],
      ["duration", "right"],
      ["git", "right"],
    ]);
    const [user, cwd, , duration, git] = r.segments;
    expect(user.fg).toBe("#bb9af7");
    expect(cwd.fg).toBe("#7dcfff");
    expect(cwd.options.cwdStyle).toBe("folder");
    expect(duration.fg).toBe("#e0af68");
    expect(duration.options.minMs).toBe(0);
    expect(git.fg).toBe("#7dcfff");
  });

  it("o ❯ sozinho não vira widget (o shell já mostra o símbolo de entrada)", () => {
    const r = importOhMyPosh(TOKYO)!;
    expect(r.segments.some((s) => s.type === "text")).toBe(false);
  });

  it("estilos, fundo e tipos desconhecidos", () => {
    const r = importOhMyPosh({
      blocks: [
        {
          alignment: "left",
          segments: [
            { type: "path", style: "powerline", foreground: "#ffffff", background: "#ff8800", options: { style: "letter" } },
            { type: "os", style: "plain" },
            { type: "git", style: "diamond", foreground: "red", background: "transparent" },
            { type: "text", template: "→ agora" },
          ],
        },
      ],
    })!;
    expect(r.skipped).toBe(1);
    expect(r.segments.map((s) => s.type)).toEqual(["cwd", "git", "text"]);
    const [cwd, git, text] = r.segments;
    expect(cwd.style).toBe("powerline");
    expect(cwd.bg).toBe("#ff8800");
    expect(cwd.options.cwdStyle).toBe("short");
    expect(git.style).toBe("pill");
    expect(git.fg).toBe("red");
    expect(git.bg).toBe("");
    expect(text.options.text).toBe("→ agora");
  });

  it("rejeita o que não é um arquivo do oh-my-posh", () => {
    for (const bad of [null, "x", 3, [], {}, { blocks: "nao" }]) expect(importOhMyPosh(bad)).toBeNull();
  });

  it("extrai o ícone escrito fora das chaves do template", () => {
    const r = importOhMyPosh({
      blocks: [{ segments: [{ type: "session", template: " {{ .UserName }}" }] }],
    })!;
    expect(r.segments[0].icon).toBe("");
  });
});
