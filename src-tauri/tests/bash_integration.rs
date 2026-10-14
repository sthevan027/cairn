use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::{io::{Read, Write}, time::{Duration, Instant}};

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
fn bash_emite_marcadores_na_ordem_certa() {
    let pair = native_pty_system()
        .openpty(PtySize { rows: 30, cols: 100, pixel_width: 0, pixel_height: 0 })
        .unwrap();
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../integration").replace('\\', "/");
    let mut cmd = CommandBuilder::new(r"C:\Program Files\Git\bin\bash.exe");
    cmd.args(["--rcfile", &format!("{dir}/bash-rc.sh"), "-i"]);
    cmd.env("CAIRN_INTEGRATION", &dir);
    cmd.env("TERM", "xterm-256color");
    let mut child = pair.slave.spawn_command(cmd).unwrap();
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().unwrap();
    let mut writer = pair.master.take_writer().unwrap();

    let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 || tx.send(buf[..n].to_vec()).is_err() { break; }
        }
    });

    let script: Vec<&[u8]> = vec![b"echo hi\r", b"false\r", b"printf 'sem-quebra'\r", b"exit\r"];
    let mut out = Vec::new();
    let mut next = 0usize;
    let mut last_send = Instant::now() + Duration::from_secs(3);
    let deadline = Instant::now() + Duration::from_secs(25);
    while Instant::now() < deadline {
        if let Ok(chunk) = rx.recv_timeout(Duration::from_millis(100)) {
            if chunk.windows(4).any(|w| w == b"\x1b[6n") {
                writer.write_all(b"\x1b[1;1R").unwrap();
                writer.flush().unwrap();
            }
            out.extend(chunk);
        }
        if next < script.len() && Instant::now() > last_send + Duration::from_millis(1500) {
            writer.write_all(script[next]).unwrap();
            writer.flush().unwrap();
            next += 1;
            last_send = Instant::now();
        }
        if next == script.len() && Instant::now() > last_send + Duration::from_secs(2) { break; }
    }
    let _ = child.kill();
    println!("--- BYTES ---\n{}\n--- FIM ---", escape(&out));
}
