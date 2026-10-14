use serde::Serialize;
use std::{path::PathBuf, process::Command};

use crate::pty::find_in_path;

/// `/c/Users/x` (o `$PWD` do Git Bash) vira `C:/Users/x`; qualquer outro caminho passa direto.
pub fn normalize_cwd(cwd: &str) -> String {
    let bytes = cwd.as_bytes();
    let is_drive = |i: usize| bytes.get(i).is_some_and(|b| b.is_ascii_alphabetic());
    if bytes.first() == Some(&b'/') && is_drive(1) {
        let letter = (bytes[1] as char).to_ascii_uppercase();
        if bytes.len() == 2 {
            return format!("{letter}:/");
        }
        if bytes[2] == b'/' {
            return format!("{letter}:/{}", &cwd[3..]);
        }
    }
    cwd.to_string()
}

fn git(dir: &str, args: &[&str]) -> Option<String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(normalize_cwd(dir)).args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: sem piscar um console
    }
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!text.is_empty()).then_some(text)
}

#[derive(Serialize, Debug, Default, PartialEq)]
pub struct GitInfo {
    pub branch: String,
    pub staged: u32,
    pub unstaged: u32,
    pub untracked: u32,
    pub ahead: u32,
    pub behind: u32,
}

/// Lê a saída de `git status --porcelain=v2 --branch` (branch, ahead/behind e contagem de mudanças).
pub fn parse_status(text: &str) -> Option<GitInfo> {
    let mut info = GitInfo::default();
    let mut oid = String::new();
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("# branch.oid ") {
            oid = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("# branch.head ") {
            info.branch = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            for token in rest.split_whitespace() {
                if let Some(n) = token.strip_prefix('+') {
                    info.ahead = n.parse().unwrap_or(0);
                } else if let Some(n) = token.strip_prefix('-') {
                    info.behind = n.parse().unwrap_or(0);
                }
            }
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            let mut xy = line.chars().skip(2);
            if xy.next().is_some_and(|c| c != '.') {
                info.staged += 1;
            }
            if xy.next().is_some_and(|c| c != '.') {
                info.unstaged += 1;
            }
        } else if line.starts_with("u ") {
            info.unstaged += 1;
        } else if line.starts_with("? ") {
            info.untracked += 1;
        }
    }
    if info.branch == "(detached)" {
        info.branch = oid.chars().take(7).collect();
    }
    (!info.branch.is_empty()).then_some(info)
}

pub fn git_info_of(dir: &str) -> Option<GitInfo> {
    parse_status(&git(dir, &["status", "--porcelain=v2", "--branch"])?)
}

/// Branch e estado do repositório de `cwd`; fora de um repositório, `None`.
#[tauri::command]
pub async fn git_info(cwd: String) -> Option<GitInfo> {
    tauri::async_runtime::spawn_blocking(move || git_info_of(&cwd))
        .await
        .ok()
        .flatten()
}

#[derive(Serialize)]
pub struct EnvInfo {
    user: String,
    host: String,
    home: String,
}

/// Quem está logado e onde: alimenta os widgets de usuário, computador e `~` do prompt do Cairn.
#[tauri::command]
pub fn env_info() -> EnvInfo {
    let var = |names: &[&str]| {
        names
            .iter()
            .find_map(|n| std::env::var(n).ok().filter(|v| !v.is_empty()))
            .unwrap_or_default()
    };
    EnvInfo {
        user: var(&["USERNAME", "USER"]),
        host: var(&["COMPUTERNAME", "HOSTNAME"]),
        home: var(&["USERPROFILE", "HOME"]),
    }
}

#[derive(Serialize)]
pub struct ShellOption {
    name: String,
    path: String,
}

fn option(name: &str, path: impl Into<String>) -> ShellOption {
    ShellOption {
        name: name.to_string(),
        path: path.into(),
    }
}

