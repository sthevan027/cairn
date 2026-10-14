import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { OscSplitter, type Marker } from "./osc";

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
}

interface Surface {
  term: XTerm;
  clip: HTMLElement | null;
  host: HTMLElement | null;
}

export interface SessionElements {
  sizer: HTMLElement;
  scroll: HTMLElement;
  content: HTMLElement;
  promptClip: HTMLElement;
  promptHost: HTMLElement;
}

const TERM_OPTIONS = {
  fontFamily: '"CaskaydiaCove Nerd Font Mono", "Cascadia Code", Consolas, monospace',
  fontSize: 14,
  cursorBlink: true,
  cursorInactiveStyle: "none",
  theme: {
    background: "#1a1b26",
    foreground: "#c0caf5",
    cursor: "#c0caf5",
    selectionBackground: "#33467c",
  },
} as const;

const FOCUS_REPORTS = new Set(["\x1b[I", "\x1b[O"]);
const STICK_THRESHOLD_PX = 40;

/**
 * Dona do PTY e dos terminais. O fluxo do shell é cortado nos marcadores (OSC 9278):
 * entre `post` e o próximo `pre` os bytes vão para o terminal do prompt; entre `pre` e
 * `post` vão para o terminal do bloco em execução.
 */
export class Session {
  private blocks: Block[] = [];
  private listeners = new Set<() => void>();
  private surfaces = new Map<number, Surface>();
  private current: { id: number; surface: Surface } | null = null;
  private splitter = new OscSplitter();
  private seq = 0;
  private lastCwd: string | null = null;

  private els!: SessionElements;
  private prompt!: Surface;
  private meter!: { term: XTerm; fit: FitAddon };
  private cols = 80;
  private rows = 24;
  private cellHeight = 17;
  private integrated = false;
  private sessionId: number | null = null;
  private stick = true;

  private dirty = new Set<Surface>();
  private rafId = 0;
  private disposers: Array<() => void> = [];
  private disposed = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.blocks;

  async start(els: SessionElements, shell?: string) {
    this.els = els;

    this.meter = { term: new XTerm(TERM_OPTIONS), fit: new FitAddon() };
    this.meter.term.loadAddon(this.meter.fit);
    this.meter.term.open(els.sizer);
    await document.fonts.ready;
    this.measure();

    this.prompt = this.createSurface(this.cols, this.rows);
    this.prompt.clip = els.promptClip;
    this.prompt.host = els.promptHost;
    this.prompt.term.open(els.promptHost);
    this.applyMode();

    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = els.scroll;
      this.stick = scrollHeight - scrollTop - clientHeight < STICK_THRESHOLD_PX;
    };
    els.scroll.addEventListener("scroll", onScroll);
    const sizerObserver = new ResizeObserver(() => this.onResize());
    sizerObserver.observe(els.sizer);
    // O xterm só atualiza a altura no próprio frame; observar o conteúdo garante que o
    // "colar no fim" use a altura final.
    const contentObserver = new ResizeObserver(() => this.stickToBottom());
    contentObserver.observe(els.content);
    this.disposers.push(() => {
      els.scroll.removeEventListener("scroll", onScroll);
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
      this.integrated = info.integrated;
      this.applyMode();
    } catch (err) {
      this.prompt.term.write(`\r\n[erro ao abrir o shell: ${err}]\r\n`);
    }
    this.focusActive();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.disposers.forEach((fn) => fn());
    invoke("kill_pty").catch(() => {});
    this.surfaces.forEach((s) => s.term.dispose());
    this.prompt?.term.dispose();
    this.meter?.term.dispose();
  }

  focusActive() {
    const surface = this.current?.surface ?? this.prompt;
    if (surface?.host) surface.term.focus();
  }

  attachBlock(id: number, clip: HTMLElement) {
    const surface = this.surfaces.get(id);
    if (!surface || surface.host) return;
    const host = document.createElement("div");
    clip.appendChild(host);
    surface.clip = clip;
    surface.host = host;
    surface.term.open(host);
    this.scheduleLayout(surface);
    if (this.current?.id === id) surface.term.focus();
  }

  // ---- fluxo do PTY ----

  private onBytes(bytes: Uint8Array) {
    if (this.disposed) return;
    for (const event of this.splitter.push(bytes)) {
      if (event.type === "data") {
        const surface = this.current?.surface ?? this.prompt;
        surface.term.write(event.bytes, () => this.scheduleLayout(surface));
      } else {
        this.onMarker(event.marker);
      }
    }
  }

