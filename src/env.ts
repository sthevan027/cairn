import { invoke } from "@tauri-apps/api/core";

export interface Env {
  user: string;
  host: string;
  home: string;
}

let env: Env = { user: "", host: "", home: "" };

export const getEnv = () => env;

/** Quem está logado e qual é a home: alimenta os widgets de usuário/computador e o `~` do prompt. */
export async function loadEnv(): Promise<void> {
  try {
    env = await invoke<Env>("env_info");
  } catch {
    /* sem backend: os widgets que dependem disso simplesmente não aparecem */
  }
}
