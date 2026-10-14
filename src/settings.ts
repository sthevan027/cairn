import { useSyncExternalStore } from "react";
import { DEFAULT_THEME_ID, THEMES } from "./themes";

export interface Settings {
  theme: string;
  fontFamily: string;
  fontSize: number;
  cursorBlink: boolean;
  /** Caminho do shell das abas novas; `null` deixa o backend escolher (pwsh se existir). */
  defaultShell: string | null;
  aiModel: string;
}

export const DEFAULT_AI_MODEL = "claude-opus-5-5";

export const DEFAULTS: Settings = {
  theme: DEFAULT_THEME_ID,
  fontFamily: "CaskaydiaCove Nerd Font Mono",
  fontSize: 14,
  cursorBlink: true,
  defaultShell: null,
  aiModel: DEFAULT_AI_MODEL,
};

export const FONT_SIZE_RANGE = { min: 10, max: 24 } as const;
const FONT_FALLBACKS = '"Cascadia Code", Consolas, monospace';

/** Monta a lista de fontes do CSS a partir do nome digitado (sem deixar aspas/chaves escaparem). */
export function fontStack(name: string): string {
  const clean = name.replace(/["'\\;{}<>]/g, "").trim();
  return clean ? `"${clean}", ${FONT_FALLBACKS}` : FONT_FALLBACKS;
}

/** Aceita qualquer coisa vinda do disco e devolve configurações válidas (campo ruim cai no padrão). */
export function normalizeSettings(raw: unknown): Settings {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (value: unknown, fallback: string, max = 80) =>
    typeof value === "string" && value.trim() && value.length <= max ? value.trim() : fallback;

  const size = Number(input.fontSize);
  return {
    theme: THEMES.some((t) => t.id === input.theme) ? (input.theme as string) : DEFAULTS.theme,
    fontFamily: text(input.fontFamily, DEFAULTS.fontFamily, 60),
    fontSize: Number.isFinite(size)
      ? Math.min(FONT_SIZE_RANGE.max, Math.max(FONT_SIZE_RANGE.min, Math.round(size)))
      : DEFAULTS.fontSize,
    cursorBlink: typeof input.cursorBlink === "boolean" ? input.cursorBlink : DEFAULTS.cursorBlink,
    defaultShell: typeof input.defaultShell === "string" && input.defaultShell.trim() ? input.defaultShell : null,
    aiModel: text(input.aiModel, DEFAULTS.aiModel),
  };
}

const KEY = "cairn.settings";

function load(): Settings {
  try {
    const stored = localStorage.getItem(KEY);
    return normalizeSettings(stored ? JSON.parse(stored) : null);
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* sem armazenamento: vale só nesta execução */
  }
}

let current: Settings = load();
const listeners = new Set<() => void>();

export const getSettings = () => current;

export function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function updateSettings(patch: Partial<Settings>) {
  current = normalizeSettings({ ...current, ...patch });
  save(current);
  listeners.forEach((fn) => fn());
}

export function resetSettings() {
  updateSettings({ ...DEFAULTS });
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}
