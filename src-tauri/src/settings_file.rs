use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};
use tauri::{AppHandle, Emitter, Manager};

fn settings_path_of(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join("settings.json"))
        .map_err(|e| e.to_string())
}

fn read_file(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Grava num arquivo temporário e renomeia por cima: quem recarrega nunca vê meio arquivo.
fn write_atomic(path: &Path, text: &str) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn mtime(path: &Path) -> Option<SystemTime> {
    fs::metadata(path).and_then(|m| m.modified()).ok()
}

/// Se o arquivo mudou desde `last`, devolve o novo conteúdo e atualiza `last`.
fn poll_once(path: &Path, last: &mut Option<SystemTime>) -> Option<String> {
    let now = mtime(path);
    if now == *last {
        return None;
    }
    *last = now;
    read_file(path).ok().flatten()
}

#[tauri::command]
pub fn read_settings(app: AppHandle) -> Result<Option<String>, String> {
    read_file(&settings_path_of(&app)?)
}

#[tauri::command]
pub fn write_settings(app: AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| format!("JSON inválido: {e}"))?;
    write_atomic(&settings_path_of(&app)?, &json)
}

#[tauri::command]
pub fn settings_path(app: AppHandle) -> Result<String, String> {
    Ok(settings_path_of(&app)?.to_string_lossy().to_string())
}

/// Abre o Explorer com o arquivo de configuração selecionado.
#[tauri::command]
pub fn reveal_settings(app: AppHandle) -> Result<(), String> {
    let path = settings_path_of(&app)?;
    if !path.exists() {
        return Err("o arquivo de configuração ainda não existe".into());
    }
    #[cfg(windows)]
    {
        // O explorer.exe devolve código 1 mesmo quando abre direito: ignora o status.
        let _ = std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn();
    }
    Ok(())
}

/// Avisa o app (evento `settings-file-changed`) quando o arquivo muda, inclusive por edição manual.
pub fn start_watcher(app: AppHandle) {
    let Ok(path) = settings_path_of(&app) else {
        return;
    };
    std::thread::spawn(move || {
        let mut last = mtime(&path);
        loop {
            std::thread::sleep(Duration::from_millis(800));
            if let Some(text) = poll_once(&path, &mut last) {
                let _ = app.emit("settings-file-changed", text);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("cairn-test-settings").join(name);
        let _ = fs::remove_dir_all(&dir);
        dir.join("settings.json")
    }

    #[test]
    fn arquivo_ausente_nao_e_erro_e_a_gravacao_cria_as_pastas() {
        let path = temp_file("criar");
        assert_eq!(read_file(&path).unwrap(), None);
        write_atomic(&path, r#"{"a":1}"#).unwrap();
        assert_eq!(read_file(&path).unwrap().as_deref(), Some(r#"{"a":1}"#));
        assert!(!path.with_extension("json.tmp").exists(), "o temporario nao pode sobrar");
    }

    #[test]
    fn regravar_substitui_o_conteudo() {
        let path = temp_file("regravar");
        write_atomic(&path, "um").unwrap();
        write_atomic(&path, "dois").unwrap();
        assert_eq!(read_file(&path).unwrap().as_deref(), Some("dois"));
    }

    #[test]
    fn poll_so_devolve_quando_o_arquivo_muda() {
        let path = temp_file("poll");
        write_atomic(&path, "v1").unwrap();
        let mut last = mtime(&path);
        assert_eq!(poll_once(&path, &mut last), None, "sem mudanca, sem evento");

        std::thread::sleep(Duration::from_millis(1100)); // garante mtime diferente em qualquer FS
        write_atomic(&path, "v2").unwrap();
        assert_eq!(poll_once(&path, &mut last).as_deref(), Some("v2"));
        assert_eq!(poll_once(&path, &mut last), None, "o mesmo estado nao dispara de novo");
    }
}
