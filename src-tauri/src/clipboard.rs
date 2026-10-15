use serde::Serialize;
use std::borrow::Cow;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

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
    // O contador evita que duas colagens no mesmo milissegundo sobrescrevam o mesmo arquivo.
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = dir.join(format!("colagem-{stamp}-{n}.png"));

    let rgba: Cow<[u8]> = Cow::Borrowed(&image.bytes);
    let buffer = image::RgbaImage::from_raw(image.width as u32, image.height as u32, rgba.into_owned())
        .ok_or("imagem da área de transferência inválida")?;
    buffer.save(&path).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pixels(width: usize, height: usize) -> arboard::ImageData<'static> {
        // Vermelho opaco em todos os pixels (RGBA).
        let bytes: Vec<u8> = (0..width * height).flat_map(|_| [255u8, 0, 0, 255]).collect();
        arboard::ImageData { width, height, bytes: Cow::Owned(bytes) }
    }

    #[test]
    fn texto_serializa_com_kind_e_value() {
        let json = serde_json::to_string(&Clip::Text("oi".into())).unwrap();
        assert_eq!(json, r#"{"kind":"text","value":"oi"}"#);
    }

    #[test]
    fn imagem_serializa_com_o_caminho() {
        // O JSON escapa cada barra invertida do caminho do Windows (\ vira \\).
        let json = serde_json::to_string(&Clip::Image(r"C:\t\a.png".into())).unwrap();
        assert_eq!(json, r#"{"kind":"image","value":"C:\\t\\a.png"}"#);
    }

    #[test]
    fn vazio_serializa_so_com_kind() {
        let json = serde_json::to_string(&Clip::Empty).unwrap();
        assert_eq!(json, r#"{"kind":"empty"}"#);
    }

    #[test]
    fn grava_um_png_valido_com_o_tamanho_certo() {
        let path = save_png(&pixels(3, 2)).unwrap();
        let bytes = fs::read(&path).unwrap();
        assert_eq!(&bytes[..8], &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);

        let img = image::open(&path).unwrap().to_rgba8();
        assert_eq!((img.width(), img.height()), (3, 2));
        assert_eq!(img.get_pixel(0, 0).0, [255, 0, 0, 255]);

        assert!(path.contains("cairn-colagem"));
        assert!(path.ends_with(".png"));
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn dois_salvamentos_seguidos_geram_arquivos_diferentes() {
        let a = save_png(&pixels(1, 1)).unwrap();
        let b = save_png(&pixels(1, 1)).unwrap();
        assert_ne!(a, b);
        fs::remove_file(a).unwrap();
        fs::remove_file(b).unwrap();
    }

    #[test]
    fn rejeita_buffer_com_tamanho_errado() {
        let ruim = arboard::ImageData { width: 2, height: 2, bytes: Cow::Owned(vec![0u8; 4]) };
        assert!(save_png(&ruim).is_err());
    }
}
