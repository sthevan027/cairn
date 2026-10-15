import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { SettingsView } from "./SettingsView";
import { Sidebar, type SidebarTab } from "./Sidebar";
import { TabView } from "./Terminal";
import { Session } from "./session";
import { getSettings, useSettings } from "./settings";
import { matches, recorder } from "./shortcuts";
import { insertTab } from "./tabs";

interface Tab extends SidebarTab {
  shell: string | null;
}

let lastTabId = 0;
const makeTab = (shell: string | null = null): Tab => ({
  id: ++lastTabId,
  session: new Session(),
  shell: shell ?? getSettings().defaultShell,
  name: null,
});

const SIDEBAR_KEY = "cairn.sidebarOpen";

function loadSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "0";
  } catch {
    return true;
  }
}

export function Workspace() {
  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [sidebarOpen, setSidebarOpen] = useState(loadSidebarOpen);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function newTab(shell?: string) {
    const tab = makeTab(shell ?? null);
    const { newTabPosition } = getSettings();
    setTabs((prev) => insertTab(prev, tab, activeId, newTabPosition));
    setActiveId(tab.id);
    setSettingsOpen(false);
  }

  function selectTab(id: number) {
    setActiveId(id);
    setSettingsOpen(false);
  }

  function closeTab(id: number) {
    const index = tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    const rest = tabs.filter((t) => t.id !== id);
    if (rest.length === 0) {
      const fresh = makeTab();
      setTabs([fresh]);
      setActiveId(fresh.id);
      return;
    }
    setTabs(rest);
    if (id === activeId) setActiveId(rest[Math.min(index, rest.length - 1)].id);
  }

  function cycle(step: number) {
    const index = tabs.findIndex((t) => t.id === activeId);
    setActiveId(tabs[(index + step + tabs.length) % tabs.length].id);
  }

  function toggleSidebar() {
    setSidebarOpen((open) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, open ? "0" : "1");
      } catch {
        /* sem armazenamento: só não lembra da escolha */
      }
      return !open;
    });
  }

  function rename(id: number, name: string | null) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
    tabs.find((t) => t.id === id)?.session.focusActive();
  }

  // O shell que termina sozinho (`exit`) fecha a aba, se a configuração mandar.
  // Ref: o callback nasce com o closeTab da época.
  const closeRef = useRef(closeTab);
  closeRef.current = closeTab;
  useEffect(() => {
    tabs.forEach((t) => {
      t.session.onShellExit = () => {
        if (getSettings().closeOnExit) closeRef.current(t.id);
      };
    });
  }, [tabs]);

  // As combinações vêm das configurações (padrão: Ctrl+Shift+T/W/B, pois Ctrl+T/W/B sem Shift são do shell).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (recorder.active) return;
      const { shortcuts } = getSettings();
      if (matches(e, shortcuts.newTab)) newTab();
      else if (matches(e, shortcuts.closeTab)) closeTab(activeId);
      else if (matches(e, shortcuts.toggleSidebar)) toggleSidebar();
      else if (matches(e, shortcuts.openSettings)) setSettingsOpen((open) => !open);
      else if (matches(e, shortcuts.nextTab)) cycle(1);
      else if (matches(e, shortcuts.prevTab)) cycle(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // Arrastar arquivos do Explorer pra janela: o Tauri intercepta o drop do sistema (não chega como
  // evento de DOM), então os caminhos vêm por aqui e entram no prompt da aba ativa.
  const activeRef = useRef<Session | null>(null);
  activeRef.current = tabs.find((t) => t.id === activeId)?.session ?? null;
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") activeRef.current?.insertPaths(event.payload.paths);
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const { sidebarSide, sidebarWidth } = useSettings();

  return (
    <div
      className={`workspace${sidebarSide === "right" ? " sidebar-right" : ""}`}
      style={{ ["--sidebar-width" as string]: `${sidebarWidth}px` }}
    >
      <Sidebar
        tabs={tabs}
        activeId={activeId}
        open={sidebarOpen}
        onToggle={toggleSidebar}
        onSelect={selectTab}
        onClose={closeTab}
        onNew={newTab}
        onRename={rename}
        onOpenSettings={() => setSettingsOpen((open) => !open)}
      />
      <div className="tabs-area">
        {tabs.map((tab) => (
          <TabView
            key={tab.id}
            session={tab.session}
            shell={tab.shell}
            active={tab.id === activeId && !settingsOpen}
          />
        ))}
        {settingsOpen && (
          <SettingsView
            onClose={() => setSettingsOpen(false)}
            activeSession={tabs.find((t) => t.id === activeId)?.session ?? null}
          />
        )}
      </div>
    </div>
  );
}
