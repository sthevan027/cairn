# Plano — ordem de ataque

Projeto de estudo. Objetivo é aprender incrementalmente, não entregar tudo de uma vez.

## Ordem sugerida

1. **PTY básico** — `portable-pty` (Rust, lado Tauri) + xterm.js (frontend) rodando
   um terminal "burro": um único buffer, sem blocos ainda. Validar que PowerShell/cmd
   roda de verdade dentro do app via ConPTY.
2. **Blocos via hook de shell** — começar por bash/zsh (tem `precmd`/`preexec`
   nativo ou via `bash-preexec`, é mais simples que PowerShell). Emitir uma sequência
   de escape customizada (DCS ou OSC) com JSON marcando início/fim de comando, e usar
   isso pra separar a saída em blocos (uma instância de xterm.js por bloco).
3. **Portar a lógica de blocos pra PowerShell** — mais difícil, sem precmd/preexec
   nativo. Caminho provável: hooks do PSReadLine ou customizar `$function:prompt`
   pra emitir a mesma sequência de escape.
4. **IA no prompt** — feature separada, por último. Campo de texto livre → chamada à
   API da Anthropic → comando sugerido. Não depende de blocos nem de PTY, pode ser
   prototipado em paralelo se quiser.

## Decisões em aberto

- **Shell principal a mirar primeiro:** bash/zsh (mais simples de implementar) ou
  PowerShell (é o que o Sthevan usa de verdade no dia a dia)? Pesquisa aponta
  bash/zsh como mais fácil pra validar o conceito de blocos antes de enfrentar o
  caso mais difícil (PowerShell).
- **Lidar com ordem de eventos OSC vs. saída no Windows:** o Warp precisou forkar o
  ConPTY por causa disso. Avaliar se isso aparece na prática antes de decidir se
  vale a pena um fork ou um workaround mais simples (buffer até confirmar fim de
  bloco).
- **Editor de input:** textarea simples vs. CodeMirror embutido. Decidir quando
  chegar nessa etapa.

## Fora de escopo (v1)

- Engine de renderização GPU própria.
- CRDT / colaboração em tempo real no input editor.
- Suporte a cmd.exe e WSL.
