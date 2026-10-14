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

Fase de pesquisa/planejamento. Nenhum código ainda.

## Referências

- [How Warp Works](https://www.warp.dev/blog/how-warp-works)
- [Bringing Warp to Windows: Eng Learnings](https://www.warp.dev/blog/building-warp-on-windows)
- Relacionado localmente: [[Alethe]] (`alethe-agents`, fork com workspace desktop de
  PTYs reais pra agentes de código).

## Vault

Nota de origem (ideia inicial, 02/10/2026) e histórico de pesquisa:
`2-Áreas/Pessoal/Ideias-Futuras.md`, seção "Terminal próprio, no estilo Warp".
