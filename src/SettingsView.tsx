import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import iconUrl from "../assets/icon.svg";
import { CloseIcon } from "./icons";
import { CustomizePage } from "./CustomizePage";
import type { Session } from "./session";
import { Row, Section } from "./SettingsUi";
import { DEFAULT_AI_MODEL, resetSettings, updateSettings, useSettings } from "./settings";
import {
  ACTIONS,
  DEFAULT_SHORTCUTS,
  comboFromEvent,
  conflictFor,
  normalizeCombo,
  recorder,
  type ActionId,
} from "./shortcuts";
import { statusHint } from "./updateStatus";
import { useUpdateStatus, type UseUpdateStatus } from "./useUpdateStatus";

type Page = "customize" | "ai" | "shortcuts" | "about";

const PAGES: Array<{ id: Page; label: string }> = [
  { id: "customize", label: "Personalização" },
  { id: "ai", label: "IA" },
  { id: "shortcuts", label: "Atalhos" },
  { id: "about", label: "Sobre" },
];

const AI_MODELS = [
  { id: DEFAULT_AI_MODEL, label: "Claude Opus 5.5", hint: "o mais capaz; usa fallback automático se o filtro recusar" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "equilíbrio entre qualidade e custo" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", hint: "o mais rápido e barato; sem fallback automático" },
];

/** Teclas que não dá para mudar: dependem do shell ou do sistema. */
const FIXED_SHORTCUTS: Array<[string, string]> = [
  ["Ctrl+C", "Copia a seleção; sem seleção, interrompe o comando"],
  ["Ctrl+V / Shift+Insert / botão direito", "Cola o texto, ou o caminho de uma imagem copiada"],
  ["Ctrl+L", "Limpa a tela de blocos"],
  ["Esc", "Fecha a barra de IA ou busca, ou as configurações"],
];

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
      <Section id="sec-ia" title="Claude (Anthropic)">
        <Row label="Modelo" help={model?.hint ?? "modelo personalizado"}>
          <select
            className="select"
            aria-label="Modelo de IA"
            value={s.aiModel}
            onChange={(e) => updateSettings({ aiModel: e.target.value })}
          >
            {AI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            {!model && <option value={s.aiModel}>{s.aiModel}</option>}
          </select>
        </Row>

        <Row
          label="Chave de API"
          help="Fica no Credential Manager do Windows, nunca em arquivo. A variável ANTHROPIC_API_KEY também funciona."
          stacked
        >
          <div className="key-status" role="status">
            {hasKey === null ? "Verificando…" : hasKey ? "● Uma chave está configurada" : "○ Nenhuma chave configurada"}
          </div>
          <div className="key-row">
            <input
              className="text-input"
              type="password"
              aria-label="Chave da Anthropic"
              value={draft}
              placeholder="Cole a chave (sk-ant-...)"
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
          {message && <div className="row-help">{message}</div>}
        </Row>
      </Section>
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
      <Section id="sec-atalhos" title="Atalhos do app">
        {ACTIONS.map((a) => (
          <Row key={a.id} label={a.label}>
            <div className="key-cell">
              <button
                type="button"
                className={`kbd-btn${recording === a.id ? " recording" : ""}`}
                title="Clique e aperte a nova combinação (Esc cancela)"
                aria-label={`Atalho de ${a.label}: ${s.shortcuts[a.id] || "sem atalho"}. Clique para mudar.`}
                onClick={() => {
                  setMessage(null);
                  setRecording(recording === a.id ? null : a.id);
                }}
              >
                <kbd>{recording === a.id ? "aperte as teclas…" : s.shortcuts[a.id] || "sem atalho"}</kbd>
              </button>
              {s.shortcuts[a.id] !== a.default && (
                <button type="button" className="btn ghost" onClick={() => reset(a.id)}>
                  Restaurar
                </button>
              )}
            </div>
          </Row>
        ))}
        {message && (
          <p className="upderr" role="alert">
            {message}
          </p>
        )}
      </Section>

      <Section id="sec-fixos" title="Fixos">
        {FIXED_SHORTCUTS.map(([keys, what]) => (
          <Row key={keys} label={what}>
            <div className="key-cell">
              <kbd>{keys}</kbd>
            </div>
          </Row>
        ))}
      </Section>
    </>
  );
}

function UpdateRow({ update, version }: { update: UseUpdateStatus; version: string }) {
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
    <Section id="sec-atualizacoes" title="Atualizações">
      <Row label={version ? `Cairn v${version}` : "Cairn"} help={statusHint(state)}>
        <button className="updbtn" onClick={onClick} disabled={busy}>
          {label}
        </button>
      </Row>
      {state.error && (
        <p className="upderr" role="alert">
          {state.error}
        </p>
      )}
    </Section>
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
      <UpdateRow update={update} version={version} />
    </div>
  );
}

export function SettingsView({ onClose, activeSession }: { onClose: () => void; activeSession: Session | null }) {
  const [page, setPage] = useState<Page>("customize");

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
        <div className={`settings-content${page === "customize" ? " wide" : ""}`}>
          {page === "customize" && <CustomizePage session={activeSession} />}
          {page === "ai" && <AiPage />}
          {page === "shortcuts" && <ShortcutsPage />}
          {page === "about" && <AboutPage />}
        </div>
      </section>
    </div>
  );
}
