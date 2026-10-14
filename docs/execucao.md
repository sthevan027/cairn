# Plano de execução

> **Estado em 14/10/2026:** fases 1 a 4 implementadas (ver README e a seção "Arquitetura final"
> da spec). A checklist abaixo é o plano original e não foi marcada item a item; os desvios
> relevantes estão na spec (terminal sombra no lugar de um xterm por bloco; delay de 25 ms
> em vez de buffer no backend; `PSConsoleHostReadLine` em vez de handler de Enter).
> Pendências: chamada real à API, PowerShell 5.1, zsh, vim/less, `Ctrl+C` em bloco, remote no GitHub.

Checklist concreto pra sair do papel. Baseado em [spec.md](spec.md). Cada fase tem
tarefas marcáveis — ir riscando conforme avança.

## Pré-requisitos (fazer uma vez só)

- [ ] Rust instalado (`rustup`, toolchain stable) + `cargo`.
- [ ] Node + Bun (`bun install` no lugar de npm/pnpm, conforme padrão do Sthevan).
- [ ] Tauri CLI: `bun add -D @tauri-apps/cli` no projeto, ou `cargo install
      tauri-cli`.
- [ ] Scaffold inicial: `bun create tauri-app` (template React + TypeScript),
      dentro de `D:\Projetos\cairn`.
- [ ] Confirmar que o scaffold builda e abre uma janela vazia (`bun run tauri dev`)
      antes de tocar em PTY.
- [ ] Git: `git init` + primeiro commit do scaffold, antes de começar a Fase 1
      (perguntar antes de criar remote/push).

---

## Fase 1 — PTY básico

- [ ] Adicionar `portable-pty` ao `Cargo.toml` do backend Tauri.
- [ ] Adicionar `xterm` + `xterm-addon-fit` ao frontend (`bun add xterm
      xterm-addon-fit`).
- [ ] Comando Tauri (`#[tauri::command]`) `spawn_shell` que cria um
      `PtySession`, guarda num `State<Mutex<...>>` do Tauri.
- [ ] Thread de leitura do PTY → `window.emit("pty-output", bytes)`.
- [ ] Comando Tauri `write_to_pty(data: String)` → escreve no `writer` da sessão.
- [ ] Frontend: componente `Terminal.tsx` que instancia `xterm.js`, escuta
      `pty-output` e escreve nele, e no `onData` do xterm chama `write_to_pty`.
- [ ] Resize: `FitAddon` + listener de resize da janela → comando Tauri
      `resize_pty(cols, rows)`.
- [ ] Testar: abrir app, rodar `dir`, `cd`, um comando interativo (ex:
      `Get-Credential` ou qualquer prompt que espera input), redimensionar janela.
- [ ] Commit: "Fase 1 — PTY básico funcionando".

**Sinal de que pode seguir pra Fase 2:** usar o app no lugar do Windows Terminal
por 5 minutos sem sentir falta de nada (nessa fase, sem blocos mesmo).

---

## Fase 2 — Blocos via bash/zsh

Pré-requisito: WSL ou Git Bash disponível pra testar (o shell alvo dessa fase é
bash/zsh, não PowerShell).

- [ ] Escrever o script de integração (`integration/bash-integration.sh`) com os
      hooks `preexec`/`precmd` (via `bash-preexec` se for bash puro; nativo se zsh).
- [ ] Decidir e documentar o código OSC usado (ver placeholder `9278` na spec,
      trocar por um valor definitivo e registrar em `spec.md`).
- [ ] No spawn do PTY (Rust), quando o shell for bash/zsh, injetar o script de
      integração automaticamente (ex: via `--rcfile` ou `source` no início da
      sessão, sem depender do `.bashrc`/`.zshrc` pessoal do usuário).
- [ ] Frontend: `registerOscHandler` no xterm.js pra capturar a sequência
      customizada e disparar criação/fechamento de bloco.
- [ ] Implementar o tipo `Block` e o estado de lista de blocos (React state ou
      Zustand/Jotai se a lista crescer).
