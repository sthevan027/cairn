import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import iconUrl from "../assets/icon.svg";
import { CloseIcon } from "./icons";
import { PromptStudio } from "./PromptStudio";
import type { Session } from "./session";
import {
  DEFAULT_AI_MODEL,
  FONT_SIZE_RANGE,
  fontStack,
  resetSettings,
  updateSettings,
  useSettings,
} from "./settings";
import { THEMES, getTheme } from "./themes";
import { statusHint } from "./updateStatus";
import { useUpdateStatus, type UseUpdateStatus } from "./useUpdateStatus";

type Page = "appearance" | "terminal" | "prompt" | "ai" | "shortcuts" | "about";

const PAGES: Array<{ id: Page; label: string }> = [
  { id: "appearance", label: "Aparência" },
  { id: "terminal", label: "Terminal" },
  { id: "prompt", label: "Prompt" },
  { id: "ai", label: "IA" },
  { id: "shortcuts", label: "Atalhos" },
  { id: "about", label: "Sobre" },
];

const FONT_PRESETS = [
  "CaskaydiaCove Nerd Font Mono",
  "Cascadia Code",
  "Cascadia Mono",
  "JetBrains Mono",
  "Fira Code",
  "Consolas",
  "Courier New",
];

const AI_MODELS = [
  { id: DEFAULT_AI_MODEL, label: "Claude Opus 5.5", hint: "o mais capaz; usa fallback automático se o filtro recusar" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "equilíbrio entre qualidade e custo" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", hint: "o mais rápido e barato; sem fallback automático" },
];

const SHORTCUTS: Array<[string, string]> = [
  ["Ctrl+Shift+T", "nova aba"],
  ["Ctrl+Shift+W", "fecha a aba"],
  ["Ctrl+Tab / Ctrl+Shift+Tab", "próxima / anterior aba"],
  ["Ctrl+Shift+B", "recolhe ou abre a barra lateral"],
  ["Ctrl+K", "IA: descreve o que quer e recebe o comando"],
  ["Ctrl+F", "busca nos blocos da aba"],
  ["Ctrl+C", "copia a seleção; sem seleção, interrompe o comando"],
  ["Ctrl+,", "abre estas configurações"],
  ["Esc", "fecha a barra de IA/busca ou as configurações"],
];

interface ShellOption {
  name: string;
  path: string;
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
      {help && <div className="field-help">{help}</div>}
    </div>
  );
}

