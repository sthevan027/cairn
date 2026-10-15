import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PromptStudio } from "./PromptStudio";
import type { Session } from "./session";
import { Row, Section, Slider, Switch } from "./SettingsUi";
import {
  FONT_SIZE_RANGE,
  LETTER_SPACING_RANGE,
  LINE_HEIGHT_RANGE,
  SIDEBAR_WIDTH_RANGE,
  fontStack,
  updateSettings,
  useSettings,
  type CursorStyle,
  type NewTabPosition,
  type SidebarSide,
} from "./settings";
import { THEMES, getTheme } from "./themes";

const FONT_PRESETS = [
  "CaskaydiaCove Nerd Font Mono",
  "Cascadia Code",
  "Cascadia Mono",
  "JetBrains Mono",
  "Fira Code",
  "Consolas",
  "Courier New",
];

interface ShellOption {
  name: string;
  path: string;
}

const SECTIONS = [
  { id: "sec-tema", label: "Tema" },
  { id: "sec-texto", label: "Texto" },
  { id: "sec-cursor", label: "Cursor" },
  { id: "sec-shell", label: "Shell" },
  { id: "sec-abas", label: "Abas e barra lateral" },
  { id: "sec-prompt", label: "Prompt" },
] as const;

/** Prévia ao vivo: o que você muda abaixo aparece aqui na hora, sem abrir um terminal. */
function Preview() {
  const s = useSettings();
  const t = getTheme(s.theme).term;
  const cursorColor = s.cursorColor || t.cursor || t.foreground;
  return (
    <div
      className="preview"
      aria-label="Prévia do terminal"
      style={{
        background: t.background,
        color: t.foreground,
        fontFamily: fontStack(s.fontFamily),
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        letterSpacing: `${s.letterSpacing}px`,
      }}
    >
      <div>
        <span style={{ color: t.magenta }}>~</span> <span style={{ color: t.cyan }}>cairn</span>{" "}
        <span style={{ color: t.yellow }}>main</span>
      </div>
      <div>
        <span style={{ color: t.green }}>❯</span> git status
      </div>
      <div style={{ color: t.red }}>modified: src/session.ts</div>
      <div>
        <span style={{ color: t.green }}>❯</span>{" "}
        <span
          className={`cursor-sample ${s.cursorStyle}${s.cursorBlink ? " blink" : ""}`}
          style={{ ["--cursor" as string]: cursorColor }}
        />
      </div>
    </div>
  );
}

