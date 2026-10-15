/**
 * Monta o que vai pro PTY quando o usuário cola. Pura, sem DOM, pra ser testável.
 */

/** Espelha `clipboard::Clip` no Rust: o que estava na área de transferência. */
export type Clip = { kind: "text"; value: string } | { kind: "image"; value: string } | { kind: "empty" };

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey">;

/** Ctrl+V ou Shift+Insert: pedem para colar. */
export function isPasteKey(e: KeyLike): boolean {
  return (e.ctrlKey && !e.altKey && e.key.toLowerCase() === "v") || (e.shiftKey && e.key === "Insert");
}

/** Ctrl+L sozinho: limpa a tela. */
export function isClearKey(e: KeyLike): boolean {
  return e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "l";
}

/**
 * O que escrever no PTY para um conteúdo colado, ou `null` se não há nada colável.
 * Texto vai como colagem (bracketed quando o shell pede); imagem vira o caminho do PNG.
 */
export function clipToInput(clip: Clip, bracketed: boolean): string | null {
  if (clip.kind === "text") return clip.value === "" ? null : toPtyPaste(clip.value, bracketed);
  if (clip.kind === "image") return quotePath(clip.value);
  return null;
}

/** Caminho com espaços ou caracteres especiais vai entre aspas, pra o shell tratar como um argumento só. */
export function quotePath(path: string): string {
  if (!/[\s'"&()[\]{}$`;|<>]/.test(path)) return path;
  return `"${path.replace(/"/g, '\\"')}"`;
}

/** Vários arquivos soltos na aba: um caminho por argumento, separados por espaço, sem Enter. */
export function pathsToInput(paths: string[]): string {
  return paths.map(quotePath).join(" ");
}

/**
 * Texto colado no formato que o shell espera. Quebras de linha viram CR (como o Enter do teclado).
 * Com bracketed paste ligado pelo shell (PSReadLine, bash com readline...), o texto vai entre
 * as marcas ESC[200~ / ESC[201~, pro shell saber que é colagem e não digitação.
 */
export function toPtyPaste(text: string, bracketed: boolean): string {
  const body = text.replace(/\r?\n/g, "\r");
  return bracketed ? `\x1b[200~${body}\x1b[201~` : body;
}