/// Shells que o menu do `+` oferece (só os que existem nesta máquina).
#[tauri::command]
pub fn available_shells() -> Vec<ShellOption> {
    let mut shells = Vec::new();
    if cfg!(windows) {
        if find_in_path("pwsh.exe").is_some() {
            shells.push(option("PowerShell 7", "pwsh.exe"));
        }
        if let Some(root) = std::env::var_os("SystemRoot") {
            let path = PathBuf::from(root).join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
            if path.is_file() {
                shells.push(option("Windows PowerShell", path.to_string_lossy()));
            }
        }
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
        let git_bash = [
            Some(PathBuf::from(r"C:\Program Files\Git\bin\bash.exe")),
            Some(PathBuf::from(r"C:\Program Files (x86)\Git\bin\bash.exe")),
            local.map(|l| l.join(r"Programs\Git\bin\bash.exe")),
        ];
        if let Some(path) = git_bash.into_iter().flatten().find(|p| p.is_file()) {
            shells.push(option("Git Bash", path.to_string_lossy()));
        }
    } else if let Ok(shell) = std::env::var("SHELL") {
        shells.push(option("Shell padrão", shell));
    }
    shells
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normaliza_caminho_do_git_bash() {
        assert_eq!(normalize_cwd("/c/Users/Sthev"), "C:/Users/Sthev");
        assert_eq!(normalize_cwd("/d/Projetos/cairn"), "D:/Projetos/cairn");
        assert_eq!(normalize_cwd("/c"), "C:/");
        assert_eq!(normalize_cwd(r"C:\Users\Sthev"), r"C:\Users\Sthev");
        assert_eq!(normalize_cwd("/usr/bin"), "/usr/bin");
        assert_eq!(normalize_cwd(""), "");
    }

    #[test]
    fn estado_do_proprio_repositorio_e_nada_fora_dele() {
        let repo = concat!(env!("CARGO_MANIFEST_DIR"), "/..");
        assert!(git_info_of(repo).is_some_and(|g| !g.branch.is_empty()));
        let fora = std::env::temp_dir().join("cairn-sem-git");
        std::fs::create_dir_all(&fora).unwrap();
        assert_eq!(git_info_of(&fora.to_string_lossy()), None);
    }

    #[test]
    fn parse_status_conta_mudancas_e_le_ahead_behind() {
        let saida = "# branch.oid 1234567890abcdef
# branch.head main
# branch.upstream origin/main
# branch.ab +2 -1
1 M. N... 100644 100644 100644 a b src/a.rs
1 .M N... 100644 100644 100644 a b src/b.rs
1 MM N... 100644 100644 100644 a b src/c.rs
2 R. N... 100644 100644 100644 a b R100 novo.rs	antigo.rs
u UU N... 100644 100644 100644 100644 a b c conflito.rs
? sujeira.txt
? outra.txt
";
        let g = parse_status(saida).unwrap();
        assert_eq!(
            g,
            GitInfo { branch: "main".into(), staged: 3, unstaged: 3, untracked: 2, ahead: 2, behind: 1 }
        );
    }

    #[test]
    fn parse_status_cobre_head_solto_repo_limpo_e_lixo() {
        let solto = "# branch.oid abcdef0123456789
# branch.head (detached)
";
        assert_eq!(parse_status(solto).unwrap().branch, "abcdef0");
        let limpo = parse_status("# branch.oid x
# branch.head dev
").unwrap();
        assert_eq!((limpo.staged, limpo.unstaged, limpo.untracked, limpo.ahead, limpo.behind), (0, 0, 0, 0, 0));
        assert_eq!(parse_status(""), None);
        assert_eq!(parse_status("qualquer coisa"), None);
    }

    #[test]
    fn env_info_traz_o_usuario_desta_maquina() {
        assert!(!env_info().user.is_empty());
    }

    #[test]
    fn lista_pelo_menos_um_shell_nesta_maquina() {
        assert!(!available_shells().is_empty());
    }
}
