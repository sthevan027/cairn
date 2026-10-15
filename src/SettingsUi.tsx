import type { ReactNode } from "react";

/**
 * Primitivos das telas de configuração. Mesmo vocabulário em todo lugar: uma seção agrupa linhas,
 * cada linha tem rótulo e ajuda à esquerda e o controle à direita.
 */

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="sec" id={id} aria-labelledby={`${id}-title`}>
      <h3 className="sec-title" id={`${id}-title`}>
        {title}
      </h3>
      <div className="sec-body">{children}</div>
    </section>
  );
}

interface RowProps {
  label: string;
  help?: string;
  /** Controle largo (grade de temas, editor): vai embaixo do rótulo, ocupando a linha toda. */
  stacked?: boolean;
  children: ReactNode;
}

export function Row({ label, help, stacked = false, children }: RowProps) {
  return (
    <div className={`row${stacked ? " stacked" : ""}`}>
      <div className="row-text">
        <div className="row-label">{label}</div>
        {help && <div className="row-help">{help}</div>}
      </div>
      <div className="row-control">{children}</div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" />
    </label>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  format,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (value: number) => string;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="range-row">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>{format(value)}</output>
    </div>
  );
}
