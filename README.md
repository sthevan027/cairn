# Cairn

Terminal para Windows com **blocos de comando** e **IA no prompt**, feito para ser moldado ao gosto de quem o usa.
É o terminal de uso diário do Sthevan, inspirado no [Warp](https://www.warp.dev/).

> **Cairn** é a pilha de pedras que marca uma trilha: cada comando vira um bloco empilhado
> que deixa o rastro do caminho. (Antes era chamado `warp-clone`.)

## Objetivo

Ser um terminal de verdade, do jeito e do gosto de quem o usa, e funcional no dia a dia: prompt, tema, cursor,
texto, atalhos, barra lateral e abas são personalizáveis ao vivo. O contexto do produto (usuário, posicionamento,
restrições e princípios) está em [PRODUCT.md](PRODUCT.md).

Duas restrições guiam as decisões:

- **Windows primeiro.** É a plataforma de referência. Linux é uma intenção para depois e ainda não foi tentado.
- **Terminal de verdade.** O shell roda num PTY real; o app se constrói em cima da sessão e nunca reinterpreta
  um comando.

## Stack

- **Tauri** (shell do app desktop) — Rust no backend, WebView2 no frontend.
- **Rust** — PTY real via `portable-pty` (usa ConPTY no Windows).
- **React + TypeScript** — frontend.
- **xterm.js** — emulação de terminal (parsing VT100/ANSI, grid, cursor).

Mesmo caminho de stack já usado no focusbrew.

## Como funciona por dentro

- **PTY no Windows** (ConPTY) — roda PowerShell, cmd ou Git Bash de verdade dentro do app.
- **Emulação de terminal** — via xterm.js, sem renderizar na mão.
- **Blocos** — cada comando + saída vira um bloco copiável e recolhível, por hooks do shell (marcadores OSC),
  e não por heurística sobre o texto do prompt.
- **IA no prompt** — "descreve o que quer" → comando sugerido (API da Anthropic), colado sem Enter.

## Documentação

- [PRODUCT.md](PRODUCT.md) — contexto do produto: quem usa, posicionamento, restrições e princípios.
- [docs/loja-de-extensoes.md](docs/loja-de-extensoes.md) — spec (rascunho, nada implementado) de uma loja de
  extensões: temas e presets de prompt, com índice assinado.
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

As 4 fases do plano estão implementadas e validadas no Windows (PowerShell 7 e Git Bash):

1. PTY real (ConPTY via `portable-pty`) + xterm.js.
2. Blocos de comando por marcadores OSC 9278 emitidos pelo shell (bash).
3. O mesmo para PowerShell (embrulha `PSConsoleHostReadLine` e `prompt`, preserva `$?`).
4. IA no prompt: `Ctrl+K`, descreve em português, a sugestão é colada no prompt **sem Enter**.

Depois delas entraram: prompt personalizável com editor visual, temas, configurações em quatro abas, atalhos
configuráveis, colagem de texto e imagem, arrastar arquivos para o prompt, atualização pelo próprio app e
instalador assinado.

**Ainda não verificado:** chamada real à API da Anthropic (sem chave na máquina de teste; o
caminho HTTP foi coberto por um servidor mock), Windows PowerShell 5.1, zsh, programas de
tela cheia (vim/less), `Ctrl+C` dentro de blocos e qualquer uso fora do Windows. Ver
[docs/spec.md](docs/spec.md).

## Atalhos e ações

Os atalhos da primeira parte da tabela podem ser trocados em **Configurações → Atalhos** (clique no atalho e
aperte a nova combinação; o app avisa se ela já está em uso). Valem como padrão:

| Atalho / ação | O que faz |
|---|---|
| `Ctrl+K` | barra de IA: descreve o que quer, a sugestão é colada no prompt sem Enter |
| `Ctrl+F` | busca nos blocos (comando e saída); Enter fecha mantendo o filtro, Esc limpa |
| `Ctrl+Shift+T` / `Ctrl+Shift+W` | nova aba / fecha a aba (Ctrl+T e Ctrl+W puros são do shell) |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | próxima / anterior aba |
| `Ctrl+Shift+B` | recolhe/abre a barra lateral |
| `Ctrl+,` (ou o botão no rodapé da barra) | abre as configurações |

Fixos (dependem do shell ou do sistema):

| Atalho / ação | O que faz |
|---|---|
| `Ctrl+C` | com texto selecionado com o mouse, copia; sem seleção, interrompe o comando como sempre |
| `Ctrl+V` / `Shift+Insert` | cola. Texto entra no prompt (o shell recebe como colagem quando suporta); imagem copiada vira o caminho de um PNG temporário |
| botão direito | com seleção, copia; sem seleção, cola |
| arrastar arquivo para a janela | os caminhos entram no prompt da aba ativa, sem Enter |
| `Ctrl+L`, `clear`, `cls`, `Clear-Host` | limpam a tela de blocos |
| `cmd` / `saída` (no cabeçalho do bloco) | copia o comando / a saída sem cores |
| `repetir` | cola o comando do bloco no prompt (não executa) |
| seta `▾` | recolhe/expande a saída do bloco |
| botão direito no `+` | escolhe o shell da nova aba (PowerShell 7, Windows PowerShell, Git Bash) |
| duplo clique no título da aba | renomeia (vazio volta ao automático) |
| barra lateral recolhida | vira uma coluna de ícones das abas (nome e branch no tooltip), com o `+` embaixo |
| ícone da aba | mostra o programa em execução (claude, git, node, python, cargo, docker, vim, ssh...); no prompt, `>_` |

## Configurações e tema

`Ctrl+,` abre as configurações, em quatro abas. Tudo vale ao vivo e é lembrado entre execuções.

- **Personalização** — tudo que dá para moldar, numa página só, com uma **prévia fixa no topo** que mostra
  fonte, espaçamento e cursor na hora, e atalhos para cada seção:
  - **Tema:** Cairn Night (padrão), Grafite e Dia (claro). Pinta a interface e a paleta do terminal.
  - **Texto:** fonte, tamanho, altura da linha e espaço entre letras (valem para o terminal todo).
  - **Cursor:** formato (bloco, sublinhado ou barra), piscando ou não, e cor (ou a do tema).
  - **Shell:** o shell padrão das abas novas.
  - **Abas e barra lateral:** lado (esquerda ou direita), largura, onde entra a aba nova (no fim ou depois da
    atual) e se a aba fecha sozinha quando o shell termina (`exit`).
  - **Prompt:** o editor de widgets, descrito abaixo.
- **IA** — modelo (Opus 5.5, Sonnet 5.5 ou Haiku 5.5) e a chave da Anthropic, guardada e removida ali
  (Credential Manager).
- **Atalhos** — troca dos atalhos do app, com aviso de conflito (ver a tabela acima).
- **Sobre** — versão e atualização do app (ver "Atualização pelo app").

Em janela estreita a navegação das configurações vira uma faixa no topo.

### Prompt personalizável (seção "Prompt" da Personalização)

Dois modos, escolhidos na página:

- **Shell:** o prompt continua sendo o do seu shell (por exemplo o `oh-my-posh`).
- **Cairn:** o shell mostra só o `❯` e o app desenha uma linha de **widgets** acima dele, com as cores do
  tema ativo: usuário, computador, pasta, git (com estado: `+` `~` `?` `↑` `↓`), status e duração do
  último comando, hora, shell e texto livre. Cada widget tem lado (esquerda/direita), estilo (texto,
  pílula, powerline), cores, ícone e opções próprias.

O editor tem prévia ao vivo (dados de exemplo ou da aba atual), reordenar, ligar/desligar, adicionar e
remover widgets, e **importa um `.omp.json` do oh-my-posh** (segmentos session, path, git, status,
executiontime, time, shell e text). A posição da entrada pode ser **no fluxo** ou **fixa embaixo**.

Tudo fica em um arquivo editável à mão, `%APPDATA%\com.sthevandev.cairn\settings.json`; ao salvar o arquivo
o app recarrega sozinho.

Limitação conhecida: no tema claro, um prompt com cores fixas pensadas pra fundo escuro (como o
`oh-my-posh` do Tokyo Night) fica apagado — o terminal não consegue reescrever cores de 24 bits do shell.

## Como rodar

```
bun install
bun run tauri dev      # abre o app (shell padrão: pwsh)
bun run test           # testes do frontend (vitest)
cd src-tauri && cargo test   # PTY, ConPTY, integrações de shell, IA (mock), Credential Manager, clipboard
```

O `bun run tauri dev` abre uma janela de desenvolvimento separada e não mexe no app instalado.

Variáveis de ambiente (todas opcionais):

| Variável | Efeito |
|---|---|
| `CAIRN_SHELL` | shell a abrir (ex.: `C:\Program Files\Git\bin\bash.exe`) |
| `ANTHROPIC_API_KEY` | chave da IA se não houver uma no Credential Manager |
| `CAIRN_AI_MODEL` | modelo da IA só se o app não enviar um (as configurações têm prioridade) |
| `ANTHROPIC_BASE_URL` | URL base da API (útil pra apontar pra um mock) |

Na primeira vez, `Ctrl+K` pede a chave da Anthropic e a guarda no Credential Manager do Windows.

## Instalador

`bun run tauri build` gera o instalador **NSIS** assinado em
`src-tauri/target/release/bundle/nsis/Cairn_<versão>_x64-setup.exe` (instala por usuário, sem pedir
administrador). A assinatura usa o certificado autoassinado `CN=Sthevan.Dev`
(`certificateThumbprint` no `tauri.conf.json`, certificado no `CurrentUser\My`); o instalador, o `cairn.exe`
embutido e o desinstalador saem `Valid`, com carimbo de tempo da DigiCert.

- Só aparece como válido onde a raiz `Sthevan.Dev Root CA` é confiável (neste PC é). Não tira o aviso do
  SmartScreen.
- O `cairn.exe` solto em `target/release` fica sem assinatura: o Tauri assina uma cópia na hora de empacotar.
  Para conferir, extraia o instalador (`7z x`) e rode `Get-AuthenticodeSignature` nos arquivos.
- A cópia de cada versão fica em `releases/v<versão>/` (fora do git).
- Antes de gerar, feche o app de desenvolvimento (ele trava o `.exe`).

## Atualização pelo app

Em **Configurações → Sobre**, "Verificar agora" consulta a última release do GitHub
(`releases/latest/download/latest.json`) e, havendo versão nova, vira "Atualizar agora". O app confere a
assinatura da atualização com uma chave pública embutida (par próprio do Cairn, separado do certificado do
Windows) antes de instalar. A versão 0.1.0 não tinha esse botão; a 0.2.0 em diante tem.

Para publicar a próxima versão:

1. Subir a versão nos três arquivos: `package.json`, `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml`.
2. Gerar o instalador com `TAURI_SIGNING_PRIVATE_KEY` apontando para a chave privada do updater
   (guardada fora do repositório) e `bun run tauri build`.
3. Gerar o `latest.json` com `bun run tools/make-latest-json.ts <versão> "<notas>"`.
4. Commit, tag `v<versão>`, push, e `gh release create v<versão> <instalador> <latest.json> --latest`.

## Ícone

A fonte é `assets/icon.svg`: três pedras empilhadas (o "cairn") nas cores do tema Cairn Night, num quadrado
escuro arredondado. Para regenerar todos os tamanhos depois de editar o SVG:

```
bun run tauri icon assets/icon.svg
```

Se só os ícones mudaram, o Tauri não reexecuta o script de build sozinho e o `.exe` fica com o ícone velho;
force com `touch src-tauri/build.rs` antes de compilar.

## Referências

- [How Warp Works](https://www.warp.dev/blog/how-warp-works)
- [Bringing Warp to Windows: Eng Learnings](https://www.warp.dev/blog/building-warp-on-windows)
- Relacionado localmente: [[Alethe]] (`alethe-agents`, fork com workspace desktop de
  PTYs reais pra agentes de código).

## Vault

Nota de origem (ideia inicial, 02/10/2026) e histórico de pesquisa:
`2-Áreas/Pessoal/Ideias-Futuras.md`, seção "Terminal próprio, no estilo Warp".