function AppearancePage() {
  const s = useSettings();
  const theme = getTheme(s.theme);
  const [font, setFont] = useState(s.fontFamily);
  useEffect(() => setFont(s.fontFamily), [s.fontFamily]);

  return (
    <>
      <Field label="Tema">
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-card${t.id === s.theme ? " selected" : ""}`}
              style={{ background: t.ui.bg, color: t.ui.fg, borderColor: t.id === s.theme ? t.ui.accent : t.ui.border }}
              onClick={() => updateSettings({ theme: t.id })}
            >
              <span className="theme-bars">
                <i style={{ background: t.ui.accent }} />
                <i style={{ background: t.ui.ok }} />
                <i style={{ background: t.ui.fail }} />
                <i style={{ background: t.ui.running }} />
              </span>
              <span className="theme-name">{t.name}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Fonte" help="Use o nome de uma fonte monoespaçada instalada. Se não existir, cai em Cascadia Code ou Consolas.">
        <input
          className="text-input"
          list="font-presets"
          value={font}
          spellCheck={false}
          onChange={(e) => setFont(e.target.value)}
          onBlur={() => updateSettings({ fontFamily: font })}
          onKeyDown={(e) => e.key === "Enter" && updateSettings({ fontFamily: font })}
        />
        <datalist id="font-presets">
          {FONT_PRESETS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </Field>

      <Field label="Tamanho da fonte" help="Vale para o texto novo; blocos já terminados mantêm a largura de quando foram gerados.">
        <div className="range-row">
          <input
            type="range"
            min={FONT_SIZE_RANGE.min}
            max={FONT_SIZE_RANGE.max}
            value={s.fontSize}
            onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
          />
          <output>{s.fontSize}px</output>
        </div>
      </Field>

      <Field label="Cursor piscando">
        <label className="switch">
          <input
            type="checkbox"
            checked={s.cursorBlink}
            onChange={(e) => updateSettings({ cursorBlink: e.target.checked })}
          />
          <span className="switch-track" />
        </label>
      </Field>

      <div
        className="font-preview"
        style={{
          background: theme.term.background,
          color: theme.term.foreground,
          fontFamily: fontStack(s.fontFamily),
          fontSize: s.fontSize,
        }}
      >
        <div>
          <span style={{ color: theme.term.magenta }}>~</span> <span style={{ color: theme.term.cyan }}>cairn</span>{" "}
          <span style={{ color: theme.term.yellow }}>main</span>
        </div>
        <div>
          <span style={{ color: theme.term.green }}>❯</span> git status
        </div>
        <div style={{ color: theme.term.red }}>modified: src/session.ts</div>
        <div style={{ color: theme.term.green }}>25 testes passando</div>
      </div>
    </>
  );
}

function TerminalPage() {
  const s = useSettings();
  const [shells, setShells] = useState<ShellOption[]>([]);
  useEffect(() => {
    invoke<ShellOption[]>("available_shells")
      .then(setShells)
      .catch(() => setShells([]));
  }, []);

  return (
    <Field label="Shell padrão" help="Vale para as abas novas (o botão + e Ctrl+Shift+T). Pelo botão direito do + dá pra escolher outro só daquela vez.">
      <select
        className="select"
        value={s.defaultShell ?? ""}
        onChange={(e) => updateSettings({ defaultShell: e.target.value || null })}
      >
        <option value="">Automático (PowerShell 7 se existir)</option>
        {shells.map((shell) => (
          <option key={shell.path} value={shell.path}>
            {shell.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function AiPage() {
  const s = useSettings();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () =>
    invoke<boolean>("has_api_key")
      .then(setHasKey)
      .catch(() => setHasKey(false));
  useEffect(() => {
    void refresh();
  }, []);

  async function save() {
    if (!draft.trim()) return;
    try {
      await invoke("set_api_key", { key: draft });
      setDraft("");
      setMessage("Chave guardada no Credential Manager do Windows.");
    } catch (err) {
      setMessage(`Não consegui guardar: ${err}`);
    }
    void refresh();
  }

  async function remove() {
    try {
      await invoke("clear_api_key");
      setMessage("Chave removida do Credential Manager.");
    } catch (err) {
      setMessage(`Não consegui remover: ${err}`);
    }
    void refresh();
  }

  const model = AI_MODELS.find((m) => m.id === s.aiModel);
  return (
    <>
      <Field label="Modelo" help={model?.hint ?? "modelo personalizado"}>
        <select className="select" value={s.aiModel} onChange={(e) => updateSettings({ aiModel: e.target.value })}>
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          {!model && <option value={s.aiModel}>{s.aiModel}</option>}
        </select>
      </Field>

      <Field
        label="Chave da Anthropic"
        help="Fica no Credential Manager do Windows, nunca em arquivo. A variável ANTHROPIC_API_KEY também funciona."
      >
        <div className="key-status">
          {hasKey === null ? "verificando…" : hasKey ? "● uma chave está configurada" : "○ nenhuma chave configurada"}
        </div>
        <div className="key-row">
          <input
            className="text-input"
            type="password"
            value={draft}
            placeholder="cole a chave (sk-ant-...)"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
          />
          <button className="btn primary" disabled={!draft.trim()} onClick={() => void save()}>
            Guardar
          </button>
          <button className="btn" disabled={!hasKey} onClick={() => void remove()}>
            Remover
          </button>
        </div>
        {message && <div className="field-help">{message}</div>}
      </Field>
    </>
  );
}

function ShortcutsPage() {
  return (
    <table className="shortcuts">
      <tbody>
        {SHORTCUTS.map(([keys, what]) => (
          <tr key={keys}>
            <td>
              <kbd>{keys}</kbd>
            </td>
            <td>{what}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UpdateRow({ update }: { update: UseUpdateStatus }) {
  const { state, checkNow, install } = update;
  const busy = state.checking || state.installing;
  const label = state.installing
    ? "Atualizando…"
    : state.checking
      ? "Verificando…"
      : state.availableVersion
        ? "Atualizar agora"
        : "Verificar agora";
  const onClick = state.availableVersion ? install : checkNow;
  return (
    <Field label="Atualizações" help={statusHint(state)}>
      <button className="updbtn" onClick={onClick} disabled={busy}>
        {label}
      </button>
      {state.error && <p className="upderr">{state.error}</p>}
    </Field>
  );
}

function AboutPage() {
  const [version, setVersion] = useState("");
  const update = useUpdateStatus();
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);

  return (
    <div className="about">
      <div className="about-head">
        <img src={iconUrl} width={64} height={64} alt="" />
        <p>
          <strong>Cairn</strong> {version && <span className="muted">v{version}</span>}
        </p>
      </div>
      <p>
        Terminal próprio com blocos de comando e IA no prompt. Projeto de estudo, inspirado no Warp: cada comando vira
        um bloco empilhado que deixa o rastro do caminho.
      </p>
      <p className="muted">
        As configurações ficam no armazenamento local do app; a chave da Anthropic, no Credential Manager do Windows.
      </p>
      <UpdateRow update={update} />
    </div>
  );
}

export function SettingsView({ onClose, activeSession }: { onClose: () => void; activeSession: Session | null }) {
  const [page, setPage] = useState<Page>("appearance");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="settings" role="dialog" aria-label="Configurações">
      <nav className="settings-nav">
        <h1>Configurações</h1>
        {PAGES.map((p) => (
          <button key={p.id} className={p.id === page ? "active" : ""} onClick={() => setPage(p.id)}>
            {p.label}
          </button>
        ))}
        <button className="reset" onClick={resetSettings}>
          Restaurar padrões
        </button>
      </nav>
      <section className="settings-body">
        <header>
          <h2>{PAGES.find((p) => p.id === page)?.label}</h2>
          <button className="icon-btn" title="Fechar (Esc)" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className={`settings-content${page === "prompt" ? " wide" : ""}`}>
          {page === "appearance" && <AppearancePage />}
          {page === "terminal" && <TerminalPage />}
          {page === "prompt" && <PromptStudio session={activeSession} />}
          {page === "ai" && <AiPage />}
          {page === "shortcuts" && <ShortcutsPage />}
          {page === "about" && <AboutPage />}
        </div>
      </section>
    </div>
  );
}
