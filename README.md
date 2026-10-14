# warp-clone

Terminal próprio, estilo Warp — projeto de **estudo/uso pessoal**, não é produto.

## Objetivo

Aprender, na prática, como um terminal moderno com blocos de comando e IA no prompt
funciona por dentro, construindo uma versão simplificada do [Warp](https://www.warp.dev/).

## Stack

- **Tauri** (shell do app desktop) — Rust no backend, WebView2 no frontend.
- **Rust** — PTY real via `portable-pty` (usa ConPTY no Windows).
- **React + TypeScript** — frontend.
- **xterm.js** — emulação de terminal (parsing VT100/ANSI, grid, cursor).

Mesmo caminho de stack já usado no focusbrew.

## O que esse clone pretende ensinar

- **PTY no Windows** (ConPTY) — rodar PowerShell/cmd de verdade dentro do app.
- **Emulação de terminal** — via xterm.js em vez de renderizar na mão.
- **Blocos** — separar cada comando + saída em um bloco copiável/recolhível, via
  hooks de shell (não regex/heurística de prompt).
- **IA no prompt** — "descreve o que quer" → comando sugerido (API da Anthropic).

## Documentação

- [docs/pesquisa-warp.md](docs/pesquisa-warp.md) — como o Warp real é feito (stack,
  arquitetura de renderização, PTY/shell integration, modelo de blocos) e o que disso
  é aplicável aqui.
- [docs/plano.md](docs/plano.md) — ordem de ataque sugerida e decisões em aberto.
- [docs/spec.md](docs/spec.md) — spec técnica das 4 fases de implementação (PTY
  básico, blocos bash/zsh, blocos PowerShell, IA no prompt): escopo, estrutura de
  dados, critério de "pronto" e riscos de cada uma.
- [docs/execucao.md](docs/execucao.md) — plano de execução: checklist concreto de
  tarefas (setup + cada fase) pra sair do papel e começar a codar.

## Status

As 4 fases estão implementadas e validadas no Windows (PowerShell 7 e Git Bash):

1. PTY real (ConPTY via `portable-pty`) + xterm.js.
2. Blocos de comando por marcadores OSC 9278 emitidos pelo shell (bash).
3. O mesmo para PowerShell (embrulha `PSConsoleHostReadLine` e `prompt`, preserva `$?`).
4. IA no prompt: `Ctrl+K`, descreve em português, a sugestão é colada no prompt **sem Enter**.

**Ainda não verificado:** chamada real à API da Anthropic (sem chave na máquina de teste; o
caminho HTTP foi coberto por um servidor mock), Windows PowerShell 5.1, zsh, programas de
tela cheia (vim/less) e `Ctrl+C` dentro de blocos. Ver [docs/spec.md](docs/spec.md).

## Como rodar

```
bun install
bun run tauri dev      # abre o app (shell padrão: pwsh)
bun run test           # testes do frontend (separador de OSC)
cd src-tauri && cargo test   # PTY, ConPTY, integrações de shell, IA (mock), Credential Manager
```

Variáveis de ambiente (todas opcionais):

| Variável | Efeito |
|---|---|
| `WARP_SHELL` | shell a abrir (ex.: `C:\Program Files\Git\bin\bash.exe`) |
| `ANTHROPIC_API_KEY` | chave da IA se não houver uma no Credential Manager |
| `WARP_AI_MODEL` | modelo da IA (padrão `claude-opus-5-5`, effort `low`) |
| `ANTHROPIC_BASE_URL` | URL base da API (útil pra apontar pra um mock) |

Na primeira vez, `Ctrl+K` pede a chave da Anthropic e a guarda no Credential Manager do Windows.

## Referências

- [How Warp Works](https://www.warp.dev/blog/how-warp-works)
- [Bringing Warp to Windows: Eng Learnings](https://www.warp.dev/blog/building-warp-on-windows)
- Relacionado localmente: [[Alethe]] (`alethe-agents`, fork com workspace desktop de
  PTYs reais pra agentes de código).

## Vault

Nota de origem (ideia inicial, 02/10/2026) e histórico de pesquisa:
`2-Áreas/Pessoal/Ideias-Futuras.md`, seção "Terminal próprio, no estilo Warp".
