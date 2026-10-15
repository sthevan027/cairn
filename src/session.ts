import { Terminal as XTerm, type IMarker } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { OscSplitter, type Marker } from "./osc";
import { getEnv } from "./env";
import type { GitInfo } from "./promptConfig";
import { fontStack, getSettings, subscribeSettings } from "./settings";
import { getTheme } from "./themes";
import { pathsToInput, quotePath, toPtyPaste } from "./paste";
import { isClearCommand } from "./clear";

/** Espelha `clipboard::Clip` no Rust. */
type Clip = { kind: "text"; value: string } | { kind: "image"; value: string } | { kind: "empty" };

export type TabStatus = "idle" | "running" | "ok" | "fail";

/** O que a barra lateral mostra de uma aba. */
export interface TabMeta {
  title: string;
  subtitle: string;
  status: TabStatus;
  cwd: string | null;
  branch: string | null;
}

/** Dados que alimentam os widgets do prompt desenhado pelo Cairn. */
export interface PromptSnapshot {
  cwd: string | null;
  git: GitInfo | null;
  exit: number | null;
  durationMs: number | null;
  shell: string;
  running: boolean;
}

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

export interface Block {
  id: number;
  command: string;
  cwd: string | null;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
}

interface SpawnInfo {
  id: number;
  integrated: boolean;
  shell: string;
}

export interface AiContext {
  shell: string;
  cwd: string | null;
  recent: Array<{ command: string; exit_code: number | null }>;
}

/** Cópia estática das linhas de um bloco finalizado. */
interface StaticBlock {
  term: XTerm;
  text: string;
  plain: string;
  rows: number;
  opened: boolean;
  clip: HTMLElement | null;
}

export interface SessionElements {
  sizer: HTMLElement;
  scroll: HTMLElement;
  content: HTMLElement;
  liveClip: HTMLElement;
  liveHost: HTMLElement;
}

/** Só o que muda a aparência do terminal; o resto das configurações (prompt, IA...) não conta. */
function lookKey(): string {
  const s = getSettings();
  return [s.theme, s.fontFamily, s.fontSize, s.cursorBlink].join("|");
}

/** Opções do xterm a partir das configurações atuais (tema, fonte, tamanho, cursor). */
function termOptions() {
  const s = getSettings();
  return {
    fontFamily: fontStack(s.fontFamily),
    fontSize: s.fontSize,
    cursorBlink: s.cursorBlink,
    cursorInactiveStyle: "none" as const,
    theme: getTheme(s.theme).term,
  };
}

const FOCUS_REPORTS = new Set(["\x1b[I", "\x1b[O"]);
const STICK_THRESHOLD_PX = 40;

/**
 * Dona do PTY. Um terminal "sombra" recebe TODO o fluxo do shell e espelha exatamente a tela do
 * ConPTY, então posicionamento absoluto de cursor (que o PSReadLine usa) cai no lugar certo.
 * Os marcadores (OSC 9278) só dizem onde cada comando começa e termina nesse buffer:
 *   - a região "ao vivo" (prompt ou saída do comando em execução) é um recorte do terminal sombra;
 *   - ao terminar um comando, suas linhas são copiadas para um bloco estático.
 */
export class Session {
  private blocks: Block[] = [];
  private listeners = new Set<() => void>();
  private statics = new Map<number, StaticBlock>();
  private current: { id: number } | null = null;
  private liveStart: IMarker | undefined;
  private splitter = new OscSplitter();
  private seq = 0;
  private lastCwd: string | null = null;

