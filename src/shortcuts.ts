/**
 * Atalhos de teclado do app. Cada ação tem uma combinação no formato `Ctrl+Shift+T`.
 * Módulo puro (sem DOM além do tipo do evento) pra ser testável.
 */

export const ACTIONS = [
  { id: "newTab", label: "Nova aba", default: "Ctrl+Shift+T" },
  { id: "closeTab", label: "Fechar aba", default: "Ctrl+Shift+W" },
  { id: "nextTab", label: "Próxima aba", default: "Ctrl+Tab" },
  { id: "prevTab", label: "Aba anterior", default: "Ctrl+Shift+Tab" },
  { id: "toggleSidebar", label: "Mostrar ou esconder a barra lateral", default: "Ctrl+Shift+B" },
  { id: "openSettings", label: "Abrir configurações", default: "Ctrl+," },
  { id: "aiBar", label: "Barra de IA", default: "Ctrl+K" },
  { id: "search", label: "Buscar nos blocos", default: "Ctrl+F" },
] as const;

export type ActionId = (typeof ACTIONS)[number]["id"];
export type Shortcuts = Record<ActionId, string>;

export const DEFAULT_SHORTCUTS: Shortcuts = Object.fromEntries(ACTIONS.map((a) => [a.id, a.default])) as Shortcuts;

/** Ligado enquanto a tela de atalhos grava uma combinação: os atalhos do app ficam quietos. */
export const recorder = { active: false };

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

/** Nome da tecla como aparece na combinação (letras em maiúsculas; Esc, Tab etc. como estão). */
function keyName(key: string): string {
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * Combinação canônica a partir de um evento, ou `null` se for só um modificador.
 * Ordem fixa: Ctrl, Alt, Shift, tecla.
 */
export function comboFromEvent(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey">): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(keyName(e.key));
  return parts.join("+");
}

/**
 * Aceita e padroniza uma combinação digitada à mão (`ctrl+shift+t` vira `Ctrl+Shift+T`).
 * Rejeita combinação sem Ctrl ou Alt: tecla solta ou só Shift roubaria o que o usuário digita.
 */
export function normalizeCombo(input: string): string | null {
  const parts = input.split("+").map((p) => p.trim());
  // "Ctrl+," tem vírgula como tecla; "Ctrl++" tem o próprio + (vira parte vazia no fim).
  if (parts.length > 1 && parts[parts.length - 1] === "" && parts[parts.length - 2] === "") {
    parts.splice(parts.length - 2, 2, "+");
  }
  const key = parts[parts.length - 1];
  if (!key) return null;
  const mods = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()));
  for (const m of mods) if (!["ctrl", "alt", "shift"].includes(m)) return null;
  if (!mods.has("ctrl") && !mods.has("alt")) return null;
  if (MODIFIER_KEYS.has(key)) return null;
  return comboFromEvent({
    key: key.length === 1 ? key : key[0].toUpperCase() + key.slice(1),
    ctrlKey: mods.has("ctrl"),
    altKey: mods.has("alt"),
    shiftKey: mods.has("shift"),
  });
}

/** O evento é exatamente esta combinação? */
export function matches(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey">, combo: string): boolean {
  return comboFromEvent(e) === combo;
}

/**
 * Aceita qualquer coisa vinda do disco: combinação inválida volta ao padrão, e quando duas ações
 * ficam com a mesma combinação a segunda volta ao padrão (se o padrão também colidir, sai sem atalho).
 */
export function normalizeShortcuts(raw: unknown): Shortcuts {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const result = { ...DEFAULT_SHORTCUTS };
  const used = new Map<string, ActionId>();
  for (const action of ACTIONS) {
    const value = typeof input[action.id] === "string" ? normalizeCombo(input[action.id] as string) : null;
    let combo = value ?? action.default;
    if (used.has(combo)) combo = action.default;
    if (used.has(combo)) combo = "";
    result[action.id] = combo;
    if (combo) used.set(combo, action.id);
  }
  return result;
}

/** Ação que já usa esta combinação (para avisar de conflito na tela), fora a própria. */
export function conflictFor(shortcuts: Shortcuts, action: ActionId, combo: string): ActionId | null {
  const other = ACTIONS.find((a) => a.id !== action && shortcuts[a.id] === combo);
  return other ? other.id : null;
}
