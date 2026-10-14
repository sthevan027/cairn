import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import "@xterm/xterm/css/xterm.css";
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
      <div
        className="clip"
        ref={(el) => {
          if (el) session.attachBlock(block.id, el);
        }}
      />
    </section>
  );
}

export function Terminal() {
  const session = useMemo(() => new Session(), []);
  const blocks = useSyncExternalStore(session.subscribe, session.getSnapshot);

  const sizer = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const promptClip = useRef<HTMLDivElement>(null);
  const promptHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    session.start({
      sizer: sizer.current!,
      scroll: scroll.current!,
      content: content.current!,
      promptClip: promptClip.current!,
      promptHost: promptHost.current!,
    });
    return () => session.dispose();
  }, [session]);

  return (
    <div
      className="app"
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
          <div className="prompt-clip" ref={promptClip}>
            <div ref={promptHost} />
          </div>
        </div>
      </div>
    </div>
  );
}
