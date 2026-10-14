import type { Theme } from "./themes";

export type SegmentType = "user" | "host" | "cwd" | "git" | "status" | "duration" | "time" | "shell" | "text";
export type SegmentStyle = "plain" | "pill" | "powerline";
export type Side = "left" | "right";
export type CwdStyle = "full" | "folder" | "short";
export type PromptMode = "shell" | "cairn";
export type InputPosition = "flow" | "bottom";

export const SEGMENT_TYPES: Array<{ type: SegmentType; label: string }> = [
  { type: "user", label: "Usuário" },
  { type: "host", label: "Computador" },
  { type: "cwd", label: "Pasta" },
  { type: "git", label: "Git" },
  { type: "status", label: "Status do último comando" },
  { type: "duration", label: "Duração do último comando" },
  { type: "time", label: "Hora" },
  { type: "shell", label: "Shell" },
  { type: "text", label: "Texto livre" },
];

/** Nomes de cor aceitos: resolvidos pelo tema ativo, então o prompt acompanha claro/escuro. */
export const COLOR_TOKENS = [
  "fg",
  "dim",
  "muted",
  "accent",
  "ok",
  "fail",
  "running",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
] as const;

export interface SegmentOptions {
  cwdStyle: CwdStyle;
  /** git: mostra +staged ~alterados ?novos e ↑ahead ↓behind */
  gitStatus: boolean;
  /** git: troca a cor quando há mudanças */
  colorByState: boolean;
  /** status: mostra também quando o comando deu certo */
  always: boolean;
  /** duration: só aparece acima deste tempo */
  minMs: number;
  /** time: inclui os segundos */
  seconds: boolean;
  /** text: o conteúdo */
  text: string;
}

export interface PromptSegment {
  id: string;
  type: SegmentType;
  side: Side;
  enabled: boolean;
  style: SegmentStyle;
  /** token de cor, `#hex` ou vazio (cor padrão do tipo) */
  fg: string;
  bg: string;
  /** glifo antes do texto (fonte Nerd) */
  icon: string;
  options: SegmentOptions;
}

export interface PromptConfig {
  mode: PromptMode;
  position: InputPosition;
  segments: PromptSegment[];
}

export interface GitInfo {
  branch: string;
  staged: number;
  unstaged: number;
  untracked: number;
  ahead: number;
  behind: number;
}

export interface PromptData {
  user: string;
  host: string;
  home: string;
  cwd: string | null;
  git: GitInfo | null;
  exit: number | null;
  durationMs: number | null;
  shell: string;
  now: Date;
}

export const DEFAULT_OPTIONS: SegmentOptions = {
  cwdStyle: "folder",
  gitStatus: true,
  colorByState: true,
  always: false,
  minMs: 0,
  seconds: false,
  text: "❯",
};

const DEFAULT_FG: Record<SegmentType, string> = {
  user: "magenta",
  host: "magenta",
  cwd: "cyan",
  git: "cyan",
  status: "red",
  duration: "yellow",
  time: "dim",
  shell: "dim",
  text: "yellow",
};

const DEFAULT_ICON: Record<SegmentType, string> = {
  user: "\uf007",
  host: "",
  cwd: "\uf07b",
  git: "\ue0a0",
  status: "",
  duration: "",
  time: "\uf017",
  shell: "",
  text: "",
};

export function newSegment(type: SegmentType, over: Partial<PromptSegment> = {}): PromptSegment {
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    side: "left",
    enabled: true,
    style: "plain",
    fg: "",
    bg: "",
    icon: DEFAULT_ICON[type],
    options: { ...DEFAULT_OPTIONS },
    ...over,
  };
}

/** Espelha o `tokyonight_custom.omp.json` do Sthevan: usuário, pasta e erro à esquerda; tempo e git à direita. */
export function defaultSegments(): PromptSegment[] {
  return [
    newSegment("user", { id: "user" }),
    newSegment("cwd", { id: "cwd" }),
    newSegment("status", { id: "status" }),
    newSegment("duration", { id: "duration", side: "right" }),
    newSegment("git", { id: "git", side: "right" }),
  ];
}