  private els!: SessionElements;
  private shadow!: XTerm;
  private serializer = new SerializeAddon();
  private meter!: { term: XTerm; fit: FitAddon };
  private cols = 80;
  private rows = 24;
  private cellHeight = 17;
  private integrated = false;
  private active = true;
  private appliedLook = "";
  private git: GitInfo | null = null;
  private meta: TabMeta = { title: "Terminal", subtitle: "", status: "idle", cwd: null, branch: null };
  private promptSnap: PromptSnapshot = {
    cwd: null,
    git: null,
    exit: null,
    durationMs: null,
    shell: "",
    running: false,
  };
  /** Chamado quando o shell termina sozinho (ex.: `exit`); o workspace fecha a aba. */
  onShellExit: (() => void) | null = null;
  private shell = "";
  private sessionId: number | null = null;
  private stick = true;

  private layoutQueued = false;
  private rafId = 0;
  private disposers: Array<() => void> = [];
  private disposed = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.blocks;
  getMeta = () => this.meta;
  getPromptSnapshot = () => this.promptSnap;

  hasBody(id: number) {
    return this.statics.has(id);
  }

  /** Saída do bloco como texto puro (sem cores), para copiar e buscar. */
  blockOutput(id: number) {
    return this.statics.get(id)?.plain ?? "";
  }

  /** Copia a seleção de mouse (do terminal ao vivo ou de um bloco), se houver; limpa a seleção. */
  copySelection(): boolean {
    const terms = [this.shadow, ...[...this.statics.values()].map((s) => s.term)];
    for (const term of terms) {
      if (term?.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
        return true;
      }
    }
    return false;
  }

  async start(els: SessionElements, shell?: string) {
    this.els = els;

    this.meter = { term: new XTerm(termOptions()), fit: new FitAddon() };
    this.meter.term.loadAddon(this.meter.fit);
    this.meter.term.open(els.sizer);
    await document.fonts.ready;
    if (this.disposed) return;
    this.measure();

    this.shadow = new XTerm({ ...termOptions(), cols: this.cols, rows: this.rows, scrollback: 10_000 });
    this.appliedLook = lookKey();
    this.disposers.push(subscribeSettings(() => this.applyAppearance()));
    this.shadow.loadAddon(this.serializer);
    this.shadow.onData((data) => {
      if (FOCUS_REPORTS.has(data) || this.sessionId === null) return;
      invoke("write_to_pty", { id: this.sessionId, data }).catch(() => {});
    });
    this.shadow.open(els.liveHost);
    this.liveStart = this.shadow.registerMarker(0);
    const bufferChange = this.shadow.buffer.onBufferChange(() => this.scheduleLayout());
    this.disposers.push(() => bufferChange.dispose());
    this.applyMode();

    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = els.scroll;
      this.stick = scrollHeight - scrollTop - clientHeight < STICK_THRESHOLD_PX;
    };
    els.scroll.addEventListener("scroll", onScroll);
    // O xterm 6 consome toda roda do mouse sobre ele (mesmo sem nada pra rolar), e o recorte da
    // região ao vivo depende do viewport do terminal ficar no fim: quem rola é a página.
    const onWheel = (e: WheelEvent) => {
      if (els.content.classList.contains("alt")) return;
      e.preventDefault();
      e.stopPropagation();
      const unit = e.deltaMode === 1 ? this.cellHeight : e.deltaMode === 2 ? els.scroll.clientHeight : 1;
      els.scroll.scrollTop += e.deltaY * unit;
    };
    els.scroll.addEventListener("wheel", onWheel, { capture: true, passive: false });

