use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

const KEY_SERVICE: &str = "cairn";
const KEY_USER: &str = "anthropic-api-key";
const API_BASE: &str = "https://api.anthropic.com";
const DEFAULT_MODEL: &str = "claude-opus-5-5";
const MAX_TOKENS: u32 = 2048;

const SYSTEM_PROMPT: &str = "You turn a request written in natural language into ONE shell command \
for the user's terminal. Reply with the command only: no explanation, no markdown, no code fence, \
a single line. Use the shell named in the request (PowerShell syntax for PowerShell, POSIX for \
bash). Prefer commands that only read or list; if the request is destructive, still write the \
command but keep it as narrow as possible (specific path, no wildcards on a drive root). If you \
cannot express the request as one command, reply with a single line starting with '# ' that \
explains why.";

#[derive(Deserialize)]
pub struct RecentCommand {
    command: String,
    exit_code: Option<i32>,
}

#[derive(Deserialize)]
pub struct SuggestRequest {
    prompt: String,
    shell: String,
    cwd: Option<String>,
    #[serde(default)]
    recent: Vec<RecentCommand>,
    /// Modelo escolhido nas configurações do app; sem ele vale `CAIRN_AI_MODEL` e, por fim, o padrão.
    #[serde(default)]
    model: Option<String>,
}

fn chosen_model(req: &SuggestRequest) -> String {
    req.model
        .as_deref()
        .map(str::trim)
        .filter(|m| !m.is_empty())
        .map(str::to_string)
        .unwrap_or_else(model)
}

fn model() -> String {
    std::env::var("CAIRN_AI_MODEL")
        .ok()
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string())
}

fn user_message(req: &SuggestRequest) -> String {
    let mut msg = format!(
        "Request: {}\nOS: Windows\nShell: {}\n",
        req.prompt.trim(),
        req.shell
    );
    if let Some(cwd) = req.cwd.as_deref().filter(|c| !c.is_empty()) {
        msg.push_str(&format!("Current directory: {cwd}\n"));
    }
    if !req.recent.is_empty() {
        msg.push_str("Recent commands (oldest first):\n");
        for c in &req.recent {
            let status = c.exit_code.map_or(String::new(), |code| format!(" (exit {code})"));
            msg.push_str(&format!("- {}{}\n", c.command.trim(), status));
        }
    }
    msg
}

fn build_body(model: &str, req: &SuggestRequest) -> Value {
    let mut body = json!({
        "model": model,
        "max_tokens": MAX_TOKENS,
        "output_config": { "effort": "low" },
        "system": SYSTEM_PROMPT,
        "messages": [{ "role": "user", "content": user_message(req) }],
    });
    // Fallback no servidor se o classificador de segurança recusar; só existe para o modelo padrão.
    if model == DEFAULT_MODEL {
        body["fallbacks"] = json!("default");
    }
    body
}

/// Deixa só uma linha de texto: sem cerca de código, sem quebras, sem caracteres de controle.
/// Nada que venha da IA pode conter Enter, senão o comando executaria sozinho.
fn sanitize_command(text: &str) -> String {
    let line = text
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with("```"))
        .unwrap_or("");
    line.chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .trim_matches('`')
        .trim()
        .to_string()
}

fn parse_response(body: &Value) -> Result<String, String> {
    if body["stop_reason"] == "refusal" {
        return Err("A IA recusou esse pedido (filtro de segurança). Reformule.".into());
    }
    let text: String = body["content"]
        .as_array()
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b["type"] == "text")
                .filter_map(|b| b["text"].as_str())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    let command = sanitize_command(&text);
    if command.is_empty() {
        return Err("A IA não devolveu nenhum comando.".into());
    }
    Ok(command)
}

