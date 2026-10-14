import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import "@xterm/xterm/css/xterm.css";
import { AiBar } from "./AiBar";
import { Session, type Block } from "./session";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
}

function BlockView({ session, block }: { session: Session; block: Block }) {
  const running = block.finishedAt === null;
  const state = running ? "running" : block.exitCode === 0 ? "ok" : "fail";
  return (
    <section className={`block ${state}`}>
      <header>
        <span className="cmd">{block.command}</span>
        <span className="meta">
          {running
            ? "executando…"
            : `${block.exitCode === null ? "?" : `exit ${block.exitCode}`} · ${formatDuration(block.finishedAt! - block.startedAt)}`}
        </span>
      </header>
      {session.hasBody(block.id) && (
        <div
          className="clip"
          ref={(el) => {
            if (el) session.attachBlock(block.id, el);
          }}
        />
      )}
    </section>
  );
}

export function Terminal() {
  const session = useMemo(() => new Session(), []);
  const blocks = useSyncExternalStore(session.subscribe, session.getSnapshot);

  const sizer = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const liveClip = useRef<HTMLDivElement>(null);
  const liveHost = useRef<HTMLDivElement>(null);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    session.start({
      sizer: sizer.current!,
      scroll: scroll.current!,
      content: content.current!,
      liveClip: liveClip.current!,
      liveHost: liveHost.current!,
    });
    return () => session.dispose();
  }, [session]);

  // Ctrl+K em fase de captura, antes do xterm (no bash seria "apagar até o fim da linha").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        setAiOpen((open) => !open && session.isIdle());
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [session]);

  useEffect(() => {
    if (!aiOpen) session.focusActive();
  }, [aiOpen, session]);

  return (
    <div
      className={`app${aiOpen ? " ai-open" : ""}`}
      onClick={() => {
        if (!window.getSelection()?.toString()) session.focusActive();
      }}
    >
      <div className="sizer" ref={sizer} />
      <div className="scroll" ref={scroll}>
        <div ref={content}>
          {blocks.map((block) => (
            <BlockView key={block.id} session={session} block={block} />
          ))}
          <div className="live-clip" ref={liveClip}>
            <div ref={liveHost} />
          </div>
        </div>
      </div>
      {aiOpen && <AiBar session={session} onClose={() => setAiOpen(false)} />}
    </div>
  );
}