    // Colar tem uma única via: Ctrl+V / Shift+Insert, o evento de colagem e o clique direito
    // cancelam o caminho nativo (que duplicava) e passam por pasteFromClipboard().
    const onPasteKey = (e: KeyboardEvent) => {
      const paste = (e.ctrlKey && !e.altKey && e.key.toLowerCase() === "v") || (e.shiftKey && e.key === "Insert");
      if (!paste) return;
      e.preventDefault();
      e.stopPropagation();
      void this.pasteFromClipboard();
    };
    const onNativePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void this.pasteFromClipboard();
    };
    // Clique direito: copia a seleção se houver, senão cola (como o Windows Terminal).
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.copySelection()) void this.pasteFromClipboard();
    };
    // Ctrl+L limpa a tela de blocos (sem comando rodando); a tecla continua indo pro shell, que redesenha o prompt.
    const onClearKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "l" && this.isIdle()) this.clearBlocks();
    };
    els.scroll.addEventListener("keydown", onClearKey, { capture: true });
    els.scroll.addEventListener("keydown", onPasteKey, { capture: true });
    els.scroll.addEventListener("paste", onNativePaste, { capture: true });
    els.scroll.addEventListener("contextmenu", onContextMenu, { capture: true });
    this.disposers.push(() => {
      els.scroll.removeEventListener("keydown", onClearKey, { capture: true });
      els.scroll.removeEventListener("keydown", onPasteKey, { capture: true });
      els.scroll.removeEventListener("paste", onNativePaste, { capture: true });
      els.scroll.removeEventListener("contextmenu", onContextMenu, { capture: true });
    });

    const sizerObserver = new ResizeObserver(() => this.onResize());
    sizerObserver.observe(els.sizer);
    // O xterm só atualiza a altura no próprio frame; observar o conteúdo garante que o
    // "colar no fim" use a altura final.
    const contentObserver = new ResizeObserver(() => this.stickToBottom());
    contentObserver.observe(els.content);
    this.disposers.push(() => {
      els.scroll.removeEventListener("scroll", onScroll);
      els.scroll.removeEventListener("wheel", onWheel, { capture: true });
      sizerObserver.disconnect();
      contentObserver.disconnect();
    });

    const unlisten: UnlistenFn = await listen<number>("pty-exit", (event) => {
      if (event.payload === this.sessionId) this.onExit();
    });
    this.disposers.push(unlisten);

    const output = new Channel<ArrayBuffer>();
    output.onmessage = (data) => this.onBytes(new Uint8Array(data));
    try {
      const info = await invoke<SpawnInfo>("spawn_shell", {
        onOutput: output,
        cols: this.cols,
        rows: this.rows,
        shell: shell ?? null,
      });
      this.sessionId = info.id;
      if (this.disposed) {
        // A aba foi fechada antes do shell terminar de subir.
        invoke("kill_pty", { id: info.id }).catch(() => {});
        return;
      }
      this.integrated = info.integrated;
      this.shell = info.shell;
      // O shell sobe na home: já dá pra mostrar a pasta e o git antes do primeiro comando.
      this.lastCwd ??= getEnv().home || null;
      this.applyMode();
      this.emit();
      void this.refreshGit();
    } catch (err) {
      this.shadow.write(`\r\n[erro ao abrir o shell: ${err}]\r\n`);
    }
    this.focusActive();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.disposers.forEach((fn) => fn());
    if (this.sessionId !== null) invoke("kill_pty", { id: this.sessionId }).catch(() => {});
    this.statics.forEach((s) => s.term.dispose());
    this.shadow?.dispose();
    this.meter?.term.dispose();
  }

  focusActive() {
    if (this.active) this.shadow?.focus();
  }

  /** Sem comando rodando: só então faz sentido pedir uma sugestão à IA. */
  isIdle() {
    return this.current === null;
  }

  aiContext(): AiContext {
    const recent = this.blocks
      .filter((b) => b.finishedAt !== null)
      .slice(-5)
      .map((b) => ({ command: b.command, exit_code: b.exitCode }));
    return {
      shell: this.shell.split(/[\\/]/).pop() ?? this.shell,
      cwd: this.lastCwd,
      recent,
    };
  }

  /** Cola no prompt sem Enter: o usuário revisa e decide se executa. */
  insertCommand(command: string) {
    this.shadow.paste(command.replace(/[\r\n]+/g, " ").trim());
    this.focusActive();
  }

  /** Cola o conteúdo da área de transferência no prompt, sem Enter. Texto ou imagem (vira caminho). */
  async pasteFromClipboard() {
    if (this.sessionId === null) return;
    let clip: Clip;
    try {
      clip = await invoke<Clip>("clipboard_read");
    } catch {
      return;
    }
    if (clip.kind === "text") this.writePty(toPtyPaste(clip.value, this.shadow.modes.bracketedPasteMode));
    else if (clip.kind === "image") this.writePty(quotePath(clip.value));
    this.focusActive();
  }

  /** Tira todos os blocos da lista (e as cópias estáticas). Só faz sentido com nenhum comando rodando. */
  clearBlocks() {
    this.statics.forEach((block) => block.term.dispose());
    this.statics.clear();
    this.blocks = [];
    this.emit();
  }

  /** Arquivos soltos na aba: os caminhos entram no prompt, sem Enter. */
  insertPaths(paths: string[]) {
    if (paths.length === 0) return;
    this.writePty(pathsToInput(paths) + " ");
    this.focusActive();
  }

  private writePty(data: string) {
    if (this.sessionId === null) return;
    invoke("write_to_pty", { id: this.sessionId, data }).catch(() => {});
  }

  attachBlock(id: number, clip: HTMLElement) {
    const block = this.statics.get(id);
    if (!block || block.opened) return;
    block.opened = true;
    block.clip = clip;
    const host = document.createElement("div");
    clip.appendChild(host);
    clip.style.height = `${block.rows * this.cellHeight}px`;
    block.term.open(host);
    block.term.write(`${block.text}\x1b[?25l`);
  }

  // ---- fluxo do PTY ----

  private onBytes(bytes: Uint8Array) {
    if (this.disposed) return;
    for (const event of this.splitter.push(bytes)) {
      if (event.type === "data") {
        this.shadow.write(event.bytes, () => this.scheduleLayout());
      } else {
        // Processado na ordem: só depois que todos os bytes anteriores foram interpretados.
        this.shadow.write(new Uint8Array(0), () => this.onMarker(event.marker));
      }
    }
  }

  private onMarker(marker: Marker) {
    if (this.disposed) return;
    if (marker.kind === "pre") this.startBlock(marker.command);
    else this.finishBlock(marker.exitCode, marker.cwd);
  }

  private cursorLine() {
    const buf = this.shadow.buffer.normal;
    return buf.baseY + buf.cursorY;
  }

  private startBlock(command: string) {
    if (this.current) this.finishBlock(null, null);
    if (isClearCommand(command)) {
      // Pedido de limpar: o shell limpa a tela do terminal sombra e os blocos anteriores saem junto.
      this.clearBlocks();
      this.liveStart?.dispose();
      this.liveStart = this.shadow.registerMarker(0);
      this.scheduleLayout();
      return;
    }
    const block: Block = {
      id: ++this.seq,
      command,
      cwd: this.lastCwd,
      startedAt: Date.now(),
      finishedAt: null,
      exitCode: null,
    };
    this.current = { id: block.id };
    // A região ao vivo passa a ser a saída do comando; o que foi digitado vira o cabeçalho.
    this.liveStart?.dispose();
    this.liveStart = this.shadow.registerMarker(0);
    this.blocks = [...this.blocks, block];
    this.emit();
    this.scheduleLayout();
  }

  private finishBlock(exitCode: number | null, cwd: string | null) {
    if (cwd) this.lastCwd = cwd;
    if (!this.current) return;
    const { id } = this.current;
    this.current = null;

    const startLine = this.liveStartLine();
    const buf = this.shadow.buffer.normal;
    const endLine = this.cursorLine() + (buf.cursorX > 0 ? 1 : 0) - 1;
    const range = this.contentRange(startLine, endLine);
    if (range) {
      const rows = range.last - range.first + 1;
      const term = new XTerm({
        ...termOptions(),
        cols: this.cols,
        rows,
        scrollback: 0,
        cursorBlink: false,
        disableStdin: true,
      });
      const text = this.serializer.serialize({ range: { start: range.first, end: range.last } });
      const plain = Array.from(
        { length: rows },
        (_, i) => buf.getLine(range.first + i)?.translateToString(true) ?? "",
      ).join("\n");
      this.statics.set(id, { term, text, plain, rows, opened: false, clip: null });
    }

    this.liveStart?.dispose();
    this.liveStart = this.shadow.registerMarker(0);
    this.blocks = this.blocks.map((b) =>
      b.id === id ? { ...b, finishedAt: Date.now(), exitCode, cwd: cwd ?? b.cwd } : b,
    );
    this.emit();
    this.scheduleLayout();
    this.focusActive();
    void this.refreshGit();
  }

  private async refreshGit() {
    if (!this.lastCwd) return;
    const git = await invoke<GitInfo | null>("git_info", { cwd: this.lastCwd }).catch(() => null);
    if (this.disposed || JSON.stringify(git) === JSON.stringify(this.git)) return;
    this.git = git;
    this.emit();
  }

  private computePromptSnapshot(): PromptSnapshot {
    const lastDone = [...this.blocks].reverse().find((b) => b.finishedAt !== null);
    const next: PromptSnapshot = {
      cwd: this.lastCwd,
      git: this.git,
      exit: lastDone ? lastDone.exitCode : null,
      durationMs: lastDone ? lastDone.finishedAt! - lastDone.startedAt : null,
      shell: this.shell,
      running: this.current !== null,
    };
    const prev = this.promptSnap;
    const same =
      prev.cwd === next.cwd &&
      prev.git === next.git &&
      prev.exit === next.exit &&
      prev.durationMs === next.durationMs &&
      prev.shell === next.shell &&
      prev.running === next.running;
    return same ? prev : next;
  }

  private onExit() {
    if (this.current) this.finishBlock(null, null);
    this.shadow.write("\r\n[processo encerrado]\r\n");
    this.onShellExit?.();
  }

  private computeMeta(): TabMeta {
    const running = this.current ? this.blocks.find((b) => b.id === this.current!.id) : undefined;
    const lastDone = [...this.blocks].reverse().find((b) => b.finishedAt !== null);
    const status: TabStatus = running
      ? "running"
      : !lastDone || lastDone.exitCode === null
        ? "idle"
        : lastDone.exitCode === 0
          ? "ok"
          : "fail";
    const next: TabMeta = {
      title: running ? running.command : this.lastCwd ? folderName(this.lastCwd) : "Terminal",
      subtitle: this.git?.branch ?? folderName(this.shell),
      status,
      cwd: this.lastCwd,
      branch: this.git?.branch ?? null,
    };
    const prev = this.meta;
    const same =
      prev.title === next.title &&
      prev.subtitle === next.subtitle &&
      prev.status === next.status &&
      prev.cwd === next.cwd &&
      prev.branch === next.branch;
    return same ? prev : next;
  }

  /** Só a aba ativa pega o foco do teclado; as outras continuam rodando em segundo plano. */
  setActive(active: boolean) {
    this.active = active;
    if (active) {
      this.focusActive();
      this.scheduleLayout();
    }
  }

  // ---- layout ----

  private measure() {
    const dims = this.meter.fit.proposeDimensions();
    if (dims && dims.cols > 0 && dims.rows > 0) {
      this.cols = dims.cols;
      this.rows = dims.rows;
    }
    const screen = this.els.sizer.querySelector<HTMLElement>(".xterm-screen");
    if (screen && this.meter.term.rows > 0) {
      this.cellHeight = screen.clientHeight / this.meter.term.rows || this.cellHeight;
    }
  }

  private onResize() {
    if (this.disposed || !this.shadow) return;
    const { cols, rows } = this;
    this.measure();
    if (cols === this.cols && rows === this.rows) return;
    this.shadow.resize(this.cols, this.rows);
    if (this.sessionId !== null) {
      invoke("resize_pty", { id: this.sessionId, cols: this.cols, rows: this.rows }).catch(() => {});
    }
    this.scheduleLayout();
  }

  /** Tema, fonte, tamanho e cursor novos em todos os terminais da aba (sombra, medidor e blocos). */
  private applyAppearance() {
    if (this.disposed || !this.shadow) return;
    // Editar um widget do prompt também dispara a assinatura: sem esta guarda cada clique
    // reaplicava tema/fonte e remedia a célula em todos os terminais (tranco visível).
    const look = lookKey();
    if (look === this.appliedLook) return;
    this.appliedLook = look;
    const options = termOptions();
    const apply = (term: XTerm, blink: boolean) => {
      term.options.theme = options.theme;
      term.options.fontFamily = options.fontFamily;
      term.options.fontSize = options.fontSize;
      term.options.cursorBlink = blink;
    };
    apply(this.shadow, options.cursorBlink);
    apply(this.meter.term, false);
    this.statics.forEach((block) => apply(block.term, false));

    // O tamanho da célula depende da fonte: só dá pra remedir depois que o xterm redesenha.
    window.setTimeout(() => {
      if (this.disposed) return;
      this.onResize();
      this.statics.forEach((block) => {
        if (block.clip) block.clip.style.height = `${block.rows * this.cellHeight}px`;
      });
      this.scheduleLayout();
    }, 80);
  }

  /** Sem integração o terminal ocupa a tela toda, como na fase 1. */
  private applyMode() {
    if (!this.integrated) {
      this.els.liveClip.style.height = "100%";
      this.els.liveHost.style.marginTop = "0";
    } else {
      this.scheduleLayout();
    }
  }

  private liveStartLine() {
    return this.liveStart && !this.liveStart.isDisposed ? Math.max(this.liveStart.line, 0) : 0;
  }

  /** Primeira e última linha com texto entre `from` e `to` (inclusive), no buffer normal. */
  private contentRange(from: number, to: number): { first: number; last: number } | null {
    const buf = this.shadow.buffer.normal;
    let first = -1;
    let last = -1;
    for (let i = Math.max(from, 0); i <= Math.min(to, buf.length - 1); i++) {
      if (buf.getLine(i)?.translateToString(true).trim()) {
        if (first < 0) first = i;
        last = i;
      }
    }
    return first < 0 ? null : { first, last };
  }

  private scheduleLayout() {
    if (this.layoutQueued) return;
    this.layoutQueued = true;
    this.rafId = requestAnimationFrame(() => {
      this.layoutQueued = false;
      this.layoutLive();
      this.stickToBottom();
    });
  }

  private stickToBottom() {
    if (this.stick) this.els.scroll.scrollTop = this.els.scroll.scrollHeight;
  }

  /** Recorta o terminal sombra para mostrar só a região ao vivo (do início dela até o cursor/último texto). */
  private layoutLive() {
    if (this.disposed || !this.integrated) return;
    const { liveClip, liveHost, content } = this.els;
    const buf = this.shadow.buffer.active;

    // Programa de tela cheia (vim, less...): mostra o terminal inteiro, sem os blocos.
    const alt = buf.type === "alternate";
    content.classList.toggle("alt", alt);
    if (alt) {
      liveClip.style.height = `${this.shadow.rows * this.cellHeight}px`;
      liveHost.style.marginTop = "0";
      this.els.scroll.scrollTop = 0;
      return;
    }

    const cursor = buf.baseY + buf.cursorY;
    const first = Math.max(Math.min(this.liveStartLine(), cursor), buf.baseY);
    let last = cursor;
    for (let i = buf.baseY + this.shadow.rows - 1; i > last; i--) {
      if (buf.getLine(i)?.translateToString(true).trim()) {
        last = i;
        break;
      }
    }
    liveClip.style.height = `${(last - first + 1) * this.cellHeight}px`;
    liveHost.style.marginTop = `${-(first - buf.baseY) * this.cellHeight}px`;
  }

  private emit() {
    this.meta = this.computeMeta();
    this.promptSnap = this.computePromptSnapshot();
    this.listeners.forEach((fn) => fn());
  }
}
