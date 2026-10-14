export type Program =
  | "claude"
  | "agent"
  | "git"
  | "node"
  | "python"
  | "rust"
  | "docker"
  | "editor"
  | "ssh"
  | "shell";

const BY_NAME: Record<string, Program> = {
  claude: "claude",
  codex: "agent",
  gemini: "agent",
  aider: "agent",
  opencode: "agent",
  git: "git",
  gh: "git",
  lazygit: "git",
  node: "node",
  npm: "node",
  npx: "node",
  pnpm: "node",
  yarn: "node",
  bun: "node",
  bunx: "node",
  deno: "node",
  python: "python",
  python3: "python",
  py: "python",
  pip: "python",
  uv: "python",
  cargo: "rust",
  rustc: "rust",
  rustup: "rust",
  docker: "docker",
  podman: "docker",
  vim: "editor",
  nvim: "editor",
  vi: "editor",
  nano: "editor",
  micro: "editor",
  emacs: "editor",
  code: "editor",
  ssh: "ssh",
  scp: "ssh",
  sftp: "ssh",
  pwsh: "shell",
  powershell: "shell",
  bash: "shell",
  wsl: "shell",
};

const WRAPPERS = new Set(["sudo", "time", "nohup", "env", "command", "call"]);

/** Qual programa um comando de shell está rodando, para escolher o ícone da aba. */
export function programOf(command: string): Program | null {
  const tokens = command.trim().split(/\s+/);
  for (const raw of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(raw)) continue; // VAR=valor antes do comando
    const base = raw
      .replace(/^['"]|['"]$/g, "")
      .split(/[\\/]/)
      .pop()!
      .toLowerCase()
      .replace(/\.(exe|cmd|bat|ps1)$/, "");
    if (WRAPPERS.has(base)) continue;
    return BY_NAME[base] ?? null;
  }
  return null;
}
