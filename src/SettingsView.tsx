import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import iconUrl from "../assets/icon.svg";
import { CloseIcon } from "./icons";
import { PromptStudio } from "./PromptStudio";
import type { Session } from "./session";
import {
  type CursorStyle,
  type NewTabPosition,
  type SidebarSide,
  SIDEBAR_WIDTH_RANGE,
  DEFAULT_AI_MODEL,
  FONT_SIZE_RANGE,
  LETTER_SPACING_RANGE,
  LINE_HEIGHT_RANGE,
  fontStack,
  resetSettings,
  updateSettings,
  useSettings,
} from "./settings";
import {
  ACTIONS,
  DEFAULT_SHORTCUTS,
  comboFromEvent,
  conflictFor,
  normalizeCombo,
  recorder,
  type ActionId,
} from "./shortcuts";
import { THEMES, getTheme } from "./themes";
import { statusHint } from "./updateStatus";
import { useUpdateStatus, type UseUpdateStatus } from "./useUpdateStatus";

type Page = "appearance" | "terminal" | "layout" | "prompt" | "ai" | "shortcuts" | "about";

const PAGES: Array<{ id: Page; label: string }> = [
  { id: "appearance", label: "Aparência" },
  { id: "terminal", label: "Terminal" },
  { id: "layout", label: "Abas e barra lateral" },
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

/** Teclas que não dá para mudar: dependem do shell ou do sistema. */
const FIXED_SHORTCUTS: Array<[string, string]> = [
  ["Ctrl+C", "copia a seleção; sem seleção, interrompe o comando"],
  ["Ctrl+V / Shift+Insert / botão direito", "cola (texto, ou o caminho de uma imagem copiada)"],
  ["Ctrl+L", "limpa a tela de blocos"],
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

      <Field label="Altura da linha" help="1 é o padrão. Valores maiores deixam o texto mais arejado.">
        <div className="range-row">
          <input
            type="range"
            min={LINE_HEIGHT_RANGE.min}
            max={LINE_HEIGHT_RANGE.max}
            step={LINE_HEIGHT_RANGE.step}
            value={s.lineHeight}
            onChange={(e) => updateSettings({ lineHeight: Number(e.target.value) })}
          />
          <output>{s.lineHeight.toFixed(2)}</output>
        </div>
      </Field>

      <Field label="Espaço entre letras">
        <div className="range-row">
          <input
            type="range"
            min={LETTER_SPACING_RANGE.min}
            max={LETTER_SPACING_RANGE.max}
            step={LETTER_SPACING_RANGE.step}
            value={s.letterSpacing}
            onChange={(e) => updateSettings({ letterSpacing: Number(e.target.value) })}
          />
          <output>{s.letterSpacing}px</output>
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

      <Field label="Formato do cursor">
        <select
          value={s.cursorStyle}
          onChange={(e) => updateSettings({ cursorStyle: e.target.value as CursorStyle })}
        >
          <option value="block">Bloco</option>
          <option value="underline">Sublinhado</option>
          <option value="bar">Barra</option>
        </select>
      </Field>

      <Field label="Cor do cursor" help="Vazio usa a cor do tema.">
        <div className="range-row">
          <input
            type="color"
            value={s.cursorColor || theme.term.cursor || "#ffffff"}
            onChange={(e) => updateSettings({ cursorColor: e.target.value })}
          />
          <button type="button" onClick={() => updateSettings({ cursorColor: "" })} disabled={!s.cursorColor}>
            usar do tema
          </button>
        </div>
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

function LayoutPage() {
  const s = useSettings();
  return (
    <>
      <Field label="Lado da barra lateral">
        <select
          value={s.sidebarSide}
          onChange={(e) => updateSettings({ sidebarSide: e.target.value as SidebarSide })}
        >
          <option value="left">Esquerda</option>
          <option value="right">Direita</option>
        </select>
      </Field>

      <Field label="Largura da barra lateral" help="Vale com a barra aberta; recolhida, ela tem largura fixa.">
        <div className="range-row">
          <input
            type="range"
            min={SIDEBAR_WIDTH_RANGE.min}
            max={SIDEBAR_WIDTH_RANGE.max}
            step={SIDEBAR_WIDTH_RANGE.step}
            value={s.sidebarWidth}
            onChange={(e) => updateSettings({ sidebarWidth: Number(e.target.value) })}
          />
          <output>{s.sidebarWidth}px</output>
        </div>
      </Field>

      <Field label="Onde entra a aba nova">
        <select
          value={s.newTabPosition}
          onChange={(e) => updateSettings({ newTabPosition: e.target.value as NewTabPosition })}
        >
          <option value="end">No fim da lista</option>
          <option value="afterCurrent">Logo depois da aba atual</option>
        </select>
      </Field>

      <Field label="Fechar a aba quando o shell terminar" help="Com isso desligado, `exit` deixa a aba aberta com o aviso de processo encerrado.">
        <label className="switch">
          <input
            type="checkbox"
            checked={s.closeOnExit}
            onChange={(e) => updateSettings({ closeOnExit: e.target.checked })}
          />
          <span className="switch-track" />
        </label>
      </Field>
    </>
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
  const s = useSettings();
  const [recording, setRecording] = useState<ActionId | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Enquanto grava, qualquer combinação vira o novo atalho (Esc cancela).
  useEffect(() => {
    if (!recording) return;
    recorder.active = true;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        setMessage(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return; // só um modificador apertado: espera a tecla
      if (!normalizeCombo(combo)) {
        setMessage("Use Ctrl ou Alt na combinação, para não atrapalhar o que você digita.");
        return;
      }
      const clash = conflictFor(s.shortcuts, recording, combo);
      if (clash) {
        setMessage(`${combo} já é de "${ACTIONS.find((a) => a.id === clash)?.label}". Escolha outra.`);
        return;
      }
      updateSettings({ shortcuts: { ...s.shortcuts, [recording]: combo } });
      setRecording(null);
      setMessage(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      recorder.active = false;
    };
  }, [recording, s.shortcuts]);

  function reset(id: ActionId) {
    const clash = conflictFor(s.shortcuts, id, DEFAULT_SHORTCUTS[id]);
    if (clash) {
      setMessage(`${DEFAULT_SHORTCUTS[id]} está em uso por "${ACTIONS.find((a) => a.id === clash)?.label}".`);
      return;
    }
    setMessage(null);
    updateSettings({ shortcuts: { ...s.shortcuts, [id]: DEFAULT_SHORTCUTS[id] } });
  }

  return (
    <>
      <table className="shortcuts">
        <tbody>
          {ACTIONS.map((a) => (
            <tr key={a.id}>
              <td>
                <button
                  type="button"
                  className="kbd-btn"
                  title="clique e aperte a nova combinação (Esc cancela)"
                  onClick={() => {
                    setMessage(null);
                    setRecording(recording === a.id ? null : a.id);
                  }}
                >
                  <kbd>{recording === a.id ? "aperte as teclas…" : s.shortcuts[a.id] || "sem atalho"}</kbd>
                </button>
              </td>
              <td>{a.label}</td>
              <td>
                {s.shortcuts[a.id] !== a.default && (
                  <button type="button" onClick={() => reset(a.id)}>
                    restaurar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {message && <p className="upderr">{message}</p>}
      <h3>Fixos</h3>
      <table className="shortcuts">
        <tbody>
          {FIXED_SHORTCUTS.map(([keys, what]) => (
            <tr key={keys}>
              <td>
                <kbd>{keys}</kbd>
              </td>
              <td>{what}</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </>
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
      if (e.key === "Escape" && !recorder.active) {
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
          {page === "layout" && <LayoutPage />}
          {page === "prompt" && <PromptStudio session={activeSession} />}
          {page === "ai" && <AiPage />}
          {page === "shortcuts" && <ShortcutsPage />}
          {page === "about" && <AboutPage />}
        </div>
      </section>
    </div>
  );
}
