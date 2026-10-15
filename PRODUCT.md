# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

O usuário é o próprio Sthevan, usando o Cairn como terminal do dia a dia no Windows (PowerShell 7 com oh-my-posh, e Git Bash). É uma ferramenta pessoal feita para o gosto e o fluxo de trabalho dele, e as decisões de produto são dele. O app está em uso real, não é um experimento.

Direção declarada, ainda sem forma definida: criar diferenciais que facilitem o uso do terminal para quem tem medo ou dificuldade com ele. Isso não define o usuário principal hoje.

## Product Purpose

Um terminal feito para o jeito e o gosto do dono, funcional como terminal de verdade. Cada comando vira um bloco (comando, código de saída, duração, saída copiável e recolhível), e a IA entra no prompt: o usuário descreve o que quer em português e o comando sugerido aparece no prompt, sem Enter.

Sucesso é o Cairn ser o terminal que o dono abre todo dia, sem voltar para outro por falta de função ou por atrito.

## Positioning

- **Personalização total:** prompt, tema, cursor, texto, atalhos, barra lateral e abas são editáveis ao vivo, com uma loja de extensões prevista (spec em `docs/loja-de-extensoes.md`).
- **Feito para Windows:** ConPTY e PowerShell são de primeira classe, importa o `.omp.json` do oh-my-posh que o usuário já tem, e é leve (Tauri, não Electron).
- **Linux também:** a intenção declarada é rodar no Linux, depois do Windows.
- **Diferenciais de facilidade de uso:** a serem definidos (ver Users).

## Operating Context

- Janela de desktop (Tauri 2 com WebView2). A interface é web renderizada nessa janela; a plataforma é `web`.
- O shell roda de verdade em um PTY (`portable-pty`, ConPTY no Windows); a emulação de terminal é do xterm.js.
- Os blocos vêm de marcadores OSC 9278 que o próprio shell emite (integração para bash e PowerShell), e não de heurística sobre o texto do prompt.
- A janela tem tamanho mínimo de 480×320 e ocupa a tela do dono em uso normal.
- Atualização pelo app: o botão em Sobre consulta uma release do GitHub, assinada com uma chave própria do updater.

## Capabilities and Constraints

Restrições confirmadas pelo dono:
- **Windows primeiro.** É a plataforma de referência; outras entram depois sem enfraquecê-la.
- **Terminal de verdade.** Os comandos rodam no shell real, em PTY. O app se constrói em cima da sessão e nunca reinterpreta o comando.

Funções hoje (fatos do código, não marcados como inegociáveis):
- Blocos de comando com copiar comando, copiar saída, repetir e recolher; busca nos blocos; várias abas com barra lateral recolhível; ícone da aba pelo programa em execução.
- Prompt em dois modos: o do shell, ou uma linha de widgets desenhada pelo Cairn (estilo texto, pílula ou powerline), com editor visual.
- Configurações em quatro abas (Personalização, IA, Atalhos, Sobre), com prévia ao vivo, e atalhos de teclado configuráveis.
- Colar em uma via só (Ctrl+V, clique direito, imagem copiada vira caminho de arquivo, arrastar arquivo); `clear`, `cls` e Ctrl+L limpam os blocos.
- IA com a chave da Anthropic guardada no Credential Manager do Windows, ou pela variável `ANTHROPIC_API_KEY`.
- Configuração em `settings.json`, editável à mão, que recarrega ao salvar.

Em aberto ou ainda não verificado:
- A IA ainda não foi testada de ponta a ponta com uma chave real (só contra um servidor simulado).
- Windows PowerShell 5.1, zsh e programas de tela cheia (vim, less) não foram verificados.
- Linux e macOS não foram tentados.
- Se a loja de extensões e a possível publicação para outros usuários vão adiante.

## Brand Commitments

- Nome: **Cairn**, a pilha de pedras que marca uma trilha; cada comando vira um bloco empilhado que deixa o rastro do caminho. Antes se chamava `warp-clone`.
- Ícone: três pedras empilhadas (`assets/icon.svg`).
- Idioma da interface: português do Brasil.
- O README ainda diz "projeto de estudo/uso pessoal, não é produto". Hoje o dono o trata como terminal de uso real, então esse trecho está desatualizado.

## Evidence on Hand

- Pesquisa e plano: `docs/pesquisa-warp.md`, `docs/plano.md`, `docs/spec.md`, `docs/execucao.md`, `docs/loja-de-extensoes.md`.
- Uso real: o oh-my-posh do dono funcionando no modo Shell e no modo Cairn.
- Releases: v0.2.0 publicada no GitHub, com o endpoint do updater respondendo.
- Testes: 130 de TypeScript e 25 de Rust, passando.
- Ausências a não fabricar: não há outros usuários, depoimentos nem métricas de uso.

## Product Principles

1. **O terminal do dono, moldado pelo dono.** Cada escolha visual e de comportamento é configurável ao vivo e vive num arquivo legível; o padrão é bom, mas nunca é a única opção.
2. **Terminal de verdade primeiro.** As funções do app ficam em cima da sessão real do shell. Nenhuma delas pode mudar o que um comando faz.
3. **Windows é a referência.** Linux e outras plataformas seguem depois, sem rebaixar a experiência no Windows.
4. **Reduzir o medo do terminal.** Recursos que tornem o terminal menos intimidador são uma direção do produto, a ser definida com o dono antes de entrar.
5. **Mostrar o que aconteceu.** Cada comando deixa um bloco com resultado, duração e saída, para o usuário ver o que rodou sem reconstruir o histórico de cabeça.
