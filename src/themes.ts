import type { ITheme } from "@xterm/xterm";

/** Cores da interface; cada chave vira a variável CSS `--chave`. */
export interface UiColors {
  bg: string;
  fg: string;
  card: string;
  border: string;
  ok: string;
  fail: string;
  running: string;
  side: string;
  "side-hover": string;
  "side-active": string;
  muted: string;
  dim: string;
  accent: string;
  avatar: string;
  shadow: string;
}

export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  ui: UiColors;
  term: ITheme;
}

export const THEMES: Theme[] = [
  {
    id: "cairn-night",
    name: "Cairn Night",
    dark: true,
    ui: {
      bg: "#1a1b26",
      fg: "#c0caf5",
      card: "#1f2335",
      border: "#2a2e45",
      ok: "#9ece6a",
      fail: "#f7768e",
      running: "#e0af68",
      side: "#16161e",
      "side-hover": "#1c1e2b",
      "side-active": "#24283b",
      muted: "#565f89",
      dim: "#9aa5ce",
      accent: "#7aa2f7",
      avatar: "#292e42",
      shadow: "rgba(0, 0, 0, 0.4)",
    },
    term: {
      background: "#1a1b26",
      foreground: "#c0caf5",
      cursor: "#c0caf5",
      selectionBackground: "#33467c",
      black: "#15161e",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#414868",
      brightRed: "#f7768e",
      brightGreen: "#9ece6a",
      brightYellow: "#e0af68",
      brightBlue: "#7aa2f7",
      brightMagenta: "#bb9af7",
      brightCyan: "#7dcfff",
      brightWhite: "#c0caf5",
    },
  },
  {
    id: "graphite",
    name: "Grafite",
    dark: true,
    ui: {
      bg: "#15171b",
      fg: "#d5d9e0",
      card: "#1d2025",
      border: "#2a2e35",
      ok: "#7fd18b",
      fail: "#ff7b72",
      running: "#f2c26b",
      side: "#101216",
      "side-hover": "#181b20",
      "side-active": "#23272e",
      muted: "#6b7280",
      dim: "#9aa3b2",
      accent: "#58a6ff",
      avatar: "#2a2e35",
      shadow: "rgba(0, 0, 0, 0.5)",
    },
    term: {
      background: "#15171b",
      foreground: "#d5d9e0",
      cursor: "#d5d9e0",
      selectionBackground: "#2f4366",
      black: "#1c1f24",
      red: "#ff7b72",
      green: "#7fd18b",
      yellow: "#f2c26b",
      blue: "#58a6ff",
      magenta: "#d2a8ff",
      cyan: "#76e3ea",
      white: "#c9d1d9",
      brightBlack: "#6e7681",
      brightRed: "#ffa198",
      brightGreen: "#56d364",
      brightYellow: "#e3b341",
      brightBlue: "#79c0ff",
      brightMagenta: "#d2a8ff",
      brightCyan: "#b3f0ff",
      brightWhite: "#f0f6fc",
    },
  },
  {
    id: "daylight",
    name: "Dia",
    dark: false,
    ui: {
      bg: "#fbfbfc",
      fg: "#24292f",
      card: "#eef0f3",
      border: "#d5d9e0",
      ok: "#1a7f37",
      fail: "#cf222e",
      running: "#9a6700",
      side: "#f1f3f5",
      "side-hover": "#e8ebee",
      "side-active": "#dde2e8",
      muted: "#6e7781",
      dim: "#57606a",
      accent: "#0969da",
      avatar: "#dde2e8",
      shadow: "rgba(31, 35, 40, 0.18)",
    },
    term: {
      background: "#fbfbfc",
      foreground: "#24292f",
      cursor: "#24292f",
      selectionBackground: "#b6d4fe",
      black: "#24292f",
      red: "#cf222e",
      green: "#1a7f37",
      yellow: "#9a6700",
      blue: "#0969da",
      magenta: "#8250df",
      cyan: "#1b7c83",
      white: "#6e7781",
      brightBlack: "#57606a",
      brightRed: "#a40e26",
      brightGreen: "#116329",
      brightYellow: "#7d4e00",
      brightBlue: "#218bff",
      brightMagenta: "#a475f9",
      brightCyan: "#3192aa",
      brightWhite: "#8c959f",
    },
  },
];

export const DEFAULT_THEME_ID = THEMES[0].id;

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Pinta a interface: escreve as cores como variáveis CSS na raiz do documento. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.ui)) root.style.setProperty(`--${key}`, value);
  root.style.colorScheme = theme.dark ? "dark" : "light";
}
