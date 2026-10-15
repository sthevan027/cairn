import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { defaultPrompt, normalizePrompt, type PromptConfig } from "./promptConfig";
import { DEFAULT_THEME_ID, THEMES } from "./themes";

export interface Settings {
  theme: string;
  fontFamily: string;
  fontSize: number;
  cursorBlink: boolean;
  /** Formato do cursor da linha de digitação. */
  cursorStyle: CursorStyle;
  /** `#rrggbb` do cursor; vazio usa a cor do tema. */
  cursorColor: string;
  /** Caminho do shell das abas novas; `null` deixa o backend escolher (pwsh se existir). */
  defaultShell: string | null;
  aiModel: string;
  prompt: PromptConfig;
}

export const CURSOR_STYLES = ["block", "underline", "bar"] as const;
export type CursorStyle = (typeof CURSOR_STYLES)[number];

export const DEFAULT_AI_MODEL = "claude-opus-5-5";

export const DEFAULTS: Settings = {
  theme: DEFAULT_THEME_ID,
  fontFamily: "CaskaydiaCove Nerd Font Mono",
  fontSize: 14,
  cursorBlink: true,
  cursorStyle: "block",
  cursorColor: "",
  defaultShell: null,
  aiModel: DEFAULT_AI_MODEL,
  prompt: defaultPrompt(),
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
    cursorStyle: CURSOR_STYLES.includes(input.cursorStyle as CursorStyle)
      ? (input.cursorStyle as CursorStyle)
      : DEFAULTS.cursorStyle,
    cursorColor: typeof input.cursorColor === "string" && /^#[0-9a-fA-F]{6}$/.test(input.cursorColor) ? input.cursorColor : "",
    defaultShell: typeof input.defaultShell === "string" && input.defaultShell.trim() ? input.defaultShell : null,
    aiModel: text(input.aiModel, DEFAULTS.aiModel),
    prompt: normalizePrompt(input.prompt),
  };
}

/** Texto do arquivo `settings.json`; `null` se não for um JSON utilizável. */
export function parseSettingsFile(text: string): Settings | null {
  try {
    return normalizeSettings(JSON.parse(text));
  } catch {
    return null;
  }
}

export const serializeSettings = (settings: Settings) => JSON.stringify(settings, null, 2);

// ---- armazenamento: arquivo no disco (editável à mão), localStorage só como reserva ----

const LEGACY_KEY = "cairn.settings";
const WRITE_DELAY_MS = 200;

let current: Settings = normalizeSettings(null);
let writeTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function readLegacy(): Settings | null {
  try {
    const stored = localStorage.getItem(LEGACY_KEY);
    return stored ? parseSettingsFile(stored) : null;
  } catch {
    return null;
  }
}

async function persist() {
  const text = serializeSettings(current);
  try {
    await invoke("write_settings", { json: text });
  } catch {
    try {
      localStorage.setItem(LEGACY_KEY, text); // sem backend (ex.: rodando só no navegador)
    } catch {
      /* vale só nesta execução */
    }
  }
}

function schedulePersist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => void persist(), WRITE_DELAY_MS);
}

function notify() {
  listeners.forEach((fn) => fn());
}

/** O arquivo foi editado por fora: recarrega sem reescrevê-lo e ignora JSON quebrado no meio da edição. */
function applyExternal(text: string) {
  const next = parseSettingsFile(text);
  if (!next || serializeSettings(next) === serializeSettings(current)) return;
  current = next;
  notify();
}

/** Carrega o arquivo (migrando o localStorage antigo na primeira vez) e passa a vigiar edições. */
export async function initSettings(): Promise<void> {
  try {
    const text = await invoke<string | null>("read_settings");
    if (text !== null) {
      current = parseSettingsFile(text) ?? current;
    } else {
      current = readLegacy() ?? current;
      await persist();
    }
    await listen<string>("settings-file-changed", (event) => applyExternal(event.payload));
  } catch {
    current = readLegacy() ?? current;
  }
}

export const getSettings = () => current;

export function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function updateSettings(patch: Partial<Settings>) {
  current = normalizeSettings({ ...current, ...patch });
  notify();
  schedulePersist();
}

export function resetSettings() {
  updateSettings(normalizeSettings(null));
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}
