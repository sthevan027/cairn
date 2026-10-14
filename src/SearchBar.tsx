import { useEffect, useRef } from "react";

interface Props {
  query: string;
  onChange: (query: string) => void;
  shown: number;
  total: number;
  /** `clear`: Esc limpa o filtro; Enter só fecha a barra e mantém o filtro. */
  onClose: (clear: boolean) => void;
}

export function SearchBar({ query, onChange, shown, total, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  return (
    <div className="ai-bar search" onClick={(e) => e.stopPropagation()}>
      <span className="ai-label">buscar</span>
      <input
        ref={input}
        value={query}
        spellCheck={false}
        autoComplete="off"
        placeholder="comando ou saída dos blocos"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // preventDefault: sem isso o keypress do Enter cai no terminal assim que o foco volta pra ele.
          if (e.key === "Escape") {
            e.preventDefault();
            onClose(true);
          }
          if (e.key === "Enter") {
            e.preventDefault();
            onClose(false);
          }
        }}
      />
      <span className="ai-hint">
        {query.trim() ? `${shown} de ${total} blocos · Esc limpa` : "Esc fecha"}
      </span>
    </div>
  );
}
