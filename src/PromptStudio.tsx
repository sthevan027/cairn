import { useState, useSyncExternalStore, type ReactNode } from "react";
import { getEnv } from "./env";
import { importOhMyPosh } from "./ompImport";
import { PromptBar } from "./PromptBar";
import {
  COLOR_TOKENS,
  SEGMENT_TYPES,
  defaultSegments,
  newSegment,
  type PromptConfig,
  type PromptData,
  type PromptSegment,
  type SegmentOptions,
  type SegmentStyle,
  type SegmentType,
} from "./promptConfig";
import type { PromptSnapshot, Session } from "./session";
import { fontStack, updateSettings, useSettings } from "./settings";
import { getTheme } from "./themes";
import { useFlip } from "./useFlip";

const TOKEN_LABEL: Record<(typeof COLOR_TOKENS)[number], string> = {
  fg: "Texto",
  dim: "Texto apagado",
  muted: "Cinza",
  accent: "Destaque",
  ok: "Sucesso",
  fail: "Erro",
  running: "Aviso",
  red: "Vermelho",
  green: "Verde",
  yellow: "Amarelo",
  blue: "Azul",
  magenta: "Magenta",
  cyan: "Ciano",
};

const ICON_PRESETS = ["", "\uf007", "\uf07b", "\ue0a0", "\uf017", "\uf121", "\uf120", "❯", "●", "▲", "✦"];

const typeLabel = (type: SegmentType) => SEGMENT_TYPES.find((t) => t.type === type)?.label ?? type;

const emptySubscribe = () => () => {};
const emptySnapshot = (): PromptSnapshot | null => null;

