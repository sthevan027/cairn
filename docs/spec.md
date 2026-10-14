# Spec de implementação — 4 fases

Baseado em [pesquisa-warp.md](pesquisa-warp.md) e [plano.md](plano.md). Cada fase
assume a anterior pronta. Critério geral: cada fase termina quando dá pra usar o
terminal de verdade no dia a dia nesse estágio, não só em teste isolado.

---

## Arquitetura final (o que foi construído e por que difere do plano)

**Terminal sombra em vez de um terminal por bloco.** O plano original rodava um xterm.js por
bloco e roteava os bytes entre eles. Isso quebrou com o PSReadLine do Sthevan
(`PredictionViewStyle: ListView`): ele redesenha a linha com **posicionamento absoluto**
(`ESC[8;4H` = linha 8 da tela do ConPTY), e coordenadas absolutas só fazem sentido num
terminal que espelha a tela inteira do ConPTY. Com o fluxo fatiado, o prompt saía
corrompido. Solução (mesma raiz do "grid do ConPTY" que o Warp resolveu forkando):

- Um único terminal xterm "sombra" recebe **todos** os bytes, na ordem, e espelha o ConPTY.
- Os marcadores só dizem *onde* (linha do buffer, via `IMarker`) cada comando começa e termina.
- A região **ao vivo** (prompt, ou a saída de um comando em execução) é um recorte CSS do
  terminal sombra, da linha do marcador até o cursor/último texto.
- Ao terminar (`post`), as linhas do comando são copiadas com `@xterm/addon-serialize` para um
  xterm estático (cores preservadas): isso vira o corpo do bloco.
- Programa de tela cheia (buffer alternativo) esconde os blocos e mostra o terminal inteiro.

Outros achados de implementação:

- O xterm 6 usa o `ScrollableElement` do VS Code, que consome toda roda do mouse sobre ele;
  a roda é interceptada em fase de captura no container e rola a página manualmente.
- O ConPTY pergunta a posição do cursor (`ESC[6n`) na abertura; o xterm.js responde sozinho,
  mas qualquer teste headless precisa responder `ESC[1;1R` senão o shell trava.
- `$?` do PowerShell: o wrapper de `prompt` precisa devolvê-lo falso (via
  `Write-Error -ErrorAction Ignore`) antes de chamar o prompt original, senão o oh-my-posh
  nunca mostra erro.

## Polimento (14/10/2026)

Ações por bloco (copiar comando/saída, repetir, recolher), busca com `Ctrl+F` e `Ctrl+C` que
copia a seleção. Armadilhas encontradas no teste ao vivo:

- O Enter que fecha uma barra (busca/IA) precisa de `preventDefault`: sem isso o `keypress`
  cai no terminal quando o foco volta e executa uma linha vazia (ou, na IA, executaria a
  sugestão colada).
- Esconder bloco com `display:none` quebra o xterm: ele mede a largura do caractere ao abrir,
  e um bloco que nasce escondido sai com letras espaçadas. O filtro usa altura zero +
  `visibility:hidden`.
- A saída "sem cores" para copiar/buscar é guardada como texto puro no momento em que o bloco
  termina (`translateToString`), separada da cópia serializada com cores.
- Fora do escopo por enquanto: abas, ícone próprio, atalhos de navegação entre blocos.

## Abas e barra lateral (14/10/2026)

Inspirado nas specs de produto do Warp (`specs/APP-3648`, `APP-3578`, `APP-3832` no repositório
`warpdotdev/warp`; o framework de UI deles é MIT, o resto AGPL, então só o comportamento serviu
de referência, nenhum código foi copiado).

- **Backend:** `PtyState` virou um mapa de sessões por id; `write_to_pty`/`resize_pty`/`kill_pty`
  recebem o id; `spawn_shell` não mata mais a anterior. Novos comandos: `git_branch(cwd)`
  (aceita o `/c/...` do Git Bash) e `available_shells()` (menu do `+`).
- **Frontend:** uma `Session` por aba. Abas inativas ficam montadas com `visibility:hidden` (não
  `display:none`, pelo mesmo motivo do filtro de busca) e só a ativa pega o foco do teclado.
- **Item da aba:** título = comando em execução, senão a pasta do cwd, senão "Terminal"; subtítulo =
  branch git, senão o nome do shell; selo de status: spinner (rodando), verde (ok), vermelho (erro).
