import { useLayoutEffect, useRef } from "react";

const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * Anima a mudança de posição dos filhos marcados com `data-flip="chave"` (técnica FLIP): ao reordenar,
 * mostrar ou esconder itens, os vizinhos deslizam até o novo lugar em vez de pular.
 */
export function useFlip<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const previous = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const next = new Map<string, DOMRect>();
    root.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      const key = el.dataset.flip!;
      const rect = el.getBoundingClientRect();
      next.set(key, rect);
      const before = previous.current.get(key);
      if (!before || (before.left === rect.left && before.top === rect.top)) return;
      el.style.transition = "none";
      el.style.transform = `translate(${before.left - rect.left}px, ${before.top - rect.top}px)`;
      void el.offsetWidth; // fixa o ponto de partida antes de liberar a transição
      el.style.transition = `transform 220ms ${EASING}`;
      el.style.transform = "";
    });
    previous.current = next;
  });

  return ref;
}