  private onMarker(marker: Marker) {
    if (marker.kind === "pre") this.startBlock(marker.command);
    else this.finishBlock(marker.exitCode, marker.cwd);
  }

  private startBlock(command: string) {
    if (this.current) this.finishBlock(null, null);
    const block: Block = {
      id: ++this.seq,
      command,
      cwd: this.lastCwd,
      startedAt: Date.now(),
      finishedAt: null,
      exitCode: null,
    };
    const surface = this.createSurface(this.cols, this.rows);
    this.surfaces.set(block.id, surface);
    this.current = { id: block.id, surface };
    this.blocks = [...this.blocks, block];
    // O comando digitado passa a viver no cabeçalho do bloco: limpa o prompt (RIS pela fila
    // de escrita, para ficar ordenado depois dos bytes já enfileirados).
    this.prompt.term.write("\x1bc", () => this.scheduleLayout(this.prompt));
    this.emit();
  }

  private finishBlock(exitCode: number | null, cwd: string | null) {
    if (cwd) this.lastCwd = cwd;
    if (!this.current) return;
    const { id, surface } = this.current;
    this.current = null;
    this.blocks = this.blocks.map((b) =>
      b.id === id ? { ...b, finishedAt: Date.now(), exitCode, cwd: cwd ?? b.cwd } : b,
    );
    this.emit();
    this.scheduleLayout(surface);
    this.focusActive();
  }

  private onExit() {
    if (this.current) this.finishBlock(null, null);
    this.prompt.term.write("\r\n[processo encerrado]\r\n");
  }

  // ---- terminais e layout ----

  private createSurface(cols: number, rows: number): Surface {
    const term = new XTerm({ ...TERM_OPTIONS, cols, rows, scrollback: 5000 });
    term.onData((data) => {
      if (FOCUS_REPORTS.has(data)) return;
      invoke("write_to_pty", { data }).catch(() => {});
    });
    return { term, clip: null, host: null };
  }

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
    if (this.disposed) return;
    const { cols, rows } = this;
    this.measure();
    if (cols === this.cols && rows === this.rows) return;
    this.prompt.term.resize(this.cols, this.rows);
    invoke("resize_pty", { cols: this.cols, rows: this.rows }).catch(() => {});
    this.scheduleLayout(this.prompt);
  }

  /** Sem integração o terminal do prompt ocupa a tela toda, como na fase 1. */
  private applyMode() {
    if (!this.integrated) {
      this.els.promptClip.style.height = "100%";
      this.els.promptHost.style.marginTop = "0";
    } else {
      this.scheduleLayout(this.prompt);
    }
  }

  private scheduleLayout(surface: Surface) {
    this.dirty.add(surface);
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      const surfaces = [...this.dirty];
      this.dirty.clear();
      surfaces.forEach((s) => this.layoutSurface(s));
      this.stickToBottom();
    });
  }

  private stickToBottom() {
    if (this.stick) this.els.scroll.scrollTop = this.els.scroll.scrollHeight;
  }

  /** Ajusta o recorte do terminal ao conteúdo: só as linhas entre a primeira e a última com texto. */
  private layoutSurface(surface: Surface) {
    const { term, clip, host } = surface;
    if (!clip || !host || this.disposed) return;
    const isPrompt = surface === this.prompt;
    if (isPrompt && !this.integrated) return;

    // Saída maior que o PTY empurrou linhas para o scrollback: cresce o terminal para mostrá-las.
    if (term.buffer.active.baseY > 0) {
      term.resize(term.cols, term.rows + term.buffer.active.baseY);
    }
    const buf = term.buffer.active;
    let first = -1;
    let last = -1;
    for (let i = 0; i < buf.length; i++) {
      if (buf.getLine(i)?.translateToString(true).trim()) {
        if (first < 0) first = i;
        last = i;
      }
    }
    if (isPrompt) {
      const cursorLine = buf.baseY + buf.cursorY;
      if (first < 0) first = cursorLine;
      last = Math.max(last, cursorLine);
    } else if (first < 0) {
      clip.style.height = "0px";
      return;
    }
    clip.style.height = `${(last - first + 1) * this.cellHeight}px`;
    host.style.marginTop = `${-first * this.cellHeight}px`;
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }
}
