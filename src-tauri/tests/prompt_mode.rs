use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::{
    io::{Read, Write},
    time::{Duration, Instant},
};

/// Sobe o pwsh com a integracao, digita um comando em cada modo e devolve tudo que saiu.
fn run_pwsh(mode_file: &str, steps: &[(&str, Option<&str>)]) -> String {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../integration").replace('\\', "/");
    let pair = native_pty_system()
        .openpty(PtySize { rows: 30, cols: 100, pixel_width: 0, pixel_height: 0 })
        .unwrap();
    let mut cmd = CommandBuilder::new("pwsh.exe");
    cmd.args([
        "-NoLogo",
        "-NoProfile",
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        &format!("function prompt {{ 'PROMPT-DO-SHELL> ' }}; . '{dir}/pwsh-integration.ps1'"),
    ]);
    cmd.env("CAIRN_MODE_FILE", mode_file);
    let mut child = pair.slave.spawn_command(cmd).unwrap();
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().unwrap();
    let mut writer = pair.master.take_writer().unwrap();
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
    let mut next = 0usize;
    let mut last_send = Instant::now() + Duration::from_secs(3);
    let deadline = Instant::now() + Duration::from_secs(40);
    while Instant::now() < deadline {
        if let Ok(chunk) = rx.recv_timeout(Duration::from_millis(100)) {
            if chunk.windows(4).any(|w| w == b"\x1b[6n") {
                writer.write_all(b"\x1b[1;1R").unwrap();
                writer.flush().unwrap();
            }
            out.extend(chunk);
        }
        if next < steps.len() && Instant::now() > last_send + Duration::from_millis(1800) {
            // antes de digitar, troca o modo no arquivo (se o passo pedir)
            if let Some(mode) = steps[next].1 {
                std::fs::write(mode_file, mode).unwrap();
            }
            writer.write_all(steps[next].0.as_bytes()).unwrap();
            writer.flush().unwrap();
            next += 1;
            last_send = Instant::now();
        }
        if next == steps.len() && Instant::now() > last_send + Duration::from_secs(3) {
            break;
        }
    }
    let _ = child.kill();
    String::from_utf8_lossy(&out).to_string()
}

#[test]
fn pwsh_troca_o_prompt_ao_vivo_pelo_arquivo_de_modo() {
    let dir = std::env::temp_dir().join("cairn-test-promptmode-pwsh");
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("prompt-mode");
    std::fs::write(&file, "shell").unwrap();

    let out = run_pwsh(
        &file.to_string_lossy().replace('\\', "/"),
        &[
            ("echo um\r", None),            // ainda no modo shell
            ("echo dois\r", Some("cairn")), // vira cairn: o proximo prompt e minimo
            ("echo tres\r", Some("shell")), // volta ao prompt do shell
            ("exit\r", None),
        ],
    );
    let primeiro = out.find("PROMPT-DO-SHELL> ").expect("prompt do shell no inicio");
    // So o prompt minimo emite o simbolo (o do shell de teste nao tem). Nao da pra exigir a sequencia de
    // cor inteira: o ConPTY a recodifica e as predicoes do PSReadLine (alimentadas pelo historico das
    // proprias rodadas) redesenham a linha e podem separar a cor do glifo.
    let minimo = out.find('\u{276F}').expect("prompt minimo no modo cairn");
    assert!(primeiro < minimo, "o prompt minimo so aparece depois de trocar o modo");
    let volta = out[minimo..].find("PROMPT-DO-SHELL> ");
    assert!(volta.is_some(), "o prompt do shell volta quando o modo volta a shell");
}
