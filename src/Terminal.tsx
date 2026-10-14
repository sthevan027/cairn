import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

export const TERMINAL_THEME = {
  background: "#1a1b26",
  foreground: "#c0caf5",
  cursor: "#c0caf5",
  selectionBackground: "#33467c",
};

export function Terminal() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({
      fontFamily: '"CaskaydiaCove Nerd Font Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 14,
      cursorBlink: true,
      scrollback: 10_000,
      theme: TERMINAL_THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    const output = new Channel<ArrayBuffer>();
    output.onmessage = (data) => term.write(new Uint8Array(data));

    let sessionId: number | null = null;
    invoke<number>("spawn_shell", {
      onOutput: output,
      cols: term.cols,
      rows: term.rows,
    })
      .then((id) => (sessionId = id))
      .catch((err) => term.write(`\r\n[erro ao abrir o shell: ${err}]\r\n`));

    const onData = term.onData((data) => {
      invoke("write_to_pty", { data }).catch(() => {});
    });
    const onResize = term.onResize(({ cols, rows }) => {
      invoke("resize_pty", { cols, rows }).catch(() => {});
    });
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(host);

    const unlistenExit = listen<number>("pty-exit", (event) => {
      if (event.payload === sessionId) term.write("\r\n[processo encerrado]\r\n");
    });

    term.focus();

    return () => {
      observer.disconnect();
      onData.dispose();
      onResize.dispose();
      unlistenExit.then((fn) => fn());
      invoke("kill_pty").catch(() => {});
      term.dispose();
    };
  }, []);

  return <div className="terminal-host" ref={hostRef} />;
}
