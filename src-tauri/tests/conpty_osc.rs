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

/// Roda um script no pwsh via ConPTY e devolve tudo que saiu (respondendo ao ESC[6n).
fn run_pwsh(script: &str) -> Vec<u8> {
    let pair = native_pty_system()
        .openpty(PtySize { rows: 30, cols: 100, pixel_width: 0, pixel_height: 0 })
        .unwrap();
    let mut cmd = CommandBuilder::new("pwsh.exe");
    cmd.args(["-NoLogo", "-NoProfile", "-Command", script]);
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
    let deadline = Instant::now() + Duration::from_secs(15);
    let mut quiet_since = Instant::now();
    while Instant::now() < deadline {
        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(chunk) => {
                if chunk.windows(4).any(|w| w == b"\x1b[6n") {
                    writer.write_all(b"\x1b[1;1R").unwrap();
                    writer.flush().unwrap();
                }
                out.extend(chunk);
                quiet_since = Instant::now();
            }
            Err(_) => {
                if quiet_since.elapsed() > Duration::from_millis(1500) && !out.is_empty() {
                    break;
                }
            }
        }
    }
    let _ = child.kill();
    out
}

#[test]
fn conpty_repassa_osc_customizado() {
    let out = run_pwsh(
        r#"$e=[char]27; $b=[char]7; Write-Host -NoNewline "A${e}]9278;pre;Zm9v${b}B"; Write-Host ""; Write-Host "C${e}]9278;post;0;L2hvbWU=${b}D"; Write-Host "FIM""#,
    );
    println!("--- BYTES ---\n{}\n--- FIM ---", escape(&out));
    let text = String::from_utf8_lossy(&out);
    assert!(text.contains("\x1b]9278;pre;Zm9v\x07"), "OSC pre nao chegou");
    assert!(text.contains("\x1b]9278;post;0;L2hvbWU=\x07"), "OSC post nao chegou");
}

#[test]
fn atraso_antes_do_osc_preserva_a_ordem() {
    for ms in [0u32, 10, 20, 40, 80] {
        let script = format!(
            r#"$e=[char]27; $b=[char]7; Write-Host -NoNewline "AAA"; Start-Sleep -Milliseconds {ms}; Write-Host -NoNewline "${{e}}]9278;pre;x${{b}}"; Write-Host "BBB"; Write-Host "CCC""#
        );
        let out = run_pwsh(&script);
        let s = escape(&out);
        let tail = s.split("<ESC>[?25h").last().unwrap_or(&s).replace('\n', "");
        let ok = tail.find("AAA").zip(tail.find("<ESC>]9278;pre;x<BEL>")).map_or(false, |(a, o)| a < o);
        println!("atraso {ms:>3}ms -> ordem correta: {ok:<5} | {tail}");
    }
}

#[test]
fn estresse_de_ordem_osc_vs_texto() {
    for ms in [0u32, 5, 20] {
        let script = format!(
            r#"$e=[char]27; $b=[char]7; for($i=0;$i -lt 200;$i++){{ [Console]::Out.Write("L$i;"); if({ms} -gt 0){{Start-Sleep -Milliseconds {ms}}}; [Console]::Out.Write("${{e}}]9278;m;$i${{b}}"); [Console]::Out.Write("R$i;`r`n") }}; Write-Host "FIM""#
        );
        let out = run_pwsh(&script);
        let s = String::from_utf8_lossy(&out).to_string();
        let mut bad = 0;
        let mut found = 0;
        for i in 0..200 {
            let l = s.find(&format!("L{i};"));
            let o = s.find(&format!("\x1b]9278;m;{i}\x07"));
            let r = s.find(&format!("R{i};"));
            if let (Some(l), Some(o), Some(r)) = (l, o, r) {
                found += 1;
                if !(l < o && o < r) {
                    bad += 1;
                }
            }
        }
        println!("atraso {ms:>2}ms -> {found} sequencias lidas, {bad} fora de ordem");
        if ms == 20 {
            assert_eq!(found, 200, "nem todas as sequencias chegaram");
            assert_eq!(bad, 0, "com 20ms de atraso nao deveria haver reordenamento");
        }
    }
}
