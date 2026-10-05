// Icônes dessinées en SVG : rendu identique sur tous les systèmes
// (les emojis récents, comme la pièce 🪙, s'affichent en carré sur certains Windows/Android).
import type { CSSProperties, ReactNode } from "react";

type P = { size?: number; className?: string; style?: CSSProperties; title?: string };

function Svg({ size = 18, className, style, title, children, viewBox = "0 0 24 24" }: P & { children: ReactNode; viewBox?: string }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} className={`icon ${className ?? ""}`} style={style} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** Pièce de monnaie dorée. */
export const CoinIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" fill="#f0a04b" />
    <circle cx="12" cy="12" r="7.2" fill="#ffc46b" stroke="#c97a26" strokeWidth="1.2" />
    <path d="M12 7.6v8.8M9.8 9.6c0-1 1-1.6 2.2-1.6s2.2.6 2.2 1.5c0 2.2-4.4 1.4-4.4 3.6 0 .9 1 1.5 2.2 1.5s2.2-.6 2.2-1.6" fill="none" stroke="#9a5a12" strokeWidth="1.4" strokeLinecap="round" />
  </Svg>
);

/** Petit booster (paquet vert). */
export const PackIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 4.5h14l-1 1 1 1v13l-1 1 1 1H5l1-1-1-1v-13l1-1z" fill="#12694b" stroke="#34d399" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M7 8h10" stroke="#6ee7b7" strokeWidth="1" strokeDasharray="1.5 1.5" />
    <circle cx="12" cy="14" r="3" fill="#6ee7b7" />
  </Svg>
);

/** Engrenage (usine). */
export const GearIcon = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2.2 1.6 2 3.4 2.5-1c.5.4 1.1.8 1.7 1l.4 2.7h4l.4-2.7c.6-.2 1.2-.6 1.7-1l2.5 1 2-3.4zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
  </Svg>
);

/** Boîte de conserve (produit sans photo). */
export const CanIcon = (p: P) => (
  <Svg {...p}>
    <ellipse cx="12" cy="5.5" rx="6.5" ry="2.2" fill="#9aa5a0" />
    <path d="M5.5 5.5v13c0 1.2 2.9 2.2 6.5 2.2s6.5-1 6.5-2.2v-13c0 1.2-2.9 2.2-6.5 2.2S5.5 6.7 5.5 5.5z" fill="#c0392b" />
    <path d="M5.5 10c0 1.2 2.9 2.2 6.5 2.2s6.5-1 6.5-2.2v4.5c0 1.2-2.9 2.2-6.5 2.2s-6.5-1-6.5-2.2z" fill="#f1c40f" />
  </Svg>
);

export const SoundIcon = ({ muted, ...p }: P & { muted?: boolean }) => (
  <Svg {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    {muted ? (
      <path d="M16 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    ) : (
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    )}
  </Svg>
);

const MEDAL = ["#ffe144", "#cfd8dc", "#e0a36c"];
/** Médaille numérotée (1 = or, 2 = argent, 3 = bronze). */
export const Medal = ({ place, ...p }: P & { place: 1 | 2 | 3 }) => (
  <Svg {...p}>
    <path d="M8 2h3l1 5-2.5 1zM16 2h-3l-1 5 2.5 1z" fill="#e5604f" />
    <circle cx="12" cy="14.5" r="7" fill={MEDAL[place - 1]} stroke="rgba(0,0,0,.25)" strokeWidth="1" />
    <text x="12" y="18.3" textAnchor="middle" fontSize="10" fontWeight="800" fontFamily="Outfit, Inter, sans-serif" fill="#0c0d0c">{place}</text>
  </Svg>
);

/* Icônes de la barre de navigation mobile (traits, couleur courante) */
const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const NAV_ICONS: Record<string, (p: P) => ReactNode> = {
  "/boosters": (p) => <Svg {...p}><path {...line} d="M6 3.5h12l-1 1.5 1 1.5v11l-1 1.5 1 1.5H6l1-1.5-1-1.5v-11L7 5 6 3.5z" /><circle {...line} cx="12" cy="12.5" r="2.5" /></Svg>,
  "/collection": (p) => <Svg {...p}><rect {...line} x="3.5" y="5" width="10" height="14" rx="2" /><path {...line} d="M16.5 6.5l3 .8a1.5 1.5 0 0 1 1 1.8l-2.6 9.7a1.5 1.5 0 0 1-1.8 1L14 19.2" /></Svg>,
  "/marche": (p) => <Svg {...p}><path {...line} d="M4 9h16l-1.2-4.5H5.2zM5 9v10h14V9M9.5 19v-5h5v5" /></Svg>,
  "/produits": (p) => <Svg {...p}><path {...line} d="M7 4h10M8 4v3l-2 3v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9l-2-3V4M6 12h12" /></Svg>,
  "/usines": (p) => <Svg {...p}><path {...line} d="M3 20V10l5 3v-3l5 3v-3l5 3V4h3v16zM7 17h2m3 0h2m3 0h1" /></Svg>,
  "/cartes": (p) => <Svg {...p}><rect {...line} x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect {...line} x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect {...line} x="3.5" y="13.5" width="7" height="7" rx="1.5" /><circle {...line} cx="17" cy="17" r="3" /><path {...line} d="M19.2 19.2l1.8 1.8" /></Svg>,
  "/classement": (p) => <Svg {...p}><path {...line} d="M8 20v-7H4v7zm6 0V5h-4v15zm6 0V9h-4v11z" /></Svg>,
  "/amis": (p) => <Svg {...p}><circle {...line} cx="9" cy="8" r="3.2" /><path {...line} d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5M16 5.2a3 3 0 0 1 0 5.6M18 14.6c1.6.6 2.7 2.3 3 4.9" /></Svg>,
  "/echanges": (p) => <Svg {...p}><path {...line} d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" /></Svg>,
  more: (p) => <Svg {...p}><circle cx="5.5" cy="12" r="1.7" fill="currentColor" /><circle cx="12" cy="12" r="1.7" fill="currentColor" /><circle cx="18.5" cy="12" r="1.7" fill="currentColor" /></Svg>,
};