async fn request_suggestion(
    base_url: &str,
    api_key: &str,
    model: &str,
    req: &SuggestRequest,
) -> Result<String, String> {
    let mut request = reqwest::Client::new()
        .post(format!("{base_url}/v1/messages"))
        .timeout(Duration::from_secs(60))
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&build_body(model, req));
    if model == DEFAULT_MODEL {
        request = request.header("anthropic-beta", "server-side-fallback-2026-07-01");
    }
    let response = request.send().await.map_err(|e| format!("falha de rede: {e}"))?;
    let status = response.status();
    let body: Value = response
        .json()
        .await
        .map_err(|e| format!("resposta inválida da API: {e}"))?;
    if !status.is_success() {
        let message = body["error"]["message"].as_str().unwrap_or("erro desconhecido");
        return Err(format!("API {}: {message}", status.as_u16()));
    }
    parse_response(&body)
}

fn stored_key() -> Option<String> {
    keyring::Entry::new(KEY_SERVICE, KEY_USER)
        .ok()?
        .get_password()
        .ok()
        .filter(|k| !k.trim().is_empty())
}

/// Credential Manager primeiro; `ANTHROPIC_API_KEY` do ambiente como alternativa.
fn api_key() -> Option<String> {
    stored_key().or_else(|| {
        std::env::var("ANTHROPIC_API_KEY")
            .ok()
            .filter(|k| !k.trim().is_empty())
    })
}

#[tauri::command]
pub fn has_api_key() -> bool {
    api_key().is_some()
}

