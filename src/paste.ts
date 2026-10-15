/**
 * Monta o que vai pro PTY quando o usuário cola. Pura, sem DOM, pra ser testável.
 */

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