- `exit` no shell fecha a aba; fechar a última cria outra.
- Atalhos usam Ctrl+Shift porque Ctrl+T/W/B puros são do readline (transpor, apagar palavra, voltar).
- Fora do escopo: painéis divididos, "hover detail", configurações e tema (próximas fatias).

## Fase 4 — decisões tomadas

- Modelo `claude-opus-5-5` com `output_config.effort = "low"` (pensamento não pode ser
  desligado nesse modelo; effort baixo mantém a latência razoável). Trocável por `CAIRN_AI_MODEL`.
- `fallbacks: "default"` + header `anthropic-beta: server-side-fallback-2026-07-01` só quando o
  modelo é o padrão (para outros modelos o parâmetro pode dar 400). `stop_reason: "refusal"`
  vira mensagem na barra.
- Contexto enviado: pedido, shell, diretório atual e os últimos 5 comandos com exit code.
  **Nunca** a saída dos comandos.
- A sugestão é sanitizada (uma linha, sem controle/ESC/quebra) e colada com `term.paste()`:
  nunca executa sozinha.
- Chave: Credential Manager (`keyring`) → `ANTHROPIC_API_KEY`. O erro da API nunca ecoa a chave.
- Sem SDK oficial para Rust: HTTP direto com `reqwest`, conforme a referência da API.
- **Pendente:** validar com chave real; os testes cobrem corpo, headers, parsing, recusa e erro
  via servidor mock.

---

## Fase 1 — PTY básico

### Objetivo
Terminal "burro" funcionando: um shell real rodando dentro do app Tauri, sem blocos,
sem IA. Só validar a fundação (PTY + emulação).

### Escopo
- App Tauri mínimo: uma janela, um componente de terminal full-screen.
- Backend Rust: spawna um processo de shell (PowerShell por padrão no Windows, com
  variável de ambiente ou config pra trocar) via `portable-pty`.
- Stream bidirecional PTY ↔ frontend via evento Tauri (`emit`/`listen`) ou IPC
  (`invoke`) — dados crus (bytes) do PTY pro frontend, e teclado do frontend pro PTY.
- Frontend: xterm.js renderizando o output, capturando input de teclado e mouse
  (seleção, scroll, resize).
- Resize: PTY precisa saber o tamanho do terminal (`portable-pty` tem `resize()`) e
  isso precisa ser chamado quando a janela do app muda de tamanho (`fit` addon do
  xterm.js calcula cols/rows).

### Estrutura de dados / módulos (Rust)
```
struct PtySession {
    master: Box<dyn MasterPty>,
    child: Box<dyn Child>,
    writer: Box<dyn Write + Send>,
}
```
- Um `PtySession` por janela/aba (por enquanto, só uma).
- Thread de leitura dedicada: lê do `master` em loop e emite pro frontend (bytes ou
  string UTF-8 lossy).

### Fora de escopo nesta fase
- Blocos, hooks de shell, IA.
- Múltiplas abas/painéis (fica pra depois, se quiser).

### Critério de "pronto"
- Abre o app, aparece um prompt do PowerShell de verdade.
- Roda comandos interativos (ex: `npm create`, algo que pede input) sem travar.
- Resize da janela não quebra o layout do texto.
- Scroll pra cima funciona (histórico de output).

### Riscos conhecidos
- Encoding: PowerShell no Windows pode emitir em páginas de código diferentes de
  UTF-8 dependendo do console — testar com acentos/emoji no output.
- Performance de leitura: ler byte a byte é lento; ler em chunks (buffer de 4-8KB)
  evita gargalo.

---

## Fase 2 — Blocos via hook de shell (bash/zsh primeiro)

### Objetivo
Separar comando + saída em blocos distintos, usando hooks reais do shell — não
heurística de regex em cima do prompt.

### Por que bash/zsh primeiro
Têm hook nativo (`precmd`/`preexec` no zsh/fish) ou via script conhecido
(`bash-preexec`). PowerShell não tem equivalente nativo — fica pra fase 3.

### Escopo
1. **Script de integração** injetado no shell (via `$PROMPT_COMMAND`/`precmd` no
   bash, ou funções nativas no zsh) que emite uma sequência de escape customizada
   em 3 pontos:
   - antes de executar o comando (preexec) → marca "início de bloco", com o texto
     do comando.
   - depois do comando terminar (precmd), antes do próximo prompt → marca "fim de
     bloco", com exit code e timestamp.