export function defaultPrompt(): PromptConfig {
  return { mode: "shell", position: "flow", segments: defaultSegments() };
}

// ---- validação ----

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isColorRef(value: unknown): value is string {
  return (
    typeof value === "string" && (value === "" || HEX.test(value) || (COLOR_TOKENS as readonly string[]).includes(value))
  );
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

function normalizeOptions(raw: unknown): SegmentOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const minMs = Number(o.minMs);
  return {
    cwdStyle: oneOf(o.cwdStyle, ["full", "folder", "short"] as const, DEFAULT_OPTIONS.cwdStyle),
    gitStatus: typeof o.gitStatus === "boolean" ? o.gitStatus : DEFAULT_OPTIONS.gitStatus,
    colorByState: typeof o.colorByState === "boolean" ? o.colorByState : DEFAULT_OPTIONS.colorByState,
    always: typeof o.always === "boolean" ? o.always : DEFAULT_OPTIONS.always,
    minMs: Number.isFinite(minMs) ? Math.min(600_000, Math.max(0, Math.round(minMs))) : DEFAULT_OPTIONS.minMs,
    seconds: typeof o.seconds === "boolean" ? o.seconds : DEFAULT_OPTIONS.seconds,
    text: typeof o.text === "string" ? o.text.slice(0, 40) : DEFAULT_OPTIONS.text,
  };
}

export function normalizeSegment(raw: unknown, taken: Set<string>): PromptSegment | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const type = oneOf(s.type, SEGMENT_TYPES.map((t) => t.type), "text" as SegmentType);
  if (!SEGMENT_TYPES.some((t) => t.type === s.type)) return null;
  let id = typeof s.id === "string" && s.id.trim() ? s.id.trim().slice(0, 40) : `${type}-${taken.size + 1}`;
  while (taken.has(id)) id = `${id}-2`;
  taken.add(id);
  return {
    id,
    type,
    side: oneOf(s.side, ["left", "right"] as const, "left"),
    enabled: typeof s.enabled === "boolean" ? s.enabled : true,
    style: oneOf(s.style, ["plain", "pill", "powerline"] as const, "plain"),
    fg: isColorRef(s.fg) ? s.fg : "",
    bg: isColorRef(s.bg) ? s.bg : "",
    icon: typeof s.icon === "string" ? s.icon.slice(0, 4) : DEFAULT_ICON[type],
    options: normalizeOptions(s.options),
  };
}

export function normalizePrompt(raw: unknown): PromptConfig {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const taken = new Set<string>();
  const segments = Array.isArray(p.segments)
    ? p.segments
        .slice(0, 24)
        .map((s) => normalizeSegment(s, taken))
        .filter((s): s is PromptSegment => s !== null)
    : defaultSegments();
  return {
    mode: oneOf(p.mode, ["shell", "cairn"] as const, "shell"),
    position: oneOf(p.position, ["flow", "bottom"] as const, "flow"),
    segments,
  };
}

// ---- formatação (pura, testada) ----

/** `/c/Users/x` (Git Bash) vira `C:/Users/x`; barras invertidas viram `/`. */
export function normalizeCwd(cwd: string): string {
  const slashed = cwd.replace(/\\/g, "/");
  const m = /^\/([a-zA-Z])(\/.*)?$/.exec(slashed);
  return m ? `${m[1].toUpperCase()}:${m[2] ?? "/"}` : slashed;
}

