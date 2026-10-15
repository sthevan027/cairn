use serde::Serialize;
use std::borrow::Cow;
use std::fs;
use std::path::PathBuf;

/// O que estava na área de transferência, já no formato que a aba cola.
#[derive(Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum Clip {
    /// Texto puro.
    Text(String),
    /// Imagem salva como PNG temporário; o valor é o caminho do arquivo.
    Image(String),
    /// Nada colável (área vazia ou formato que não tratamos).
    Empty,
}

/// Lê o clipboard do sistema. Texto tem prioridade; se não houver, tenta imagem.
/// Feito no Rust porque o acesso ao clipboard pelo WebView costuma ser bloqueado.
#[tauri::command]
pub fn clipboard_read() -> Result<Clip, String> {
    let mut board = arboard::Clipboard::new().map_err(|e| e.to_string())?;

    if let Ok(text) = board.get_text() {
        if !text.is_empty() {
            return Ok(Clip::Text(text));
        }
    }

    if let Ok(image) = board.get_image() {
        let path = save_png(&image)?;
        return Ok(Clip::Image(path));
    }

    Ok(Clip::Empty)
}

/// Grava a imagem RGBA como PNG em uma pasta temporária do Cairn.
fn save_png(image: &arboard::ImageData) -> Result<String, String> {
    let dir: PathBuf = std::env::temp_dir().join("cairn-colagem");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("colagem-{stamp}.png"));

    let rgba: Cow<[u8]> = Cow::Borrowed(&image.bytes);
    let buffer = image::RgbaImage::from_raw(image.width as u32, image.height as u32, rgba.into_owned())
        .ok_or("imagem da área de transferência inválida")?;
    buffer.save(&path).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().into_owned())
}
