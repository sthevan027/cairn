import { useCallback, useEffect, useReducer, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { initialUpdateState, updateStatusReducer } from "./updateStatus";
import type { UpdateState } from "./updateStatus";

export interface UseUpdateStatus {
  state: UpdateState;
  checkNow: () => void;
  install: () => void;
}

/** Checa uma vez quando a janela carrega (em silêncio), depois só sob demanda. */
export function useUpdateStatus(): UseUpdateStatus {
  const [state, dispatch] = useReducer(updateStatusReducer, initialUpdateState);
  const found = useRef<Update | null>(null);

  const runCheck = useCallback(async (silent: boolean) => {
    dispatch({ type: "check_start" });
    try {
      const update = await check();
      found.current = update ?? null;
      dispatch({ type: "check_success", version: update?.version ?? null, nowMs: Date.now() });
    } catch (err) {
      console.warn("cairn: update check failed:", err);
      dispatch({ type: "check_error", silent, nowMs: Date.now() });
    }
  }, []);

  useEffect(() => {
    runCheck(true);
    // Uma vez, quando a janela carrega; não a cada re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkNow = useCallback(() => {
    runCheck(false);
  }, [runCheck]);

  const install = useCallback(() => {
    const update = found.current;
    if (!update) return;
    dispatch({ type: "install_start" });
    update
      .downloadAndInstall()
      .then(() => relaunch())
      .then(() => dispatch({ type: "install_done" }))
      .catch((err) => {
        console.warn("cairn: update install failed:", err);
        dispatch({ type: "install_error" });
      });
  }, []);

  return { state, checkNow, install };
}