export function formatCwd(cwd: string, home: string, style: CwdStyle): string {
  let path = normalizeCwd(cwd);
  const h = home ? normalizeCwd(home).replace(/\/+$/, "") : "";
  if (h && (path.toLowerCase() === h.toLowerCase() || path.toLowerCase().startsWith(`${h.toLowerCase()}/`))) {
    path = `~${path.slice(h.length)}`;
  }
  const parts = path.split("/").filter((p, i) => p !== "" || i === 0);
  if (style === "folder") {
    const named = path.split("/").filter(Boolean);
    return path === "~" ? "~" : (named[named.length - 1] ?? path);
  }
  if (style === "short" && parts.length > 2) {
    const last = parts[parts.length - 1];
    const middle = parts.slice(1, -1).map((p) => p.charAt(0));
    return [parts[0], ...middle, last].join("/");
  }
  return path;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
}

export function formatTime(date: Date, seconds: boolean): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getHours())}:${p(date.getMinutes())}${seconds ? `:${p(date.getSeconds())}` : ""}`;
}

export const isDirty = (git: GitInfo) => git.staged + git.unstaged + git.untracked > 0;

export function gitText(git: GitInfo, showStatus: boolean): string {
  if (!showStatus) return git.branch;
  const marks = [
    git.staged > 0 ? `+${git.staged}` : "",
    git.unstaged > 0 ? `~${git.unstaged}` : "",
    git.untracked > 0 ? `?${git.untracked}` : "",
    git.ahead > 0 ? `↑${git.ahead}` : "",
    git.behind > 0 ? `↓${git.behind}` : "",
  ].filter(Boolean);
  return [git.branch, ...marks].join(" ");
}

/** Texto do segmento com os dados atuais, ou `null` quando ele não deve aparecer. */
export function segmentText(seg: PromptSegment, data: PromptData): string | null {
  const o = seg.options;
  switch (seg.type) {
    case "user":
      return data.user || null;
    case "host":
      return data.host || null;
    case "cwd":
      return data.cwd ? formatCwd(data.cwd, data.home, o.cwdStyle) : null;
    case "git":
      return data.git ? gitText(data.git, o.gitStatus) : null;
    case "status":
      if (data.exit === null) return null;
      return data.exit === 0 ? (o.always ? "✓" : null) : `✗ ${data.exit}`;
    case "duration":
      return data.durationMs === null || data.durationMs < o.minMs ? null : formatDuration(data.durationMs);
    case "time":
      return formatTime(data.now, o.seconds);
    case "shell":
      return data.shell ? (data.shell.split(/[\\/]/).pop() ?? data.shell).replace(/\.exe$/i, "") : null;
    case "text":
      return o.text || null;
  }
}

/** Resolve token/hex para uma cor CSS usando o tema ativo. */
export function resolveColor(ref: string, theme: Theme, fallback: string): string {
  const token = ref || fallback;
  if (HEX.test(token)) return token;
  const ui = theme.ui as unknown as Record<string, string>;
  const term = theme.term as Record<string, string | undefined>;
  return ui[token] ?? term[token] ?? theme.ui.fg;
}

export function segmentColors(seg: PromptSegment, data: PromptData, theme: Theme) {
  const dirty = seg.type === "git" && seg.options.colorByState && data.git !== null && isDirty(data.git);
  const fg = resolveColor(dirty ? "red" : seg.fg, theme, DEFAULT_FG[seg.type]);
  const bg = seg.bg ? resolveColor(seg.bg, theme, "") : "";
  return { fg, bg };
}

/** Cores finais do chip conforme o estilo: texto colorido, pílula translúcida ou bloco sólido (powerline). */
export function chipColors(seg: PromptSegment, data: PromptData, theme: Theme): { color: string; background: string } {
  const { fg, bg } = segmentColors(seg, data, theme);
  switch (seg.style) {
    case "pill":
      return { color: fg, background: bg || `color-mix(in srgb, ${fg} 18%, transparent)` };
    case "powerline":
      return { color: bg ? fg : theme.ui.bg, background: bg || fg };
    default:
      return { color: fg, background: bg || "transparent" };
  }
}
