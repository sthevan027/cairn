use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::{
    io::{Read, Write},
    path::PathBuf,
    sync::Mutex,
};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    AppHandle, Emitter, State,
};

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    session: Mutex<Option<PtySession>>,
    next_id: Mutex<u64>,
}

fn find_in_path(exe: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(exe))
        .find(|candidate| candidate.is_file())
}

pub fn default_shell() -> String {
    if let Ok(shell) = std::env::var("WARP_SHELL") {
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
) -> Result<u64, String> {
    kill_current(&state);

    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(shell.unwrap_or_else(default_shell));
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    if let Some(home) = home_dir() {
        cmd.cwd(home);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = {
        let mut next = state.next_id.lock().unwrap();
        *next += 1;
        *next
    };

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

    *state.session.lock().unwrap() = Some(PtySession {
        master: pair.master,
        writer,
        child,
    });
    Ok(id)
}

#[tauri::command]
pub fn write_to_pty(state: State<PtyState>, data: String) -> Result<(), String> {
    let mut guard = state.session.lock().unwrap();
    let session = guard.as_mut().ok_or("nenhuma sessão de PTY ativa")?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_pty(state: State<PtyState>, cols: u16, rows: u16) -> Result<(), String> {
    let guard = state.session.lock().unwrap();
    let session = guard.as_ref().ok_or("nenhuma sessão de PTY ativa")?;
    session
        .master
        .resize(size(cols, rows))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_pty(state: State<PtyState>) {
    kill_current(&state);
}

fn kill_current(state: &PtyState) {
    if let Some(mut session) = state.session.lock().unwrap().take() {
        let _ = session.child.kill();
    }
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
