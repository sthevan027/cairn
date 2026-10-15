import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke, Channel: class {} }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@xterm/xterm", () => ({ Terminal: class {} }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class {} }));
vi.mock("@xterm/addon-serialize", () => ({ SerializeAddon: class {} }));

import { Session } from "./session";

/** Sessão sem DOM nem PTY de verdade: só o estado interno que a lógica toca. */
function makeSession(opts: { sessionId?: number | null; bracketed?: boolean } = {}) {
  const session = new Session();
  const inner = session as unknown as Record<string, any>;
  inner.shadow = {
    registerMarker: () => ({ isDisposed: false, line: 0, dispose: vi.fn() }),
    modes: { bracketedPasteMode: opts.bracketed ?? false },
    focus: vi.fn(),
  };
  inner.scheduleLayout = vi.fn();
  inner.sessionId = opts.sessionId === undefined ? 7 : opts.sessionId;
  return { session, inner };
}

/** Bloco já terminado, com a cópia estática (o terminal de verdade é trocado por um espião). */
function addFinishedBlock(inner: Record<string, any>, id: number, command: string) {
  const dispose = vi.fn();
  inner.blocks = [
    ...inner.blocks,
    { id, command, cwd: null, startedAt: 1, finishedAt: 2, exitCode: 0 },
  ];
  inner.statics.set(id, { term: { dispose }, text: "", plain: "", rows: 1, opened: false, clip: null });
  return dispose;
}

const writes = () => invoke.mock.calls.filter(([cmd]) => cmd === "write_to_pty").map(([, args]) => args);

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
});

describe("clearBlocks", () => {
  it("esvazia a lista, descarta as cópias estáticas e avisa quem assina", () => {
    const { session, inner } = makeSession();
    const disposeA = addFinishedBlock(inner, 1, "ls");
    const disposeB = addFinishedBlock(inner, 2, "pwd");
    const listener = vi.fn();
    session.subscribe(listener);

    session.clearBlocks();

    expect(session.getSnapshot()).toEqual([]);
    expect(session.hasBody(1)).toBe(false);
    expect(disposeA).toHaveBeenCalledOnce();
    expect(disposeB).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalled();
  });
});

describe("clear e cls", () => {
  it.each(["clear", "cls", "Clear-Host", "  CLS  "])("%s limpa os blocos e não cria bloco novo", (command) => {
    const { session, inner } = makeSession();
    addFinishedBlock(inner, 1, "ls");

    inner.startBlock(command);

    expect(session.getSnapshot()).toEqual([]);
    expect(session.isIdle()).toBe(true);
  });

  it("um comando comum cria o bloco e mantém os anteriores", () => {
    const { session, inner } = makeSession();
    addFinishedBlock(inner, 1, "ls");

    inner.startBlock("git status");

    expect(session.getSnapshot().map((b) => b.command)).toEqual(["ls", "git status"]);
    expect(session.isIdle()).toBe(false);
  });

  it("'cls && ls' não é pedido de limpar", () => {
    const { session, inner } = makeSession();
    addFinishedBlock(inner, 1, "ls");

    inner.startBlock("cls && ls");

    expect(session.getSnapshot()).toHaveLength(2);
  });
});

describe("insertPaths (arrastar arquivos)", () => {
  it("escreve os caminhos no PTY com aspas quando preciso, sem Enter", () => {
    const { session } = makeSession();

    session.insertPaths(["C:\\a.png", "C:\\Minhas Fotos\\b.png"]);

    expect(writes()).toEqual([{ id: 7, data: 'C:\\a.png "C:\\Minhas Fotos\\b.png" ' }]);
    expect(writes()[0].data).not.toMatch(/[\r\n]/);
  });

  it("lista vazia não escreve nada", () => {
    const { session } = makeSession();
    session.insertPaths([]);
    expect(writes()).toEqual([]);
  });

  it("sem shell aberto não escreve", () => {
    const { session } = makeSession({ sessionId: null });
    session.insertPaths(["C:\\a.png"]);
    expect(writes()).toEqual([]);
  });
});

describe("pasteFromClipboard", () => {
  function clipboardReturns(value: unknown) {
    invoke.mockImplementation(async (cmd: string) => (cmd === "clipboard_read" ? value : undefined));
  }

  it("texto: escreve uma vez só, com quebras de linha em CR", async () => {
    clipboardReturns({ kind: "text", value: "a\nb" });
    const { session } = makeSession();

    await session.pasteFromClipboard();

    expect(writes()).toEqual([{ id: 7, data: "a\rb" }]);
  });

  it("texto com o shell pedindo bracketed paste: vai entre as marcas", async () => {
    clipboardReturns({ kind: "text", value: "ls" });
    const { session } = makeSession({ bracketed: true });

    await session.pasteFromClipboard();

    expect(writes()).toEqual([{ id: 7, data: "\x1b[200~ls\x1b[201~" }]);
  });

  it("imagem: cola o caminho do PNG, não a imagem", async () => {
    clipboardReturns({ kind: "image", value: "C:\\Temp\\cairn-colagem\\colagem-1.png" });
    const { session } = makeSession();

    await session.pasteFromClipboard();

    expect(writes()).toEqual([{ id: 7, data: "C:\\Temp\\cairn-colagem\\colagem-1.png" }]);
  });

  it("área de transferência vazia: não escreve", async () => {
    clipboardReturns({ kind: "empty" });
    const { session } = makeSession();

    await session.pasteFromClipboard();

    expect(writes()).toEqual([]);
  });

  it("falha ao ler o clipboard: não escreve nem quebra", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "clipboard_read") throw new Error("sem acesso");
    });
    const { session } = makeSession();

    await expect(session.pasteFromClipboard()).resolves.toBeUndefined();
    expect(writes()).toEqual([]);
  });

  it("sem shell aberto: nem lê o clipboard", async () => {
    clipboardReturns({ kind: "text", value: "x" });
    const { session } = makeSession({ sessionId: null });

    await session.pasteFromClipboard();

    expect(invoke).not.toHaveBeenCalled();
  });
});
