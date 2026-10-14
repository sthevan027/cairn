use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::{
    io::{Read, Write},
    time::{Duration, Instant},
};

fn escape(bytes: &[u8]) -> String {
    let mut s = String::new();
    for &b in bytes {
        match b {
            0x1b => s.push_str("<ESC>"),
            0x07 => s.push_str("<BEL>"),
            b'\r' => s.push_str("<CR>"),
            b'\n' => s.push_str("<LF>\n"),
            0x20..=0x7e => s.push(b as char),
            _ => s.push_str(&format!("<{:02x}>", b)),
        }
    }
    s
}

#[test]
fn pwsh_emite_marcadores_e_preserva_o_status_para_o_prompt_original() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../integration").replace('\\', "/");
    let pair = native_pty_system()
        .openpty(PtySize { rows: 30, cols: 100, pixel_width: 0, pixel_height: 0 })
        .unwrap();
    let mut cmd = CommandBuilder::new("pwsh.exe");
    // prompt de mentira que expõe o $? que ele enxerga, no lugar do oh-my-posh
    let boot = format!("function prompt {{ 'PS-ok=' + $? + '> ' }}; . '{dir}/pwsh-integration.ps1'");
    cmd.args(["-NoLogo", "-NoProfile", "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", &boot]);
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

    let script: Vec<&[u8]> = vec![
        b"Get-Date -Format yyyy\r",
        b"Get-Item C:\\nao-existe-xyz\r",
        b"cmd /c exit 7\r",
        b"\r", // Enter vazio: nao pode gerar bloco
        b"Write-Host -NoNewline sem-quebra\r",
        b"exit\r",
    ];
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
        if next < script.len() && Instant::now() > last_send + Duration::from_millis(1800) {
            writer.write_all(script[next]).unwrap();
            writer.flush().unwrap();
            next += 1;
            last_send = Instant::now();
        }
        if next == script.len() && Instant::now() > last_send + Duration::from_secs(3) {
            break;
        }
    }
    let _ = child.kill();
    println!("--- BYTES ---\n{}\n--- FIM ---", escape(&out));

    let s = String::from_utf8_lossy(&out).to_string();
    let count = |needle: &str| s.matches(needle).count();

    // 5 comandos nao vazios (inclui o exit); o Enter vazio nao conta
    assert_eq!(count("\x1b]9278;pre;"), 5, "numero de pre");
    // codigos de saida: yyyy=0, Get-Item falha=1, cmd exit 7, Write-Host=0
    assert!(s.contains("\x1b]9278;post;0;"), "post 0");
    assert!(s.contains("\x1b]9278;post;1;"), "post 1 (cmdlet com erro)");
    assert!(s.contains("\x1b]9278;post;7;"), "post 7 (comando externo)");
    // o prompt original viu o $? verdadeiro depois do erro e do sucesso
    assert!(s.contains("PS-ok=False> "), "prompt original nao viu $? falso");
    assert!(s.contains("PS-ok=True> "), "prompt original nao viu $? verdadeiro");

    // ordem: pre do Write-Host -> texto -> post que o fecha
    let pre = s
        .find("\x1b]9278;pre;V3JpdGUtSG9zdCAtTm9OZXdsaW5lIHNlbS1xdWVicmE=\x07")
        .expect("pre do Write-Host");
    let tail = &s[pre..];
    let text = tail.find("sem-quebra").expect("saida do Write-Host");
    let post = tail.find("\x1b]9278;post;").expect("post do Write-Host");
    assert!(text < post, "saida sem quebra vazou para depois do post");
}