2. **Formato da sequência de escape (DECIDIDO):** OSC privado `9278` (OSC e não DCS:
   o ConPTY descarta DCS desconhecida, mas repassa OSC). O payload é texto simples com
   base64 nos campos livres, porque montar JSON dentro de bash é frágil:
   ```
   ESC ] 9278 ; pre  ; <base64 do comando>            BEL   (antes de executar)
   ESC ] 9278 ; post ; <exit code> ; <base64 do cwd>  BEL   (depois, antes do prompt)
   ```
   **Achado medido (ConPTY):** o OSC é entregue na hora, mas o texto só é renderizado no
   frame seguinte (~16ms), então o marcador chega *antes* do texto que o precede.
   Teste de estresse com 200 sequências texto→OSC→texto: **0 ms de atraso = 199 fora de
   ordem; 5 ms = 8; 20 ms = 0**. A integração faz `sleep 0.025` antes de cada OSC. É a
   versão "sem fork" do problema que o Warp resolveu forkando o ConPTY
   (`src-tauri/tests/conpty_osc.rs`).
3. **Parser no lado do xterm.js:** usar a API de parser customizado do xterm.js
   (`registerOscHandler`) pra capturar essas sequências sem quebrar o parsing VT100
   normal.
4. **Modelo de dados do frontend:**
   ```ts
   type Block = {
     id: string;
     command: string;
     startedAt: number;
     finishedAt: number | null;
     exitCode: number | null;
     // instância de xterm.js (ou buffer) dedicada a este bloco
   };
   ```
5. **UI:** cada `Block` renderiza como um container próprio (header com comando +
   status/exit code, corpo com a instância de xterm.js daquele bloco). Ao receber
   `preexec`, cria um novo `Block` e uma nova instância/buffer de xterm.js; todo
   output do PTY a partir daí vai pra essa instância, até o próximo `preexec`.

### Fora de escopo nesta fase
- PowerShell (fase 3).
- Edição/colapso/busca nos blocos (UI polish, não é o core da lógica).

### Critério de "pronto"
- Rodar 3 comandos em sequência no bash/zsh gera 3 blocos visualmente separados,
  cada um com seu próprio exit code.
- Um comando que gera saída sem quebra de linha final (ex: `printf "x"`) não
  quebra a separação do bloco seguinte.
- Comando interativo (ex: `vim`) ainda funciona dentro do bloco (não trava a
  detecção de blocos).

### Riscos conhecidos
- Comandos multi-linha (heredoc, `&&` em várias linhas) podem disparar `preexec`
  mais de uma vez ou nenhuma — testar e documentar o comportamento real.
- Sub-shells (`bash` dentro de `bash`) podem não ter os hooks carregados.

---

## Fase 3 — Portar a lógica de blocos pro PowerShell

### Objetivo
Mesmo resultado da fase 2, mas em PowerShell (o shell que o Sthevan usa de verdade).

### Por que é mais difícil
PowerShell não tem `precmd`/`preexec`. As opções reais:
- **`$function:prompt`** — redefinir a função `prompt` do PowerShell pra emitir o
  OSC de "fim de bloco anterior / início do prompt" antes de retornar o texto do
  prompt. Mais simples de implementar, mas só cobre a borda "prompt apareceu", não
  "comando está prestes a rodar".
- **PSReadLine hooks** — `Set-PSReadLineKeyHandler` pra interceptar o Enter e
  emitir o OSC de "preexec" com o conteúdo do buffer de input antes de executar.
  Mais fiel ao modelo precmd/preexec, mas depende do módulo PSReadLine estar
  carregado (é padrão desde PS 5.1+, então ok).

**Decisão (implementada):** não usar o handler de Enter do PSReadLine. Ele roda *antes*
da renderização final da linha, então o marcador chegaria no meio do texto. No lugar:
- **preexec** = embrulhar a função `PSConsoleHostReadLine` (mesma técnica do shell
  integration do VS Code). Roda depois que o PSReadLine devolve a linha, já renderizada
  e com a quebra de linha feita.
