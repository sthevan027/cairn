import { chipColors, segmentText, type PromptConfig, type PromptData, type PromptSegment } from "./promptConfig";
import type { Theme } from "./themes";
import { useFlip } from "./useFlip";

interface Props {
  config: PromptConfig;
  data: PromptData;
  theme: Theme;
  /** No editor, clicar num chip o seleciona. */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

function Chip({ seg, text, data, theme, selected, onSelect }: {
  seg: PromptSegment;
  text: string;
  data: PromptData;
  theme: Theme;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const { color, background } = chipColors(seg, data, theme);
  const props = onSelect
    ? { role: "button", tabIndex: 0, onClick: () => onSelect(seg.id) }
    : {};
  return (
    <span
      className={`chip ${seg.style}${selected ? " selected" : ""}${onSelect ? " pickable" : ""}`}
      data-flip={seg.id}
      style={{ color, background, ["--chip-bg" as string]: background }}
      {...props}
    >
      {seg.icon && <span className="chip-icon">{seg.icon}</span>}
      <span>{text}</span>
    </span>
  );
}

/** Linha de widgets do prompt desenhada pelo Cairn: esquerda e direita, com as cores do tema ativo. */
export function PromptBar({ config, data, theme, selectedId = null, onSelect }: Props) {
  const flipRef = useFlip<HTMLDivElement>();
  const shown = config.segments
    .filter((s) => s.enabled)
    .map((seg) => ({ seg, text: segmentText(seg, data) }))
    .filter((x): x is { seg: PromptSegment; text: string } => x.text !== null);

  const side = (which: "left" | "right") => (
    <div className={`chips ${which}`}>
      {shown
        .filter((x) => x.seg.side === which)
        .map(({ seg, text }) => (
          <Chip key={seg.id} seg={seg} text={text} data={data} theme={theme} selected={seg.id === selectedId} onSelect={onSelect} />
        ))}
    </div>
  );

  return (
    <div className="prompt-bar" ref={flipRef}>
      {side("left")}
      {side("right")}
    </div>
  );
}
