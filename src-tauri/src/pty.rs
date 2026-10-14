use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::PathBuf,
    sync::Mutex,
};
use serde::Serialize;
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    AppHandle, Emitter, State,
};

const BASH_INTEGRATION: &str = include_str!("../../integration/bash-integration.sh");
const BASH_RC: &str = include_str!("../../integration/bash-rc.sh");
const PWSH_INTEGRATION: &str = include_str!("../../integration/pwsh-integration.ps1");

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

/// Uma sessão de PTY por aba, indexadas por id.
#[derive(Default)]
pub struct PtyState {
    sessions: Mutex<HashMap<u64, PtySession>>,
    next_id: Mutex<u64>,
}

impl PtyState {
    fn allocate_id(&self) -> u64 {
        let mut next = self.next_id.lock().unwrap();
        *next += 1;
        *next
    }

    fn kill(&self, id: u64) {
        if let Some(mut session) = self.sessions.lock().unwrap().remove(&id) {
            let _ = session.child.kill();
        }
    }
}

pub(crate) fn find_in_path(exe: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(exe))
        .find(|candidate| candidate.is_file())
}

pub fn default_shell() -> String {
    if let Ok(shell) = std::env::var("CAIRN_SHELL") {
        return shell;
    }
    if cfg!(windows) {
        if find_in_path("pwsh.exe").is_some() {
            "pwsh.exe".into()
        } else {
            "powershell.exe".into()
        }
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
    }
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

#[derive(Serialize)]
pub struct SpawnInfo {
    id: u64,
    /// true quando o shell carregou a integração e emite os marcadores de bloco (OSC 9278).
    integrated: bool,
    shell: String,
}

#[derive(PartialEq)]
enum ShellKind {
    Bash,
    PowerShell,
    Other,
}

fn shell_kind(shell: &str) -> ShellKind {
    let stem = std::path::Path::new(shell)
        .file_stem()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match stem.as_str() {
        "bash" => ShellKind::Bash,
        "pwsh" | "powershell" => ShellKind::PowerShell,
        _ => ShellKind::Other,
    }
}

/// Grava os scripts de integração numa pasta temporária e devolve o caminho (com `/`).
fn write_integration_scripts() -> Result<String, String> {
    let dir = std::env::temp_dir().join("cairn").join("integration");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("bash-integration.sh"), BASH_INTEGRATION).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("bash-rc.sh"), BASH_RC).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("pwsh-integration.ps1"), PWSH_INTEGRATION).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().replace('\\', "/"))
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }
}

/// Abre o PTY, sobe o shell e começa a repassar a saída crua (bytes) pelo canal.
/// Devolve o id da sessão; o evento `pty-exit` carrega esse id.
#[tauri::command]
pub fn spawn_shell(
    app: AppHandle,
    state: State<PtyState>,
    on_output: Channel<InvokeResponseBody>,
    cols: u16,
    rows: u16,
    shell: Option<String>,
) -> Result<SpawnInfo, String> {
    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(|e| e.to_string())?;

    let shell = shell.unwrap_or_else(default_shell);
    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    let integrated = match shell_kind(&shell) {
        ShellKind::Bash => {
            let dir = write_integration_scripts()?;
            cmd.args(["--rcfile", &format!("{dir}/bash-rc.sh"), "-i"]);
            cmd.env("CAIRN_INTEGRATION", &dir);
            true
        }
        ShellKind::PowerShell => {
            // Sem -NoProfile: o perfil do usuário (ex. oh-my-posh) carrega e a integração o embrulha.
            let dir = write_integration_scripts()?;
            cmd.args([
                "-NoLogo",
                "-NoExit",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &format!(". '{dir}/pwsh-integration.ps1'"),
            ]);
            true
        }
        ShellKind::Other => false,
    };
    if let Some(home) = home_dir() {
        cmd.cwd(home);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = state.allocate_id();

    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if on_output
                        .send(InvokeResponseBody::Raw(buf[..n].to_vec()))
                        .is_err()
                    {
                        break;
                    }
                }
            }
        }
        let _ = app.emit("pty-exit", id);
    });

    state.sessions.lock().unwrap().insert(
        id,
        PtySession {
            master: pair.master,
            writer,
            child,
        },
    );
    Ok(SpawnInfo { id, integrated, shell })
}

#[tauri::command]
pub fn write_to_pty(state: State<PtyState>, id: u64, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.get_mut(&id).ok_or("sessão de PTY inexistente")?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_pty(state: State<PtyState>, id: u64, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions.get(&id).ok_or("sessão de PTY inexistente")?;
    session
        .master
        .resize(size(cols, rows))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_pty(state: State<PtyState>, id: u64) {
    state.kill(id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_real_roda_comando_e_devolve_saida() {
        let pair = native_pty_system().openpty(size(100, 30)).unwrap();
        let mut cmd = CommandBuilder::new(default_shell());
        if cfg!(windows) {
            cmd.args(["-NoLogo", "-NoProfile"]);
        }
        let mut child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut writer = pair.master.take_writer().unwrap();
        writer.write_all(b"echo marcador-warp-123\r\nexit\r\n").unwrap();
        writer.flush().unwrap();

        let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 || tx.send(buf[..n].to_vec()).is_err() {
                    break;
                }
            }
        });

        let mut out = Vec::new();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while std::time::Instant::now() < deadline {
            if let Ok(chunk) = rx.recv_timeout(std::time::Duration::from_millis(200)) {
                // ConPTY pede a posição do cursor e espera resposta (o xterm.js faz isso no app real)
                if chunk.windows(4).any(|w| w == b"[6n") {
                    writer.write_all(b"[1;1R").unwrap();
                    writer.flush().unwrap();
                }
                out.extend(chunk);
                if String::from_utf8_lossy(&out).matches("marcador-warp-123").count() >= 2 {
                    break;
                }
            }
        }
        let _ = child.kill();
        let text = String::from_utf8_lossy(&out);
        // 1ª ocorrência = eco do que foi digitado; 2ª = saída do comando
        assert!(text.matches("marcador-warp-123").count() >= 2, "saída: {text}");
    }
}

#[cfg(test)]
mod manager_tests {
    use super::*;

    fn real_session() -> PtySession {
        let pair = native_pty_system().openpty(size(80, 24)).unwrap();
        let mut cmd = CommandBuilder::new(default_shell());
        if cfg!(windows) {
            cmd.args(["-NoLogo", "-NoProfile"]);
        }
        let child = pair.slave.spawn_command(cmd).unwrap();
        let writer = pair.master.take_writer().unwrap();
        PtySession { master: pair.master, writer, child }
    }

    #[test]
    fn varias_sessoes_convivem_e_cada_uma_morre_sozinha() {
        let state = PtyState::default();
        let (a, b) = (state.allocate_id(), state.allocate_id());
        assert_ne!(a, b);
        state.sessions.lock().unwrap().insert(a, real_session());
        state.sessions.lock().unwrap().insert(b, real_session());

        state.kill(a);
        {
            let sessions = state.sessions.lock().unwrap();
            assert!(!sessions.contains_key(&a), "a sessao morta saiu do mapa");
            assert!(sessions.contains_key(&b), "a outra continua viva");
        }
        state.kill(b);
        assert!(state.sessions.lock().unwrap().is_empty());
        state.kill(999); // id inexistente nao pode dar panico
    }
}
