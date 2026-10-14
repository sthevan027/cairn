import type { SVGProps } from "react";

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
