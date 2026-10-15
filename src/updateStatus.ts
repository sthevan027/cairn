export interface UpdateState {
  checking: boolean;
  installing: boolean;
  lastCheckedMs: number | null;
  availableVersion: string | null;
  error: string | null;
}

export const initialUpdateState: UpdateState = {
  checking: false,
  installing: false,
  lastCheckedMs: null,
  availableVersion: null,
  error: null,
};

/** What the person sees when a check or an install fails; the raw error only goes to the console. */
export const CHECK_ERROR_TEXT = "Não foi possível verificar atualizações agora. Tente de novo mais tarde.";
export const INSTALL_ERROR_TEXT = "Não foi possível instalar a atualização. Tente de novo.";

export type UpdateAction =
  | { type: "check_start" }
  | { type: "check_success"; version: string | null; nowMs: number }
  | { type: "check_error"; silent: boolean; nowMs: number }
  | { type: "install_start" }
  | { type: "install_error" }
  | { type: "install_done" };

export function updateStatusReducer(state: UpdateState, action: UpdateAction): UpdateState {
  switch (action.type) {
    case "check_start":
      return { ...state, checking: true, error: null };
    case "check_success":
      return {
        ...state,
        checking: false,
        lastCheckedMs: action.nowMs,
        availableVersion: action.version,
        error: null,
      };
    case "check_error":
      // Checagem automática que falha não mostra nada: só deixa de "checando".
      return action.silent
        ? { ...state, checking: false }
        : { ...state, checking: false, lastCheckedMs: action.nowMs, error: CHECK_ERROR_TEXT };
    case "install_start":
      return { ...state, installing: true, error: null };
    case "install_error":
      return { ...state, installing: false, error: INSTALL_ERROR_TEXT };
    case "install_done":
      return { ...state, installing: false };
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "09:05", pelo horário local de um instante em ms. */
export function formatCheckedAt(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Texto embaixo de "Atualizações"; undefined enquanto nenhuma checagem terminou. */
export function statusHint(state: UpdateState): string | undefined {
  if (state.error) return state.error;
  if (state.lastCheckedMs === null) return undefined;
  const checked = `Verificado às ${formatCheckedAt(state.lastCheckedMs)}.`;
  if (state.availableVersion) return `Versão ${state.availableVersion} disponível. ${checked}`;
  return `Você está na versão mais recente. ${checked}`;
}
