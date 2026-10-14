# Cairn

Terminal próprio, estilo Warp — projeto de **estudo/uso pessoal**, não é produto.

> **Cairn** é a pilha de pedras que marca uma trilha: cada comando vira um bloco empilhado
> que deixa o rastro do caminho. (Antes era chamado `warp-clone`.)

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

## Atalhos e ações

| Atalho / ação | O que faz |
|---|---|
| `Ctrl+K` | barra de IA: descreve o que quer, a sugestão é colada no prompt sem Enter |
| `Ctrl+F` | busca nos blocos (comando e saída); Enter fecha mantendo o filtro, Esc limpa |
| `Ctrl+C` | com texto selecionado com o mouse, copia; sem seleção, interrompe o comando como sempre |
| `cmd` / `saída` (no cabeçalho do bloco) | copia o comando / a saída sem cores |
| `repetir` | cola o comando do bloco no prompt (não executa) |
| seta `▾` | recolhe/expande a saída do bloco |
| `Ctrl+Shift+T` / `Ctrl+Shift+W` | nova aba / fecha a aba (Ctrl+T e Ctrl+W puros são do shell) |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | próxima / anterior aba |
| `Ctrl+Shift+B` | recolhe/abre a barra lateral |
| `Ctrl+,` (ou o botão no rodapé da barra) | abre as configurações |
| botão direito no `+` | escolhe o shell da nova aba (PowerShell 7, Windows PowerShell, Git Bash) |
| duplo clique no título da aba | renomeia (vazio volta ao automático) |
| barra lateral recolhida | vira uma coluna de ícones das abas (nome e branch no tooltip), com o `+` embaixo |
| ícone da aba | mostra o programa em execução (claude, git, node, python, cargo, docker, vim, ssh...); no prompt, `>_` |

## Configurações e tema

`Ctrl+,` abre a página de configurações (Aparência, Terminal, IA, Atalhos, Sobre). Tudo vale ao
vivo e é lembrado entre execuções:

- **Tema:** Cairn Night (padrão), Grafite e Dia (claro). Pinta a interface e a paleta do terminal.
- **Fonte, tamanho e cursor piscando**, com prévia.
- **Shell padrão** das abas novas e **modelo da IA** (Opus 5.5, Sonnet 5.5 ou Haiku 5.5); a chave da
  Anthropic também é guardada/removida ali (Credential Manager).

Limitação conhecida: no tema claro, um prompt com cores fixas pensadas pra fundo escuro (como o
`oh-my-posh` do Tokyo Night) fica apagado — o terminal não consegue reescrever cores de 24 bits do shell.

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
| `CAIRN_SHELL` | shell a abrir (ex.: `C:\Program Files\Git\bin\bash.exe`) |
| `ANTHROPIC_API_KEY` | chave da IA se não houver uma no Credential Manager |
| `CAIRN_AI_MODEL` | modelo da IA só se o app não enviar um (as configurações têm prioridade) |
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
