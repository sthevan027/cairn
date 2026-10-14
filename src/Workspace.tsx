import { useEffect, useRef, useState } from "react";
import { SettingsView } from "./SettingsView";
import { Sidebar, type SidebarTab } from "./Sidebar";
import { TabView } from "./Terminal";
import { Session } from "./session";
import { getSettings } from "./settings";

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
    setTabs((prev) => [...prev, tab]);
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

  // O shell que termina sozinho (`exit`) fecha a aba. Ref: o callback nasce com o closeTab da época.
  const closeRef = useRef(closeTab);
  closeRef.current = closeTab;
  useEffect(() => {
    tabs.forEach((t) => {
      t.session.onShellExit = () => closeRef.current(t.id);
    });
  }, [tabs]);

  // Ctrl+T/W/B sem Shift são do shell (transpor, apagar palavra, voltar caractere): por isso Ctrl+Shift.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (e.shiftKey && key === "t") newTab();
      else if (e.shiftKey && key === "w") closeTab(activeId);
      else if (e.shiftKey && key === "b") toggleSidebar();
      else if (!e.shiftKey && key === ",") setSettingsOpen((open) => !open);
      else if (key === "tab") cycle(e.shiftKey ? -1 : 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div className="workspace">
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
        {settingsOpen && <SettingsView onClose={() => setSettingsOpen(false)} />}
      </div>
    </div>
  );
}
