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

/// Branch atual; em HEAD solto devolve o hash curto; fora de um repositório, `None`.
pub fn branch_of(dir: &str) -> Option<String> {
    git(dir, &["symbolic-ref", "--short", "-q", "HEAD"])
        .or_else(|| git(dir, &["rev-parse", "--short", "HEAD"]))
}

#[tauri::command]
pub async fn git_branch(cwd: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || branch_of(&cwd))
        .await
        .ok()
        .flatten()
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
    fn branch_do_proprio_repositorio_e_nada_fora_dele() {
        let repo = concat!(env!("CARGO_MANIFEST_DIR"), "/..");
        assert!(branch_of(repo).is_some_and(|b| !b.is_empty()));
        let fora = std::env::temp_dir().join("cairn-sem-git");
        std::fs::create_dir_all(&fora).unwrap();
        assert_eq!(branch_of(&fora.to_string_lossy()), None);
    }

    #[test]
    fn lista_pelo_menos_um_shell_nesta_maquina() {
        assert!(!available_shells().is_empty());
    }
}
