# Como o Warp real é feito

Fontes primárias: [How Warp Works](https://www.warp.dev/blog/how-warp-works) e
[Bringing Warp to Windows](https://www.warp.dev/blog/building-warp-on-windows)
(blog oficial da Warp). Pesquisado em 13/10/2026.

## Stack do Warp de verdade

- Rust puro. Testaram Electron primeiro e abandonaram por performance.
- Renderização direto na GPU, via um framework de UI próprio (**WarpUI**, inspirado
  em Flutter), construído sobre `wgpu`/`winit` — cross-platform (Mac/Linux/Windows)
  com só ~2% de código específico por plataforma.
- Meta de performance: 144+ fps, ~1,9ms por redraw.
- Primitivas de GPU: só retângulos, imagens e glifos (glifos via atlas de textura).
  Shaders de ~200 linhas cada; componentes de UI são compostos a partir dessas
  primitivas.

**Isso é muito mais pesado do que precisamos pra um projeto de estudo.** Nossa
decisão de usar Tauri + xterm.js (DOM/Canvas) em vez de reinventar um engine GPU
está certa pro nosso objetivo (aprender, não vender).

## A peça de lógica que realmente importa: como o Warp sabe onde cada bloco começa e termina

O terminal, por si só, só recebe bytes/sequências VT100 — não sabe quando um comando
começa ou termina, só vê caracteres chegando.

O Warp resolve isso com **hooks do próprio shell**:
- `precmd` (antes do prompt) e `preexec` (antes de executar) — nativos em zsh e fish.
- Em bash, via o script `bash-preexec` (não é nativo).

Esses hooks emitem uma sequência de escape customizada — **DCS (Device Control
String)** contendo **JSON com metadados da sessão/comando**. O Warp faz parse desse
JSON e só aí cria um bloco novo no modelo de dados.

**Sem esses hooks, não tem como separar blocos de forma confiável** — só heurística
de regex em cima do prompt, que é frágil (falha com prompts customizados, comandos
multi-linha, etc.).

## Blocos = um grid por comando

A abordagem tradicional de terminal (um único grid/buffer contínuo) não serve para
blocos, porque:
- a saída de um comando pode se misturar com a do próximo (ex: `printf` sem quebra
  de linha final faz o prompt aparecer na mesma linha da saída anterior);
- sequências de movimento de cursor podem sobrescrever texto de comandos anteriores.

Solução do Warp: cada comando e sua saída recebem **um grid separado**, criado a
partir dos hooks `precmd`/`preexec`. Isso permite buscar, copiar ou colapsar cada
bloco de forma independente.

## PTY no Windows (ConPTY)

O Warp usa ConPTY no Windows — mesma base do `portable-pty` que estamos planejando
usar. Mas tiveram que **forkar o ConPTY** por dois motivos:
1. ConPTY descarta sequências DCS não reconhecidas → trocaram pra **OSC** customizado.
2. Os OSCs chegavam **fora de ordem** em relação à saída do terminal, quebrando a
   captura de blocos → precisaram de flush imediato no fork.
3. ConPTY mantém seu próprio estado de grid/cursor, causando espaçamento errado →
   criaram um OSC de "Reset" enviado em eventos do shell (ex: fim de comando), que
   precisa ser disparado exatamente quando um novo grid é criado no Warp.

Pra renderização no Windows, usam `winit` + `wgpu` (mesma lib do Linux) — por isso o
código específico de plataforma ficou tão pequeno.

### Integração por shell no Windows

- **PowerShell:** integração escrita do zero — não existe precmd/preexec nativo.
  Caminho provável: hooks do PSReadLine ou customizar `$function:prompt`.
- **Git Bash:** criar subprocessos era lento → otimizaram a integração bash pra
  gerar menos subprocessos entre comandos.
- **WSL:** caminhos de arquivo não podem ser assumidos como nativos do Windows.
- cmd.exe: não foi detalhado no material.

## Input editor

O editor de input do Warp é um editor de texto completo, com estrutura de dados
própria chamada **SumTree** (tipo rope, indexável em múltiplas dimensões), guardando
conteúdo do buffer + transformações (dobramento, anotações) + histórico de operações
num modelo **CRDT** (pensado desde o início pra colaboração em tempo real).

**Isso é overkill pro nosso v1.** Um textarea controlado ou um editor leve (CodeMirror)
resolve a necessidade inicial, com espaço pra evoluir depois.

## Decisões de arquitetura do Warp, resumidas

1. Rust + GPU em vez de Electron, priorizando desempenho.
2. Framework de UI próprio e agnóstico de backend de renderização, facilitando portes.
3. Grid por bloco em vez de grid único, trocando fidelidade estrita a VT100 por
   flexibilidade.
4. Hooks de shell + DCS/OSC com JSON pra ter contexto de comandos sem depender de
   parsing de bytes.
5. Editor baseado em operações (CRDT), pensando em colaboração futura.

## O que é aplicável ao nosso clone de estudo

| Peça do Warp | Fazemos igual? | Observação |
|---|---|---|
| Engine GPU próprio (WarpUI) | Não | xterm.js + DOM/Canvas resolve, sem reinventar renderer |
| Hooks `precmd`/`preexec` + DCS/OSC com JSON | **Sim, é o núcleo** | É isso que de fato separa blocos de forma confiável |
| Grid por bloco | Sim | Uma instância/buffer de xterm.js por bloco |
| ConPTY no Windows | Sim | Via `portable-pty`, que já usa ConPTY por baixo |
| Fork do ConPTY (OSC reorder fix) | Avaliar depois | Só se a ordem de eventos virar problema real na prática |
| SumTree + CRDT no input editor | Não, no v1 | Textarea ou CodeMirror resolve pro estudo |
| IA no prompt | Sim, mas separado | Feature independente, chamada simples à API |