/** Dados de exemplo (com o seu usuário) para desenhar a prévia sem depender de um repositório. */
function sampleData(): PromptData {
  const env = getEnv();
  const home = env.home || "C:\\Users\\voce";
  return {
    user: env.user || "voce",
    host: env.host || "PC",
    home,
    cwd: `${home}\\Projetos\\cairn`,
    git: { branch: "main", staged: 1, unstaged: 2, untracked: 1, ahead: 1, behind: 0 },
    exit: 1,
    durationMs: 2300,
    shell: "pwsh.exe",
    now: new Date(),
  };
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const hex6 = (value: string) => {
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${[...value.slice(1)].map((c) => c + c).join("")}`;
  return /^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : "#7aa2f7";
};

function ColorField({ value, noneLabel, onChange }: { value: string; noneLabel: string; onChange: (v: string) => void }) {
  const custom = value.startsWith("#");
  return (
    <div className="color-field">
      <select
        className="select"
        value={custom ? "__custom" : value}
        onChange={(e) => onChange(e.target.value === "__custom" ? hex6(value) : e.target.value)}
      >
        <option value="">{noneLabel}</option>
        {COLOR_TOKENS.map((t) => (
          <option key={t} value={t}>
            {TOKEN_LABEL[t]}
          </option>
        ))}
        <option value="__custom">Personalizada…</option>
      </select>
      {custom && <input type="color" value={hex6(value)} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="prop-row">
      <span className="prop-label">{label}</span>
      <div className="prop-control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" />
    </label>
  );
}

function SegmentProps({
  seg,
  onChange,
  onOptions,
  onRemove,
}: {
  seg: PromptSegment;
  onChange: (patch: Partial<PromptSegment>) => void;
  onOptions: (patch: Partial<SegmentOptions>) => void;
  onRemove: () => void;
}) {
  const o = seg.options;
  return (
    <div className="seg-props">
      <h3>{typeLabel(seg.type)}</h3>
      <Row label="Lado">
        <Segmented
          value={seg.side}
          options={[
            { value: "left", label: "Esquerda" },
            { value: "right", label: "Direita" },
          ]}
          onChange={(side) => onChange({ side })}
        />
      </Row>
      <Row label="Estilo">
        <Segmented<SegmentStyle>
          value={seg.style}
          options={[
            { value: "plain", label: "Texto" },
            { value: "pill", label: "Pílula" },
            { value: "powerline", label: "Powerline" },
          ]}
          onChange={(style) => onChange({ style })}
        />
      </Row>
      <Row label="Cor do texto">
        <ColorField value={seg.fg} noneLabel="Padrão do widget" onChange={(fg) => onChange({ fg })} />
      </Row>
      <Row label="Cor de fundo">
        <ColorField value={seg.bg} noneLabel="Sem fundo" onChange={(bg) => onChange({ bg })} />
      </Row>
      <Row label="Ícone">
        <div className="icon-picker">
          <input
            className="text-input icon-input"
            value={seg.icon}
            maxLength={4}
            spellCheck={false}
            placeholder="nenhum"
            onChange={(e) => onChange({ icon: e.target.value })}
          />
          {ICON_PRESETS.map((glyph) => (
            <button
              key={glyph || "none"}
              className={`icon-preset${glyph === seg.icon ? " on" : ""}`}
              title={glyph ? `usar ${glyph}` : "sem ícone"}
              onClick={() => onChange({ icon: glyph })}
            >
              {glyph || "∅"}
            </button>
          ))}
        </div>
      </Row>

      {seg.type === "cwd" && (
        <Row label="Mostrar">
          <Segmented
            value={o.cwdStyle}
            options={[
              { value: "folder", label: "Só a pasta" },
              { value: "short", label: "Abreviado" },
              { value: "full", label: "Completo" },
            ]}
            onChange={(cwdStyle) => onOptions({ cwdStyle })}
          />
        </Row>
      )}
      {seg.type === "git" && (
        <>
          <Row label="Estado (+ ~ ? ↑ ↓)">
            <Toggle checked={o.gitStatus} onChange={(gitStatus) => onOptions({ gitStatus })} />
          </Row>
          <Row label="Vermelho se houver mudanças">
            <Toggle checked={o.colorByState} onChange={(colorByState) => onOptions({ colorByState })} />
          </Row>
        </>
      )}
      {seg.type === "status" && (
        <Row label="Mostrar também o sucesso">
          <Toggle checked={o.always} onChange={(always) => onOptions({ always })} />
        </Row>
      )}
      {seg.type === "duration" && (
        <Row label="Só acima de (ms)">
          <input
            className="text-input num-input"
            type="number"
            min={0}
            step={100}
            value={o.minMs}
            onChange={(e) => onOptions({ minMs: Number(e.target.value) })}
          />
        </Row>
      )}
      {seg.type === "time" && (
        <Row label="Incluir segundos">
          <Toggle checked={o.seconds} onChange={(seconds) => onOptions({ seconds })} />
        </Row>
      )}
      {seg.type === "text" && (
        <Row label="Texto">
          <input
            className="text-input"
            value={o.text}
            maxLength={40}
            onChange={(e) => onOptions({ text: e.target.value })}
          />
        </Row>
      )}

      <button className="btn danger" onClick={onRemove}>
        Remover este widget
      </button>
    </div>
  );
}

export function PromptStudio({ session }: { session: Session | null }) {
  const settings = useSettings();
  const cfg = settings.prompt;
  const theme = getTheme(settings.theme);
  const listRef = useFlip<HTMLDivElement>();

  const [selectedId, setSelectedId] = useState<string | null>(cfg.segments[0]?.id ?? null);
  const [real, setReal] = useState(false);
  const [adding, setAdding] = useState<SegmentType>("time");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [undo, setUndo] = useState<PromptSegment[] | null>(null);

  const snap = useSyncExternalStore(session?.subscribe ?? emptySubscribe, session?.getPromptSnapshot ?? emptySnapshot);
  const data: PromptData = real && snap ? { ...getEnv(), ...snap, now: new Date() } : sampleData();

  const setPrompt = (patch: Partial<PromptConfig>) => updateSettings({ prompt: { ...cfg, ...patch } });
  const setSegments = (segments: PromptSegment[]) => setPrompt({ segments });
  const patchSegment = (id: string, patch: Partial<PromptSegment>) =>
    setSegments(cfg.segments.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const patchOptions = (id: string, patch: Partial<SegmentOptions>) =>
    setSegments(cfg.segments.map((s) => (s.id === id ? { ...s, options: { ...s.options, ...patch } } : s)));

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= cfg.segments.length) return;
    const next = [...cfg.segments];
    [next[index], next[target]] = [next[target], next[index]];
    setSegments(next);
  }

  function add() {
    const seg = newSegment(adding, { side: "left" });
    setSegments([...cfg.segments, seg]);
    setSelectedId(seg.id);
  }

  function remove(id: string) {
    const rest = cfg.segments.filter((s) => s.id !== id);
    setSegments(rest);
    setSelectedId(rest[0]?.id ?? null);
  }

  function applyImport(text: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setImportMsg("Isso não é um JSON válido.");
      return;
    }
    const result = importOhMyPosh(parsed);
    if (!result || result.segments.length === 0) {
      setImportMsg("Não achei segmentos do oh-my-posh nesse arquivo.");
      return;
    }
    setUndo(cfg.segments);
    setSegments(result.segments);
    setSelectedId(result.segments[0].id);
    setImportMsg(
      `${result.segments.length} widgets importados${result.skipped ? `, ${result.skipped} sem equivalente foram ignorados` : ""}.`,
    );
  }

  const selected = cfg.segments.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="studio">
      <div className="studio-controls">
        <div>
          <div className="field-label">Quem desenha o prompt</div>
          <Segmented
            value={cfg.mode}
            options={[
              { value: "shell", label: "Shell (oh-my-posh)" },
              { value: "cairn", label: "Cairn (widgets)" },
            ]}
            onChange={(mode) => setPrompt({ mode })}
          />
        </div>
        <div>
          <div className="field-label">Posição da entrada</div>
          <Segmented
            value={cfg.position}
            options={[
              { value: "flow", label: "No fluxo" },
              { value: "bottom", label: "Fixa embaixo" },
            ]}
            onChange={(position) => setPrompt({ position })}
          />
        </div>
        <div>
          <div className="field-label">Dados da prévia</div>
          <Segmented
            value={real ? "real" : "sample"}
            options={[
              { value: "sample", label: "Exemplo" },
              { value: "real", label: "Aba atual" },
            ]}
            onChange={(v) => setReal(v === "real")}
          />
        </div>
      </div>

      <div
        className="studio-preview"
        style={{
          background: theme.term.background,
          color: theme.term.foreground,
          fontFamily: fontStack(settings.fontFamily),
          fontSize: settings.fontSize,
        }}
      >
        {/* sempre ocupa o espaço: ligar/desligar a nota não empurra o resto da página */}
        <div className={`studio-note${cfg.mode === "shell" ? " on" : ""}`} aria-hidden={cfg.mode !== "shell"}>
          Modo Shell: o prompt vem do seu oh-my-posh. Os widgets abaixo passam a valer ao escolher “Cairn”.
        </div>
        <PromptBar config={cfg} data={data} theme={theme} selectedId={selectedId} onSelect={setSelectedId} />
        <div>
          <span style={{ color: theme.term.yellow }}>❯</span> git status
          <span className="studio-cursor" style={{ background: theme.term.cursor }} />
        </div>
      </div>

      <div className="studio-cols">
        <div className="seg-list" ref={listRef}>
          <div className="field-label">Widgets</div>
          {cfg.segments.length === 0 && <div className="field-help">Nenhum widget. Adicione um abaixo.</div>}
          {cfg.segments.map((seg, i) => (
            <div
              key={seg.id}
              data-flip={seg.id}
              className={`seg-row${seg.id === selectedId ? " selected" : ""}${seg.enabled ? "" : " off"}`}
              onClick={() => setSelectedId(seg.id)}
            >
              <input
                type="checkbox"
                checked={seg.enabled}
                title="mostrar ou esconder"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => patchSegment(seg.id, { enabled: e.target.checked })}
              />
              <span className="seg-name">{typeLabel(seg.type)}</span>
              <span className="seg-side">{seg.side === "left" ? "esq" : "dir"}</span>
              <button
                className="mini"
                title="subir"
                disabled={i === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  move(i, -1);
                }}
              >
                ↑
              </button>
              <button
                className="mini"
                title="descer"
                disabled={i === cfg.segments.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  move(i, 1);
                }}
              >
                ↓
              </button>
            </div>
          ))}
          <div className="seg-add">
            <select className="select" value={adding} onChange={(e) => setAdding(e.target.value as SegmentType)}>
              {SEGMENT_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
            <button className="btn primary" onClick={add}>
              Adicionar
            </button>
          </div>
          <div className="seg-tools">
            <button className="btn" onClick={() => setSegments(defaultSegments())}>
              Restaurar padrão
            </button>
            <button className="btn" onClick={() => setImportOpen((o) => !o)}>
              Importar do oh-my-posh…
            </button>
          </div>
        </div>

        <div className="seg-detail">
          {selected ? (
            <SegmentProps
              key={selected.id}
              seg={selected}
              onChange={(patch) => patchSegment(selected.id, patch)}
              onOptions={(patch) => patchOptions(selected.id, patch)}
              onRemove={() => remove(selected.id)}
            />
          ) : (
            <div className="field-help">Selecione um widget na lista ou na prévia para editar.</div>
          )}
        </div>
      </div>

      {importOpen && (
        <div className="import-box">
          <div className="field-label">Importar um arquivo .omp.json</div>
          <div className="field-help">
            Escolha o arquivo (ex.: <code>tokyonight_custom.omp.json</code>) ou cole o conteúdo. Os segmentos viram
            widgets do Cairn; o que não tem equivalente é ignorado.
          </div>
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) applyImport(await file.text());
              e.target.value = "";
            }}
          />
          <textarea
            className="import-text"
            value={importText}
            placeholder='{ "blocks": [ ... ] }'
            spellCheck={false}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="seg-tools">
            <button className="btn primary" disabled={!importText.trim()} onClick={() => applyImport(importText)}>
              Importar o texto colado
            </button>
            {undo && (
              <button
                className="btn"
                onClick={() => {
                  setSegments(undo);
                  setUndo(null);
                  setImportMsg("Importação desfeita.");
                }}
              >
                Desfazer
              </button>
            )}
          </div>
          {importMsg && <div className="field-help">{importMsg}</div>}
        </div>
      )}
    </div>
  );
}
