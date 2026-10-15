import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import "@xterm/xterm/css/xterm.css";
import { AiBar } from "./AiBar";
import { getEnv } from "./env";
import { PromptBar } from "./PromptBar";
import { formatDuration, type PromptData } from "./promptConfig";
import { SearchBar } from "./SearchBar";
import { matchesQuery } from "./search";
import { Session, type Block } from "./session";
import { getSettings, useSettings } from "./settings";
import { matches, recorder } from "./shortcuts";
import { getTheme } from "./themes";

type Bar = "none" | "ai" | "search";

/** Relógio para o widget de hora; só roda quando o widget está ligado. */
function useNow(enabled: boolean, seconds: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), seconds ? 1000 : 15_000);
    return () => clearInterval(id);
  }, [enabled, seconds]);
  return now;
}

interface BlockViewProps {
  session: Session;
  block: Block;
  collapsed: boolean;
  hidden: boolean;
  onToggle: () => void;
}

function BlockView({ session, block, collapsed, hidden, onToggle }: BlockViewProps) {
  const [flash, setFlash] = useState<"cmd" | "out" | null>(null);
  const running = block.finishedAt === null;
  const state = running ? "running" : block.exitCode === 0 ? "ok" : "fail";
  const hasBody = session.hasBody(block.id);

  function copy(what: "cmd" | "out") {
    void navigator.clipboard.writeText(what === "cmd" ? block.command : session.blockOutput(block.id));
    setFlash(what);
    window.setTimeout(() => setFlash(null), 1200);
  }

  return (
    <section className={`block ${state}${collapsed ? " collapsed" : ""}${hidden ? " filtered" : ""}`}>
      <header>
        {hasBody && (
          <button
            className="chevron"
            title={collapsed ? "expandir saída" : "recolher saída"}
            onClick={onToggle}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        )}
        <span className="cmd">{block.command}</span>
        <span className="actions">
          <button title="copiar o comando" onClick={() => copy("cmd")}>
            {flash === "cmd" ? "copiado" : "cmd"}
          </button>
          {hasBody && (
            <button title="copiar a saída (sem cores)" onClick={() => copy("out")}>
              {flash === "out" ? "copiado" : "saída"}
            </button>
          )}
          {!running && (
            <button
              title="colar o comando no prompt (não executa)"
              onClick={() => session.isIdle() && session.insertCommand(block.command)}
            >
              repetir
            </button>
          )}
        </span>
        <span className="meta">
          {running
            ? "executando…"
            : `${block.exitCode === null ? "?" : `exit ${block.exitCode}`} · ${formatDuration(block.finishedAt! - block.startedAt)}`}
        </span>
      </header>
      {hasBody && (
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

interface TabViewProps {
  session: Session;
  active: boolean;
  shell: string | null;
}

/** Uma aba: os blocos, o prompt ao vivo e as barras de IA/busca. Abas inativas ficam montadas e invisíveis. */
export function TabView({ session, active, shell }: TabViewProps) {
  const blocks = useSyncExternalStore(session.subscribe, session.getSnapshot);

  const sizer = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const liveClip = useRef<HTMLDivElement>(null);
  const liveHost = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<Bar>("none");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const settings = useSettings();
  const promptCfg = settings.prompt;
  const snap = useSyncExternalStore(session.subscribe, session.getPromptSnapshot);
  const clockSegments = promptCfg.segments.filter((s) => s.enabled && s.type === "time");
  const now = useNow(active && promptCfg.mode === "cairn" && clockSegments.length > 0, clockSegments.some((s) => s.options.seconds));
  const promptData: PromptData = useMemo(() => {
    const env = getEnv();
    return { ...env, ...snap, now };
  }, [snap, now]);

  useEffect(() => {
    void session.start(
      {
        sizer: sizer.current!,
        scroll: scroll.current!,
        content: content.current!,
        liveClip: liveClip.current!,
        liveHost: liveHost.current!,
      },
      shell ?? undefined,
    );
    return () => session.dispose();
    // o shell só vale na criação da aba
  }, [session]);

  useEffect(() => {
    session.setActive(active);
  }, [active, session]);

  // Atalhos em fase de captura, antes do xterm (Ctrl+K seria "apagar até o fim da linha" no bash,
  // Ctrl+C sem seleção precisa continuar interrompendo o comando).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (recorder.active) return;
      const { shortcuts } = getSettings();
      if (matches(e, shortcuts.aiBar)) {
        e.preventDefault();
        e.stopPropagation();
        setBar((b) => (b === "ai" ? "none" : session.isIdle() ? "ai" : b));
      } else if (matches(e, shortcuts.search)) {
        e.preventDefault();
        e.stopPropagation();
        setBar((b) => (b === "search" ? "none" : "search"));
      } else if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === "c" && session.copySelection()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [session, active]);

  useEffect(() => {
    if (bar === "none") session.focusActive();
  }, [bar, session]);

  const visible = (block: Block) => matchesQuery(query, block.command, session.blockOutput(block.id));
  const shown = blocks.filter(visible).length;

  return (
    <div
      className={`app${bar !== "none" ? " bar-open" : ""}${active ? "" : " inactive"}${promptCfg.position === "bottom" ? " pos-bottom" : ""}`}
      onClick={() => {
        if (!window.getSelection()?.toString()) session.focusActive();
      }}
    >
      <div className="sizer" ref={sizer} />
      <div className="scroll" ref={scroll}>
        <div ref={content} className="content">
          {blocks.map((block) => (
            <BlockView
              key={block.id}
              session={session}
              block={block}
              collapsed={collapsed.has(block.id)}
              hidden={!visible(block)}
              onToggle={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (!next.delete(block.id)) next.add(block.id);
                  return next;
                })
              }
            />
          ))}
          <div className={`dock${snap.running ? "" : " idle"}`}>
            {promptCfg.mode === "cairn" && !snap.running && (
              <PromptBar config={promptCfg} data={promptData} theme={getTheme(settings.theme)} />
            )}
            <div className="live-clip" ref={liveClip}>
              <div ref={liveHost} />
            </div>
          </div>
        </div>
      </div>
      {bar === "ai" && <AiBar session={session} onClose={() => setBar("none")} />}
      {bar === "search" && (
        <SearchBar
          query={query}
          onChange={setQuery}
          shown={shown}
          total={blocks.length}
          onClose={(clear) => {
            setBar("none");
            if (clear) setQuery("");
          }}
        />
      )}
      {bar !== "search" && query.trim() && (
        <button className="filter-chip" title="limpar o filtro" onClick={() => setQuery("")}>
          filtro: {query.trim()} · {shown} de {blocks.length}
        </button>
      )}
    </div>
  );
}
