import type { SVGProps } from "react";
import type { Program } from "./programs";

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

type IconProps = SVGProps<SVGSVGElement>;

export const SearchIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const BranchIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="6" cy="6" r="2.2" />
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="8" r="2.2" />
    <path d="M6 8.2v7.6M18 10.2c0 4.5-6 3-12 6" />
  </svg>
);

export const PanelIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
);

/** Ícone do programa que a aba está rodando (traços simples, cores de cada marca). */
export function ProgramIcon({ program, size = 18 }: { program: Program; size?: number }) {
  const props = { ...base, width: size, height: size };
  switch (program) {
    case "claude":
      return (
        <svg {...props} stroke="#d97757" strokeWidth={2.4}>
          <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
        </svg>
      );
    case "agent":
      return (
        <svg {...props} stroke="#bb9af7">
          <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" />
        </svg>
      );
    case "git":
      return (
        <svg {...props} stroke="#f05033">
          <circle cx="6" cy="6" r="2.2" />
          <circle cx="6" cy="18" r="2.2" />
          <circle cx="18" cy="8" r="2.2" />
          <path d="M6 8.2v7.6M18 10.2c0 4.5-6 3-12 6" />
        </svg>
      );
    case "node":
      return (
        <svg {...props} stroke="#6cc24a">
          <path d="M12 2.5 20 7v10l-8 4.5L4 17V7z" />
          <path d="M9 10v4.5M9 10l5 4.5M15 9.5v5" />
        </svg>
      );
    case "python":
      return (
        <svg {...props} strokeWidth={2.2}>
          <path stroke="#4b8bbe" d="M12 3H8.5A2.5 2.5 0 0 0 6 5.5V9h6.5M6 9H5a2 2 0 0 0-2 2v1" />
          <path stroke="#ffd43b" d="M12 21h3.5A2.5 2.5 0 0 0 18 18.5V15h-6.5M18 15h1a2 2 0 0 0 2-2v-1" />
        </svg>
      );
    case "rust":
      return (
        <svg {...props} stroke="#dea584">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
        </svg>
      );
    case "docker":
      return (
        <svg {...props} stroke="#2496ed">
          <path d="M3 13h18c0 4-3 6.5-8 6.5S3 17 3 13ZM6 13v-3h3v3M9 13v-3h3v3M12 13v-3h3v3M9 10V7h3v3" />
        </svg>
      );
    case "editor":
      return (
        <svg {...props} stroke="#9ece6a">
          <path d="M4 20l1-4 11-11 3 3L8 19l-4 1ZM14 7l3 3" />
        </svg>
      );
    case "ssh":
      return (
        <svg {...props} stroke="#e0af68">
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      );
    default:
      return <span className="glyph">&gt;_</span>;
  }
}
