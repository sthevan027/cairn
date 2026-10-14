import {
  COLOR_TOKENS,
  isColorRef,
  newSegment,
  type CwdStyle,
  type PromptSegment,
  type SegmentStyle,
  type SegmentType,
} from "./promptConfig";

/** Tipos do oh-my-posh que viram widgets do Cairn (o resto é ignorado). */
const TYPE_MAP: Record<string, SegmentType> = {
  session: "user",
  path: "cwd",
  git: "git",
  status: "status",
  executiontime: "duration",
  time: "time",
  shell: "shell",
  text: "text",
};

const STYLE_MAP: Record<string, SegmentStyle> = {
  plain: "plain",
  powerline: "powerline",
  diamond: "pill",
  accordion: "plain",
};

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

/** `p:nome` busca na paleta; `#hex` e nomes de cor ANSI passam; `transparent`/vazio viram "sem cor". */
function mapColor(raw: unknown, palette: Json): string {
  if (typeof raw !== "string") return "";
  let value = raw.trim();
  if (value.startsWith("p:")) {
    const named = palette[value.slice(2)];
    value = typeof named === "string" ? named.trim() : "";
  }
  if (value === "" || value === "transparent" || value === "parentBackground" || value === "background") return "";
  value = value.toLowerCase();
  if (isColorRef(value) && value !== "") return value;
  return (COLOR_TOKENS as readonly string[]).includes(value) ? value : "";
}

/** Primeiro glifo "de ícone" (fora do ASCII) escrito fora dos `{{ }}` do template. */
function iconFromTemplate(template: unknown): string {
  if (typeof template !== "string") return "";
  const outside = template.replace(/\{\{.*?\}\}/g, " ");
  for (const ch of outside) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 0x2000 && ch.trim() !== "") return ch;
  }
  return "";
}

function cwdStyleOf(options: unknown): CwdStyle {
  const style = isObj(options) && typeof options.style === "string" ? options.style : "";
  if (style === "folder") return "folder";
  if (style === "letter" || style === "mixed") return "short";
  return "full";
}

export interface OmpImportResult {
  segments: PromptSegment[];
  /** Quantos segmentos do arquivo não tinham equivalente e ficaram de fora. */
  skipped: number;
}

/** Converte um arquivo `.omp.json` (versão 2+) nos widgets do Cairn. */
export function importOhMyPosh(raw: unknown): OmpImportResult | null {
  if (!isObj(raw) || !Array.isArray(raw.blocks)) return null;
  const palette = isObj(raw.palette) ? raw.palette : {};
  const segments: PromptSegment[] = [];
  let skipped = 0;

  for (const block of raw.blocks) {
    if (!isObj(block) || !Array.isArray(block.segments)) continue;
    const side = block.alignment === "right" ? "right" : "left";
    for (const seg of block.segments) {
      if (!isObj(seg) || typeof seg.type !== "string") continue;
      const type = TYPE_MAP[seg.type];
      // o "❯" sozinho é o símbolo de entrada, que o Cairn já mantém no shell
      const isInputMark = seg.type === "text" && typeof seg.template === "string" && seg.template.trim() === "❯";
      if (!type || isInputMark) {
        if (!isInputMark) skipped++;
        continue;
      }
      const options: Partial<PromptSegment["options"]> = {};
      const o = isObj(seg.options) ? seg.options : {};
      if (type === "cwd") options.cwdStyle = cwdStyleOf(o);
      if (type === "duration" && typeof o.threshold === "number") options.minMs = o.threshold;
      if (type === "status" && o.always_enabled === true) options.always = true;
      if (type === "text" && typeof seg.template === "string") options.text = seg.template.trim();

      const base = newSegment(type);
      segments.push({
        ...base,
        side,
        style: STYLE_MAP[typeof seg.style === "string" ? seg.style : "plain"] ?? "plain",
        fg: mapColor(seg.foreground, palette),
        bg: mapColor(seg.background, palette),
        icon: iconFromTemplate(seg.template) || (type === "text" ? "" : base.icon),
        options: { ...base.options, ...options },
      });
    }
  }
  return { segments, skipped };
}