#[tauri::command]
pub fn set_api_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("chave vazia".into());
    }
    keyring::Entry::new(KEY_SERVICE, KEY_USER)
        .and_then(|entry| entry.set_password(key))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_api_key() -> Result<(), String> {
    match keyring::Entry::new(KEY_SERVICE, KEY_USER).and_then(|entry| entry.delete_credential()) {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn suggest_command(req: SuggestRequest) -> Result<String, String> {
    if req.prompt.trim().is_empty() {
        return Err("descreva o que você quer fazer".into());
    }
    let key = api_key().ok_or("sem chave da Anthropic configurada")?;
    let base = std::env::var("ANTHROPIC_BASE_URL").unwrap_or_else(|_| API_BASE.to_string());
    request_suggestion(base.trim_end_matches('/'), &key, &chosen_model(&req), &req).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn request() -> SuggestRequest {
        SuggestRequest {
            prompt: "lista os .md modificados essa semana".into(),
            shell: "pwsh.exe".into(),
            cwd: Some("C:/Users/Sthev".into()),
            recent: vec![RecentCommand { command: "git status".into(), exit_code: Some(0) }],
            model: None,
        }
    }

    #[test]
    fn modelo_vem_da_configuracao_e_so_cai_no_padrao_sem_ele() {
        let com: SuggestRequest = serde_json::from_str(
            r#"{"prompt":"x","shell":"pwsh.exe","model":"claude-haiku-5-5"}"#,
        )
        .unwrap();
        assert_eq!(chosen_model(&com), "claude-haiku-5-5");

        let vazio: SuggestRequest =
            serde_json::from_str(r#"{"prompt":"x","shell":"pwsh.exe","model":"   "}"#).unwrap();
        let sem: SuggestRequest = serde_json::from_str(r#"{"prompt":"x","shell":"pwsh.exe"}"#).unwrap();
        assert_eq!(chosen_model(&vazio), model());
        assert_eq!(chosen_model(&sem), model());
    }

    #[test]
    fn sanitize_remove_cerca_quebras_e_controle() {
        assert_eq!(sanitize_command("```powershell\nGet-ChildItem *.md\n```"), "Get-ChildItem *.md");
        assert_eq!(sanitize_command("`ls -la`"), "ls -la");
        assert_eq!(sanitize_command("ls\nrm -rf /"), "ls");
        assert_eq!(sanitize_command("echo a\x1b[2Jb\r"), "echo a[2Jb");
        assert_eq!(sanitize_command("   \n\n"), "");
    }

    #[test]
    fn parse_ignora_blocos_de_thinking_e_trata_recusa() {
        let ok = json!({"stop_reason":"end_turn","content":[
            {"type":"thinking","thinking":""},
            {"type":"text","text":"Get-Date"}]});
        assert_eq!(parse_response(&ok).unwrap(), "Get-Date");

        let refusal = json!({"stop_reason":"refusal","content":[]});
        assert!(parse_response(&refusal).unwrap_err().contains("recusou"));

        let empty = json!({"stop_reason":"end_turn","content":[{"type":"text","text":"  "}]});
        assert!(parse_response(&empty).is_err());
    }

    #[test]
    fn corpo_leva_contexto_effort_e_fallback_so_no_modelo_padrao() {
        let body = build_body(DEFAULT_MODEL, &request());
        assert_eq!(body["model"], "claude-opus-5-5");
        assert_eq!(body["output_config"]["effort"], "low");
        assert_eq!(body["fallbacks"], "default");
        let user = body["messages"][0]["content"].as_str().unwrap();
        assert!(user.contains("pwsh.exe") && user.contains("C:/Users/Sthev") && user.contains("git status (exit 0)"));

        let outro = build_body("claude-haiku-5-5", &request());
        assert!(outro.get("fallbacks").is_none());
    }

    /// Sobe um servidor HTTP mínimo, devolve `reply` e entrega o pedido cru recebido.
    fn mock_server(status: &str, reply: &str) -> (String, std::sync::mpsc::Receiver<String>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let (tx, rx) = std::sync::mpsc::channel();
        let (status, reply) = (status.to_string(), reply.to_string());
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut raw = Vec::new();
            let mut buf = [0u8; 4096];
            loop {
                let n = stream.read(&mut buf).unwrap();
                raw.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&raw).to_string();
                if let Some(split) = text.find("\r\n\r\n") {
                    let len = text[..split]
                        .lines()
                        .find_map(|l| l.to_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap()))
                        .unwrap_or(0);
                    if raw.len() >= split + 4 + len {
                        break;
                    }
                }
                if n == 0 {
                    break;
                }
            }
            tx.send(String::from_utf8_lossy(&raw).to_string()).unwrap();
            let resp = format!(
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{reply}",
                reply.len()
            );
            stream.write_all(resp.as_bytes()).unwrap();
        });
        (url, rx)
    }

    #[tokio::test]
    async fn pedido_http_leva_headers_certos_e_devolve_o_comando() {
        let reply = r#"{"stop_reason":"end_turn","content":[{"type":"thinking","thinking":""},{"type":"text","text":"```\nGet-ChildItem -Recurse *.md\n```"}]}"#;
        let (url, rx) = mock_server("200 OK", reply);
        let command = request_suggestion(&url, "sk-test-123", DEFAULT_MODEL, &request()).await.unwrap();
        assert_eq!(command, "Get-ChildItem -Recurse *.md");

        let raw = rx.recv().unwrap().to_lowercase();
        assert!(raw.starts_with("post /v1/messages "), "{raw}");
        assert!(raw.contains("x-api-key: sk-test-123"));
        assert!(raw.contains("anthropic-version: 2023-06-01"));
        assert!(raw.contains("anthropic-beta: server-side-fallback-2026-07-01"));
        assert!(raw.contains("\"model\":\"claude-opus-5-5\""));
    }

    #[test]
    fn credential_manager_guarda_le_e_apaga() {
        // entrada própria de teste: não mexe na chave real do app
        let entry = keyring::Entry::new("cairn-test", "roundtrip").unwrap();
        entry.set_password("sk-ant-teste-roundtrip").unwrap();
        assert_eq!(entry.get_password().unwrap(), "sk-ant-teste-roundtrip");
        entry.delete_credential().unwrap();
        assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
    }

    #[tokio::test]
    async fn erro_da_api_vira_mensagem_sem_vazar_a_chave() {
        let reply = r#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#;
        let (url, _rx) = mock_server("401 Unauthorized", reply);
        let err = request_suggestion(&url, "sk-segredo-999", DEFAULT_MODEL, &request()).await.unwrap_err();
        assert_eq!(err, "API 401: invalid x-api-key");
        assert!(!err.contains("sk-segredo-999"));
    }
}
