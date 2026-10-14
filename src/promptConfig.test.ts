import { describe, expect, it } from "vitest";
import {
  COLOR_TOKENS,
  defaultPrompt,
  formatCwd,
  formatDuration,
  formatTime,
  gitText,
  isColorRef,
  newSegment,
  normalizeCwd,
  normalizePrompt,
  resolveColor,
  segmentColors,
  segmentText,
  type GitInfo,
  type PromptData,
} from "./promptConfig";
import { THEMES, getTheme } from "./themes";

const data = (over: Partial<PromptData> = {}): PromptData => ({
  user: "Sthev",
  host: "SthevanPC",
  home: "C:\\Users\\Sthev",
  cwd: "C:\\Users\\Sthev\\Projetos\\cairn",
  git: { branch: "main", staged: 0, unstaged: 0, untracked: 0, ahead: 0, behind: 0 },
  exit: 0,
  durationMs: 1234,
  shell: "pwsh.exe",
  now: new Date(2026, 9, 14, 9, 5, 7),
  ...over,
});

describe("normalizePrompt", () => {
  it("vazio ou lixo volta ao padrão (espelho do oh-my-posh)", () => {
    for (const raw of [null, undefined, "x", 5, {}]) {
      const p = normalizePrompt(raw);
      expect(p.mode).toBe("shell");
      expect(p.position).toBe("flow");
      expect(p.segments.map((s) => s.type)).toEqual(["user", "cwd", "status", "duration", "git"]);
    }
  });

  it("descarta segmento de tipo desconhecido e corrige campos inválidos", () => {
    const p = normalizePrompt({
      mode: "cairn",
      position: "bottom",
      segments: [
        { type: "cwd", side: "meio", style: "neon", fg: "#zzz", bg: "ok", options: { cwdStyle: "xyz", minMs: -5 } },
        { type: "coisa-inexistente" },
        "lixo",
      ],
    });
    expect(p.mode).toBe("cairn");
    expect(p.position).toBe("bottom");
    expect(p.segments).toHaveLength(1);
    const [s] = p.segments;
    expect(s.side).toBe("left");
    expect(s.style).toBe("plain");
    expect(s.fg).toBe("");
    expect(s.bg).toBe("ok");
    expect(s.options.cwdStyle).toBe("folder");
    expect(s.options.minMs).toBe(0);
  });

  it("ids repetidos viram únicos e lista vazia é respeitada", () => {
    const p = normalizePrompt({ segments: [{ type: "user", id: "a" }, { type: "cwd", id: "a" }] });
    expect(new Set(p.segments.map((s) => s.id)).size).toBe(2);
    expect(normalizePrompt({ segments: [] }).segments).toEqual([]);
  });

  it("aceita cores por nome e hex e rejeita o resto", () => {
    for (const token of COLOR_TOKENS) expect(isColorRef(token)).toBe(true);
    for (const ok of ["", "#fff", "#7aa2f7", "#7aa2f7cc"]) expect(isColorRef(ok)).toBe(true);
    for (const bad of ["azul", "#12", "rgb(0,0,0)", 5, null]) expect(isColorRef(bad)).toBe(false);
  });

  it("limita a quantidade de segmentos", () => {
    const many = Array.from({ length: 60 }, () => ({ type: "text" }));
    expect(normalizePrompt({ segments: many }).segments.length).toBe(24);
  });
});

describe("formatadores", () => {
  it("normalizeCwd entende Git Bash e barras invertidas", () => {
    expect(normalizeCwd("/c/Users/Sthev")).toBe("C:/Users/Sthev");
    expect(normalizeCwd("/d")).toBe("D:/");
    expect(normalizeCwd("C:\\Users\\Sthev")).toBe("C:/Users/Sthev");
    expect(normalizeCwd("/usr/local")).toBe("/usr/local");
  });

  it("formatCwd troca a home por ~ e respeita o estilo", () => {
    const home = "C:\\Users\\Sthev";
    expect(formatCwd("C:\\Users\\Sthev", home, "full")).toBe("~");
    expect(formatCwd("C:\\Users\\Sthev", home, "folder")).toBe("~");
    expect(formatCwd("C:\\Users\\Sthev\\Projetos\\cairn", home, "full")).toBe("~/Projetos/cairn");
    expect(formatCwd("C:\\Users\\Sthev\\Projetos\\cairn", home, "folder")).toBe("cairn");
    expect(formatCwd("C:\\Users\\Sthev\\Projetos\\cairn", home, "short")).toBe("~/P/cairn");
    expect(formatCwd("/c/users/sthev/x", home, "full")).toBe("~/x");
    expect(formatCwd("D:\\Projetos\\cairn", home, "full")).toBe("D:/Projetos/cairn");
    expect(formatCwd("D:\\Projetos\\cairn", home, "folder")).toBe("cairn");
  });

  it("formatDuration e formatTime", () => {
    expect(formatDuration(42)).toBe("42ms");
    expect(formatDuration(1234)).toBe("1.2s");
    expect(formatDuration(65_000)).toBe("1m5s");
    expect(formatTime(new Date(2026, 0, 1, 9, 5, 7), false)).toBe("09:05");
    expect(formatTime(new Date(2026, 0, 1, 9, 5, 7), true)).toBe("09:05:07");
  });

  it("gitText compõe branch e marcas", () => {
    const g: GitInfo = { branch: "main", staged: 2, unstaged: 3, untracked: 1, ahead: 1, behind: 4 };
    expect(gitText(g, true)).toBe("main +2 ~3 ?1 ↑1 ↓4");
    expect(gitText(g, false)).toBe("main");
    expect(gitText({ ...g, staged: 0, unstaged: 0, untracked: 0, ahead: 0, behind: 0 }, true)).toBe("main");
  });
});

