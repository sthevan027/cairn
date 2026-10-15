import type { NewTabPosition } from "./settings";

/**
 * Lista de abas com a aba nova já encaixada: no fim, ou logo depois da aba ativa
 * (se a ativa não existir mais, vai pro fim).
 */
export function insertTab<T extends { id: number }>(
  tabs: T[],
  tab: T,
  activeId: number,
  position: NewTabPosition,
): T[] {
  const at = tabs.findIndex((t) => t.id === activeId);
  if (position !== "afterCurrent" || at < 0) return [...tabs, tab];
  return [...tabs.slice(0, at + 1), tab, ...tabs.slice(at + 1)];
}