- [ ] Componente `Block.tsx`: header (comando, exit code, duração) + corpo (uma
      instância de xterm.js só daquele bloco, sem input — só output).
- [ ] Trocar o container de texto único por uma lista de `Block`s renderizados em
      sequência, com o input ativo sempre no final (como o Warp).
- [ ] Testar: 3 comandos em sequência geram 3 blocos; `printf "x"` sem quebra de
      linha não quebra a separação do bloco seguinte; `vim`/editor interativo
      dentro de um bloco não trava a detecção.
- [ ] Commit: "Fase 2 — blocos via hook bash/zsh".

**Sinal de que pode seguir pra Fase 3:** os 3 testes de "critério de pronto" da
spec passam de forma consistente, sem falso-positivo de bloco cortado no meio.

---

## Fase 3 — Portar blocos pro PowerShell

- [ ] Escrever `integration/powershell-integration.ps1` com:
      - `Set-PSReadLineKeyHandler` no Enter, emitindo OSC de `preexec` com o
        conteúdo do buffer antes de deixar o Enter seguir o fluxo normal.
      - Override de `function prompt`, emitindo OSC de `precmd` com
        `$LASTEXITCODE`/`$?` antes de retornar o texto do prompt.
- [ ] No spawn do PTY (Rust), quando o shell for PowerShell, rodar com `-NoProfile`
      e dot-source do nosso script de integração (não tocar no `$PROFILE` pessoal).
- [ ] Reaproveitar o parser OSC do frontend (fase 2) sem mudanças — mesmo formato.
- [ ] Testar: `Get-Item caminho-inexistente` (cmdlet com erro) e `ping
      host-invalido` (comando externo com erro) aparecem com exit code correto no
      bloco.
- [ ] Testar especificamente o risco da spec: rodar um comando com saída grande
      (ex: `Get-ChildItem -Recurse C:\Windows\System32`) e ver se a ordem dos
      eventos OSC bate com a saída. Se não bater, implementar o buffer no backend
      Rust descrito na spec (guardar saída até confirmar o próximo marcador).
- [ ] Commit: "Fase 3 — blocos via PowerShell".

**Sinal de que pode seguir pra Fase 4 (ou considerar o core "pronto"):** usar o
app no PowerShell como terminal principal por um dia de trabalho normal.

---

## Fase 4 — IA no prompt

Pode ser feita em paralelo a qualquer fase acima — não depende de PTY nem blocos.

- [ ] Guardar a chave da API da Anthropic no Windows Credential Manager (mesmo
      padrão usado no Pacer — reaproveitar a lib/approach se possível em vez de
      reescrever).
- [ ] Comando Tauri `suggest_command(prompt: String, shell: String, cwd: String) ->
      String` que chama a Anthropic Messages API do lado Rust (ou via `fetch` no
      frontend, se for mais simples pro estudo — decidir e documentar).
- [ ] Atalho `Ctrl+K` (ou outro) no frontend que troca o input normal por um modo
      "descreve o que quer".
- [ ] Ao confirmar, chama `suggest_command`, recebe o comando sugerido e **coloca
      no input normal** (editável, não executa sozinho).
- [ ] Testar com 3-4 pedidos variados (listar arquivos, git log formatado, matar
      processo por porta) e conferir que o comando sugerido bate com o shell ativo
      (PowerShell vs. bash).
- [ ] Confirmar que a chave não aparece em texto puro em nenhum arquivo versionado
      (checar `.gitignore` cobre configs locais).
- [ ] Commit: "Fase 4 — IA no prompt".

---

## Ritmo sugerido

Sem prazo fixo (projeto de estudo) — mas pra manter o momentum: uma sessão de
trabalho por tarefa do checklist, não por fase inteira. Fase 1 inteira numa
sentada é ambiciosa demais pra manter energia; quebrar em comando→thread→frontend
já é mais mastigável.

## Como retomar entre sessões

Usar a skill `retomar-projeto` apontando pra esse projeto — ela lê esta nota (que
fica referenciada na nota do vault `Ideias-Futuras.md`) e cruza com o estado real
do git antes de dizer "onde paramos".