describe("segmentText", () => {
  const seg = (type: Parameters<typeof newSegment>[0], options = {}) =>
    newSegment(type, { options: { ...newSegment(type).options, ...options } });

  it("mostra os dados de cada tipo", () => {
    expect(segmentText(seg("user"), data())).toBe("Sthev");
    expect(segmentText(seg("cwd"), data())).toBe("cairn");
    expect(segmentText(seg("git"), data())).toBe("main");
    expect(segmentText(seg("duration"), data())).toBe("1.2s");
    expect(segmentText(seg("time"), data())).toBe("09:05");
    expect(segmentText(seg("shell"), data())).toBe("pwsh");
    expect(segmentText(seg("text"), data())).toBe("❯");
  });

  it("esconde o que não se aplica", () => {
    expect(segmentText(seg("git"), data({ git: null }))).toBeNull();
    expect(segmentText(seg("cwd"), data({ cwd: null }))).toBeNull();
    expect(segmentText(seg("status"), data({ exit: 0 }))).toBeNull();
    expect(segmentText(seg("status"), data({ exit: null }))).toBeNull();
    expect(segmentText(seg("duration", { minMs: 2000 }), data({ durationMs: 1234 }))).toBeNull();
  });

  it("status mostra o erro e, se pedido, o sucesso", () => {
    expect(segmentText(seg("status"), data({ exit: 3 }))).toBe("✗ 3");
    expect(segmentText(seg("status", { always: true }), data({ exit: 0 }))).toBe("✓");
  });
});

describe("cores acompanham o tema", () => {
  it("token vira a cor do tema ativo; hex passa direto", () => {
    const night = getTheme("cairn-night");
    const day = getTheme("daylight");
    expect(resolveColor("accent", night, "")).toBe(night.ui.accent);
    expect(resolveColor("cyan", night, "")).toBe(night.term.cyan);
    expect(resolveColor("cyan", day, "")).toBe(day.term.cyan);
    expect(resolveColor("cyan", night, "")).not.toBe(resolveColor("cyan", day, ""));
    expect(resolveColor("#123456", night, "")).toBe("#123456");
    expect(resolveColor("", night, "yellow")).toBe(night.term.yellow);
  });

  it("git sujo usa vermelho quando colorByState está ligado", () => {
    const git = newSegment("git");
    const dirty = data({ git: { branch: "x", staged: 0, unstaged: 2, untracked: 0, ahead: 0, behind: 0 } });
    const theme = THEMES[0];
    expect(segmentColors(git, dirty, theme).fg).toBe(theme.term.red);
    expect(segmentColors(git, data(), theme).fg).toBe(theme.term.cyan);
    const off = newSegment("git", { options: { ...git.options, colorByState: false } });
    expect(segmentColors(off, dirty, theme).fg).toBe(theme.term.cyan);
  });

  it("o padrão tem os tipos esperados e defaultPrompt é independente", () => {
    const a = defaultPrompt();
    a.segments[0].enabled = false;
    expect(defaultPrompt().segments[0].enabled).toBe(true);
  });
});

describe("chipColors", () => {
  const theme = THEMES[0];
  const seg = (style: "plain" | "pill" | "powerline", bg = "") => newSegment("cwd", { style, bg });

  it("plain: texto colorido, sem fundo", async () => {
    const { chipColors } = await import("./promptConfig");
    expect(chipColors(seg("plain"), data(), theme)).toEqual({ color: theme.term.cyan, background: "transparent" });
  });

  it("pill: fundo translúcido derivado da cor do texto", async () => {
    const { chipColors } = await import("./promptConfig");
    const c = chipColors(seg("pill"), data(), theme);
    expect(c.color).toBe(theme.term.cyan);
    expect(c.background).toContain("color-mix");
    expect(c.background).toContain(theme.term.cyan);
  });

  it("powerline: bloco sólido com texto na cor do fundo da interface (ou o fundo escolhido)", async () => {
    const { chipColors } = await import("./promptConfig");
    expect(chipColors(seg("powerline"), data(), theme)).toEqual({ color: theme.ui.bg, background: theme.term.cyan });
    expect(chipColors(seg("powerline", "#112233"), data(), theme)).toEqual({
      color: theme.term.cyan,
      background: "#112233",
    });
  });
});
