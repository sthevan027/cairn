import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BranchIcon, CloseIcon, PanelIcon, PlusIcon, ProgramIcon, SearchIcon } from "./icons";
import { programOf } from "./programs";
import { matchesQuery } from "./search";
import type { Session, TabMeta } from "./session";

export interface SidebarTab {
  id: number;
  session: Session;
  name: string | null;
}

interface ShellOption {
  name: string;
  path: string;
}

interface ItemProps {
  tab: SidebarTab;
  active: boolean;
  query: string;
  onSelect: () => void;
  onClose: () => void;
  onRename: (name: string | null) => void;
}

/** Círculo da aba: ícone do programa em execução (ou `>_` no prompt) e o selo de status. */
function TabAvatar({ meta }: { meta: TabMeta }) {
  const program = meta.status === "running" ? programOf(meta.title) : null;
  return (
    <span className={`avatar ${meta.status}`}>
      {program ? <ProgramIcon program={program} /> : <span className="glyph">&gt;_</span>}
      <span className="badge" />
    </span>
  );
}

interface RailItemProps {
  tab: SidebarTab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}

/** Aba na barra recolhida: só o ícone, com o nome no tooltip. */
function RailItem({ tab, active, onSelect, onClose }: RailItemProps) {
  const meta = useSyncExternalStore(tab.session.subscribe, tab.session.getMeta);
  const label = [tab.name ?? meta.title, meta.branch].filter(Boolean).join(" · ");
  return (
    <button
      className={`rail-item${active ? " active" : ""}`}
      title={label}
      onClick={onSelect}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <TabAvatar meta={meta} />
    </button>
  );
}

function Item({ tab, active, query, onSelect, onClose, onRename }: ItemProps) {
  const meta = useSyncExternalStore(tab.session.subscribe, tab.session.getMeta);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const title = tab.name ?? meta.title;

  if (!matchesQuery(query, title, meta.cwd ?? "", meta.branch ?? "", meta.subtitle)) return null;

  function commit() {
    setEditing(false);
    onRename(draft.trim() || null);
  }

  return (
    <div
      className={`tab-item${active ? " active" : ""}`}
      title={meta.cwd ?? undefined}
      onClick={onSelect}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <TabAvatar meta={meta} />
      <span className="tab-text">
        {editing ? (
          <input
            className="tab-rename"
            autoFocus
            value={draft}
            spellCheck={false}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <span
            className="tab-title"
            onDoubleClick={() => {
              setDraft(title);
              setEditing(true);
            }}
          >
            {title}
          </span>
        )}
        <span className="tab-sub">
          {meta.branch && <BranchIcon width={12} height={12} />}
          <span>{meta.subtitle}</span>
        </span>
      </span>
      <button
        className="tab-close"
        title="Fechar a aba (Ctrl+Shift+W)"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <CloseIcon width={13} height={13} />
      </button>
    </div>
  );
}

interface SidebarProps {
  tabs: SidebarTab[];
  activeId: number;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: number) => void;
  onClose: (id: number) => void;
  onNew: (shell?: string) => void;
  onRename: (id: number, name: string | null) => void;
}

export function Sidebar({ tabs, activeId, open, onToggle, onSelect, onClose, onNew, onRename }: SidebarProps) {
  const [query, setQuery] = useState("");
  const [shells, setShells] = useState<ShellOption[] | null>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shells) return;
    const away = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setShells(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setShells(null);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [shells]);

  async function openShellMenu() {
    setShells(await invoke<ShellOption[]>("available_shells").catch(() => []));
  }

  const plus = (
    <button
      className="icon-btn"
      title="Nova aba (Ctrl+Shift+T) · botão direito: escolher o shell"
      onClick={() => onNew()}
      onContextMenu={(e) => {
        e.preventDefault();
        void openShellMenu();
      }}
    >
      <PlusIcon />
    </button>
  );

  const toggle = (
    <button className="icon-btn" title="Barra lateral (Ctrl+Shift+B)" onClick={onToggle}>
      <PanelIcon />
    </button>
  );

  if (!open) {
    return (
      <aside className="sidebar collapsed">
        {toggle}
        <div className="rail-list">
          {tabs.map((tab) => (
            <RailItem
              key={tab.id}
              tab={tab}
              active={tab.id === activeId}
              onSelect={() => onSelect(tab.id)}
              onClose={() => onClose(tab.id)}
            />
          ))}
          {plus}
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="side-head">
        {toggle}
        <label className="side-search">
          <SearchIcon width={14} height={14} />
          <input
            value={query}
            spellCheck={false}
            placeholder="Buscar abas…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          />
        </label>
        {plus}
      </div>
      {shells && (
        <div className="shell-menu" ref={menu}>
          {shells.length === 0 && <div className="shell-empty">nenhum shell encontrado</div>}
          {shells.map((shell) => (
            <button
              key={shell.path}
              onClick={() => {
                setShells(null);
                onNew(shell.path);
              }}
            >
              <span>{shell.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="side-list">
        {tabs.map((tab) => (
          <Item
            key={tab.id}
            tab={tab}
            active={tab.id === activeId}
            query={query}
            onSelect={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
            onRename={(name) => onRename(tab.id, name)}
          />
        ))}
      </div>
    </aside>
  );
}
