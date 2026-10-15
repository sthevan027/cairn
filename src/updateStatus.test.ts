import { describe, expect, it } from "vitest";
import {
  CHECK_ERROR_TEXT,
  INSTALL_ERROR_TEXT,
  formatCheckedAt,
  initialUpdateState,
  statusHint,
  updateStatusReducer,
} from "./updateStatus";

describe("updateStatusReducer", () => {
  it("marca checando e limpa erro anterior no check_start", () => {
    const state = updateStatusReducer({ ...initialUpdateState, error: "antigo" }, { type: "check_start" });
    expect(state.checking).toBe(true);
    expect(state.error).toBeNull();
  });

  it("guarda horário e versão numa checagem bem-sucedida", () => {
    const state = updateStatusReducer(initialUpdateState, { type: "check_success", version: "0.3.0", nowMs: 1000 });
    expect(state).toMatchObject({ checking: false, lastCheckedMs: 1000, availableVersion: "0.3.0", error: null });
  });

  it("checagem sem atualização zera a versão vista antes", () => {
    const stale = { ...initialUpdateState, availableVersion: "0.2.0" };
    const state = updateStatusReducer(stale, { type: "check_success", version: null, nowMs: 2000 });
    expect(state.availableVersion).toBeNull();
  });

  it("falha silenciosa só para de checar, sem mexer no resto", () => {
    const before = { ...initialUpdateState, lastCheckedMs: 500, availableVersion: "0.3.0" };
    const state = updateStatusReducer(before, { type: "check_error", silent: true, nowMs: 9999 });
    expect(state).toEqual({ ...before, checking: false });
  });

  it("falha manual registra horário e mensagem amigável, não o erro bruto", () => {
    const state = updateStatusReducer(initialUpdateState, { type: "check_error", silent: false, nowMs: 3000 });
    expect(state).toMatchObject({ checking: false, lastCheckedMs: 3000, error: CHECK_ERROR_TEXT });
    expect(CHECK_ERROR_TEXT).not.toMatch(/json|http|remote|404/i);
  });

  it("install_start limpa erro anterior", () => {
    const state = updateStatusReducer({ ...initialUpdateState, error: "antigo" }, { type: "install_start" });
    expect(state).toMatchObject({ installing: true, error: null });
  });

  it("install_error para de instalar e mostra mensagem amigável", () => {
    const state = updateStatusReducer({ ...initialUpdateState, installing: true }, { type: "install_error" });
    expect(state).toMatchObject({ installing: false, error: INSTALL_ERROR_TEXT });
  });

  it("install_done só para de instalar", () => {
    const state = updateStatusReducer({ ...initialUpdateState, installing: true }, { type: "install_done" });
    expect(state.installing).toBe(false);
  });
});

describe("statusHint", () => {
  it("fica vazio antes da primeira checagem", () => {
    expect(statusHint(initialUpdateState)).toBeUndefined();
  });

  it("diz que está na versão mais recente quando não há update", () => {
    const hint = statusHint({ ...initialUpdateState, lastCheckedMs: new Date(2026, 9, 15, 9, 5).getTime() });
    expect(hint).toBe("Você está na versão mais recente. Verificado às 09:05.");
  });

  it("mostra a versão disponível quando há update", () => {
    const hint = statusHint({
      ...initialUpdateState,
      availableVersion: "0.2.0",
      lastCheckedMs: new Date(2026, 9, 15, 14, 30).getTime(),
    });
    expect(hint).toBe("Versão 0.2.0 disponível. Verificado às 14:30.");
  });

  it("prioriza o erro sobre o horário", () => {
    expect(statusHint({ ...initialUpdateState, error: CHECK_ERROR_TEXT, lastCheckedMs: 1 })).toBe(CHECK_ERROR_TEXT);
  });
});

describe("formatCheckedAt", () => {
  it("formata com zero à esquerda", () => {
    expect(formatCheckedAt(new Date(2026, 0, 1, 7, 3).getTime())).toBe("07:03");
  });
});