- **precmd** = embrulhar `prompt`. Detalhe crítico: os comandos do wrapper zeram `$?`,
  e prompts como o oh-my-posh leem `$?` pra pintar o erro. O wrapper captura `$?` no
  início e, se era falso, devolve com `Write-Error ... -ErrorAction Ignore` antes de
  chamar o prompt original. Coberto por teste (`tests/pwsh_integration.rs`).
- Enter vazio não gera bloco (o `pre` só sai pra linha não vazia).
- O perfil do usuário **não** é desligado (sem `-NoProfile`): carrega normal e a
  integração embrulha o `prompt` que ele definiu.
- Limitação conhecida: o exit code de erro de *cmdlet* usa `$LASTEXITCODE` se ele for
  diferente de zero; se um comando externo falhou antes, esse valor antigo pode aparecer.

### Escopo
1. Script `.ps1` de integração (`integration/pwsh-integration.ps1`, só ASCII por causa
   do Windows PowerShell 5.1), carregado no spawn via `-NoExit -Command ". 'script'"`.
2. Mesmo formato de OSC da fase 2 (reaproveitar o parser do frontend sem mudanças).
3. Exit code: `$LASTEXITCODE` pra comandos externos, `$?` como fallback (cmdlets
   PowerShell não setam `$LASTEXITCODE` sempre).

### Fora de escopo nesta fase
- cmd.exe, WSL (mencionados no plano como fora de escopo do v1 inteiro).

### Critério de "pronto"
- Mesmos critérios da fase 2, mas em PowerShell.
- Exit code de um cmdlet (`Get-Item inexistente`) e de um comando externo (`ping
  host-invalido`) aparecem corretos no bloco.

### Riscos conhecidos
- Esse é o ponto onde o Warp precisou forkar o ConPTY (ordem de eventos OSC vs.
  saída). Se blocos aparecerem com conteúdo fora de ordem, a mitigação mais simples
  (sem forkar nada) é: bufferizar a saída do PTY no backend Rust e só repassar pro
  frontend quando o próximo marcador OSC for recebido — sacrifica streaming em
  tempo real por correção. Avaliar se o problema aparece na prática antes de
  complicar.

---

## Fase 4 — IA no prompt

### Objetivo
Campo de texto livre ("descreve o que quer") → sugestão de comando via API da
Anthropic. Feature isolada, não depende de PTY nem de blocos — pode ser
prototipada em paralelo a qualquer uma das fases acima.

### Escopo
1. **UI:** atalho (ex: `Ctrl+K` ou um modo alternativo do input) que troca o campo
   de "digitar comando" por "descrever o que quer em linguagem natural".
2. **Contexto enviado pro modelo:** diretório atual (`pwd`), shell em uso
   (bash/PowerShell), e opcionalmente os últimos N blocos (comando + exit code) pra
   dar contexto de sessão. Não enviar output completo de comandos grandes (custo de
   tokens) — truncar.
3. **Chamada:** Anthropic Messages API (ver skill `claude-api` do projeto pra
   modelo/preço atual), prompt system simples do tipo "sugira um comando de shell
   pra [shell detectado] que faça: {pedido do usuário}. Responda só com o comando,
   sem explicação, sem markdown.".
4. **Resultado:** comando sugerido aparece no input normal do terminal (editável
   antes de rodar) — nunca executa automaticamente.
5. **Chave de API:** usar o mesmo padrão de Credential Manager do Windows já usado
   no Pacer (ver memória 2211/S396 da sessão de 13/10/2026) em vez de guardar em
   texto puro.

### Fora de escopo nesta fase
- Execução automática de comando sugerido.
- Histórico/aprendizado de preferências do usuário.
- Multi-turn (conversa com o modelo sobre o resultado de um comando) — fica pra
  uma iteração futura, se o estudo avançar até lá.

### Critério de "pronto"
- Digitar "lista os arquivos .md modificados essa semana" no modo IA sugere um
  comando git/find plausível pro shell ativo, sem executar sozinho.
- Chave de API não aparece em texto puro em nenhum arquivo do repo.

---

## Resumo de dependências entre fases

```
Fase 1 (PTY básico)
   └─> Fase 2 (blocos bash/zsh)
          └─> Fase 3 (blocos PowerShell)

Fase 4 (IA no prompt) — independente, pode rodar em paralelo a qualquer fase acima
```