function ThemeSection() {
  const s = useSettings();
  return (
    <Section id="sec-tema" title="Tema">
      <Row label="Aparência" help="Cores da interface e do terminal." stacked>
        <div className="theme-grid" role="radiogroup" aria-label="Tema">
          {THEMES.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={t.id === s.theme}
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
      </Row>
    </Section>
  );
}

function TextSection() {
  const s = useSettings();
  const [font, setFont] = useState(s.fontFamily);
  useEffect(() => setFont(s.fontFamily), [s.fontFamily]);

  return (
    <Section id="sec-texto" title="Texto">
      <Row label="Fonte" help="Nome de uma fonte monoespaçada instalada. Se não existir, usa Cascadia Code ou Consolas.">
        <input
          className="text-input"
          list="font-presets"
          value={font}
          spellCheck={false}
          aria-label="Fonte"
          onChange={(e) => setFont(e.target.value)}
          onBlur={() => updateSettings({ fontFamily: font })}
          onKeyDown={(e) => e.key === "Enter" && updateSettings({ fontFamily: font })}
        />
        <datalist id="font-presets">
          {FONT_PRESETS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </Row>

      <Row label="Tamanho" help="Vale para o texto novo; blocos já terminados mantêm a largura de quando foram gerados.">
        <Slider
          label="Tamanho da fonte"
          value={s.fontSize}
          min={FONT_SIZE_RANGE.min}
          max={FONT_SIZE_RANGE.max}
          format={(v) => `${v}px`}
          onChange={(fontSize) => updateSettings({ fontSize })}
        />
      </Row>

      <Row label="Altura da linha" help="1 é o padrão. Valores maiores deixam o texto mais arejado.">
        <Slider
          label="Altura da linha"
          value={s.lineHeight}
          min={LINE_HEIGHT_RANGE.min}
          max={LINE_HEIGHT_RANGE.max}
          step={LINE_HEIGHT_RANGE.step}
          format={(v) => v.toFixed(2)}
          onChange={(lineHeight) => updateSettings({ lineHeight })}
        />
      </Row>

      <Row label="Espaço entre letras">
        <Slider
          label="Espaço entre letras"
          value={s.letterSpacing}
          min={LETTER_SPACING_RANGE.min}
          max={LETTER_SPACING_RANGE.max}
          step={LETTER_SPACING_RANGE.step}
          format={(v) => `${v}px`}
          onChange={(letterSpacing) => updateSettings({ letterSpacing })}
        />
      </Row>
    </Section>
  );
}

function CursorSection() {
  const s = useSettings();
  const theme = getTheme(s.theme);
  return (
    <Section id="sec-cursor" title="Cursor">
      <Row label="Formato">
        <select
          className="select"
          aria-label="Formato do cursor"
          value={s.cursorStyle}
          onChange={(e) => updateSettings({ cursorStyle: e.target.value as CursorStyle })}
        >
          <option value="block">Bloco</option>
          <option value="underline">Sublinhado</option>
          <option value="bar">Barra</option>
        </select>
      </Row>

      <Row label="Piscando">
        <Switch label="Cursor piscando" checked={s.cursorBlink} onChange={(cursorBlink) => updateSettings({ cursorBlink })} />
      </Row>

      <Row label="Cor" help="Sem escolha, usa a cor do tema.">
        <div className="color-row">
          <input
            type="color"
            aria-label="Cor do cursor"
            value={s.cursorColor || theme.term.cursor || "#ffffff"}
            onChange={(e) => updateSettings({ cursorColor: e.target.value })}
          />
          <button type="button" className="btn ghost" onClick={() => updateSettings({ cursorColor: "" })} disabled={!s.cursorColor}>
            Usar a do tema
          </button>
        </div>
      </Row>
    </Section>
  );
}

function ShellSection() {
  const s = useSettings();
  const [shells, setShells] = useState<ShellOption[]>([]);
  useEffect(() => {
    invoke<ShellOption[]>("available_shells")
      .then(setShells)
      .catch(() => setShells([]));
  }, []);

  return (
    <Section id="sec-shell" title="Shell">
      <Row
        label="Shell padrão"
        help="Vale para as abas novas. Pelo botão direito do + dá para escolher outro só daquela vez."
      >
        <select
          className="select"
          aria-label="Shell padrão"
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
      </Row>
    </Section>
  );
}

function LayoutSection() {
  const s = useSettings();
  return (
    <Section id="sec-abas" title="Abas e barra lateral">
      <Row label="Lado da barra lateral">
        <select
          className="select"
          aria-label="Lado da barra lateral"
          value={s.sidebarSide}
          onChange={(e) => updateSettings({ sidebarSide: e.target.value as SidebarSide })}
        >
          <option value="left">Esquerda</option>
          <option value="right">Direita</option>
        </select>
      </Row>

      <Row label="Largura da barra lateral" help="Vale com a barra aberta; recolhida, ela tem largura fixa.">
        <Slider
          label="Largura da barra lateral"
          value={s.sidebarWidth}
          min={SIDEBAR_WIDTH_RANGE.min}
          max={SIDEBAR_WIDTH_RANGE.max}
          step={SIDEBAR_WIDTH_RANGE.step}
          format={(v) => `${v}px`}
          onChange={(sidebarWidth) => updateSettings({ sidebarWidth })}
        />
      </Row>

      <Row label="Onde entra a aba nova">
        <select
          className="select"
          aria-label="Onde entra a aba nova"
          value={s.newTabPosition}
          onChange={(e) => updateSettings({ newTabPosition: e.target.value as NewTabPosition })}
        >
          <option value="end">No fim da lista</option>
          <option value="afterCurrent">Logo depois da aba atual</option>
        </select>
      </Row>

      <Row
        label="Fechar a aba quando o shell terminar"
        help="Desligado, o comando exit deixa a aba aberta com o aviso de processo encerrado."
      >
        <Switch
          label="Fechar a aba quando o shell terminar"
          checked={s.closeOnExit}
          onChange={(closeOnExit) => updateSettings({ closeOnExit })}
        />
      </Row>
    </Section>
  );
}

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
}

/** Tudo que dá para personalizar, numa página só: prévia fixa no topo e atalhos para cada seção. */
export function CustomizePage({ session }: { session: Session | null }) {
  return (
    <div className="customize">
      <div className="customize-top">
        <Preview />
        <nav className="jump" aria-label="Ir para a seção">
          {SECTIONS.map((sec) => (
            <button key={sec.id} type="button" onClick={() => jumpTo(sec.id)}>
              {sec.label}
            </button>
          ))}
        </nav>
      </div>

      <ThemeSection />
      <TextSection />
      <CursorSection />
      <ShellSection />
      <LayoutSection />

      <Section id="sec-prompt" title="Prompt">
        <Row label="Barra de digitação" help="Widgets, estilo, cores e posição da linha onde você digita." stacked>
          <PromptStudio session={session} />
        </Row>
      </Section>
    </div>
  );
}
