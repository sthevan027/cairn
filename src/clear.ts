/**
 * Comandos que pedem para limpar a tela (`clear` no bash, `cls` e `clear-host` no PowerShell).
 * Só conta o comando sozinho: `cls && ls` não é um pedido de limpar.
 */
export function isClearCommand(command: string): boolean {
  return /^\s*(clear|cls|clear-host)\s*$/i.test(command);
}
