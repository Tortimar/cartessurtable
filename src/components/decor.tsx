"use client";

// Habillage « cuisine, table, marché, ferme » : logo et illustrations au trait.
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Assiette vue de dessus, une carte posée dessus. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="21" r="17" fill="#f4e4c8" />
      <circle cx="20" cy="21" r="12.5" fill="none" stroke="#d9c39c" strokeWidth="1.4" />
      <g transform="rotate(-12 20 20)">
        <rect x="13" y="9" width="14" height="20" rx="2.4" fill="#d4492a" stroke="#7a2a17" strokeWidth="1" />
        <rect x="15.2" y="11.2" width="9.6" height="15.6" rx="1.4" fill="none" stroke="#fff6ea" strokeWidth="1" strokeDasharray="1.6 1.4" />
        <path d="M20 15.2c1.8 0 3 1.3 3 2.9 0 2.3-3 4.2-3 4.2s-3-1.9-3-4.2c0-1.6 1.2-2.9 3-2.9z" fill="#f3b544" />
        <path d="M20 15.4c.4-1.5 1.4-2.3 2.6-2.4-.3 1.2-1.2 2.1-2.6 2.4z" fill="#96c25e" />
      </g>
    </svg>
  );
}

export function Logo({ size }: { size?: number }) {
  return (
    <>
      <LogoMark size={size} />
      <span className="logo-text">Cartes sur Table</span>
    </>
  );
}

/* Illustrations au trait, une par page (filigrane en haut à droite). */
const s = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const a = { fill: "var(--decor-accent)", stroke: "none" };

const ART: Record<string, ReactNode> = {
  // Sac de courses en papier : baguette et poireau qui dépassent
  "/boosters": (
    <>
      <path {...s} d="M44 62l7 76h64l7-76z" />
      <path {...s} d="M44 62h78M60 62v-6M106 62v-6" />
      <path {...a} d="M57 30l9-4 16 36h-10z" opacity=".55" />
      <path {...s} d="M57 30l9-4 16 36M62 37l5-2M66 45l5-2M70 53l5-2" />
      <path {...s} d="M96 62l6-44M102 18c-6 4-10 12-9 20M102 18c5 5 7 13 5 21" />
      <path {...s} d="M68 96h30M72 110h22" strokeDasharray="2 7" />
    </>
  ),
  // Étagère de bocaux
  "/collection": (
    <>
      <path {...s} d="M18 120h124M18 70h124" />
      <rect {...s} x="28" y="84" width="28" height="36" rx="6" /><path {...s} d="M30 84v-6h24v6" />
      <rect {...a} x="31" y="100" width="22" height="17" rx="4" opacity=".55" />
      <rect {...s} x="66" y="78" width="32" height="42" rx="7" /><path {...s} d="M68 78v-7h28v7" />
      <rect {...s} x="108" y="90" width="24" height="30" rx="5" /><path {...s} d="M110 90v-5h20v5" />
      <rect {...s} x="34" y="34" width="26" height="36" rx="6" /><path {...s} d="M36 34v-6h22v6" />
      <rect {...s} x="72" y="40" width="22" height="30" rx="5" /><path {...s} d="M74 40v-5h18v5" />
      <rect {...a} x="75" y="52" width="16" height="15" rx="3" opacity=".55" />
      <rect {...s} x="104" y="30" width="30" height="40" rx="7" /><path {...s} d="M106 30v-6h26v6" />
    </>
  ),
  // Étal de marché avec son store festonné
  "/marche": (
    <>
      <path {...s} d="M22 52h116l-8-24H30z" />
      <path {...a} d="M30 28h17l-3 24H22zM64 28h16v24H60zM96 28h17l7 24h-16z" opacity=".55" />
      <path {...s} d="M22 52c0 8 13 8 13 0 0 8 13 8 13 0 0 8 13 8 13 0 0 8 13 8 13 0 0 8 13 8 13 0 0 8 13 8 13 0 0 8 13 8 13 0 0 8 13 8 13 0" />
      <path {...s} d="M30 60v76M130 60v76M24 106h112v12H24z" />
      <circle {...s} cx="46" cy="96" r="9" /><circle {...s} cx="64" cy="97" r="8" /><circle {...a} cx="64" cy="97" r="6" opacity=".55" />
      <path {...s} d="M86 104c0-12 6-16 10-16s10 4 10 16M110 104l6-16 6 16" />
    </>
  ),
  // Marmite qui fume
  "/produits": (
    <>
      <path {...s} d="M34 78h92v38a16 16 0 0 1-16 16H50a16 16 0 0 1-16-16z" />
      <path {...s} d="M28 78h104M34 90H20M126 90h14" />
      <path {...s} d="M66 70a14 6 0 0 1 28 0" />
      <path {...a} d="M38 104h84v12a12 12 0 0 1-12 12H50a12 12 0 0 1-12-12z" opacity=".55" />
      <path {...s} d="M62 56c-6-8 6-12 0-22M80 52c-6-8 6-12 0-22M98 56c-6-8 6-12 0-22" />
    </>
  ),
  // Ferme : grange, silo et blé
  "/usines": (
    <>
      <path {...s} d="M30 136V82l34-26 34 26v54zM30 136h112" />
      <path {...a} d="M50 136v-32h28v32z" opacity=".55" />
      <path {...s} d="M50 136v-32h28v32zM50 104l28 32M78 104l-28 32M56 76h16" />
      <path {...s} d="M104 136V58a11 11 0 0 1 22 0v78M104 74h22M104 92h22M104 110h22" />
      <path {...s} d="M136 136v-30M136 112c-5-2-7-6-6-10 4 1 6 5 6 10zM136 112c5-2 7-6 6-10-4 1-6 5-6 10zM136 122c-5-2-7-6-6-10 4 1 6 5 6 10zM136 122c5-2 7-6 6-10-4 1-6 5-6 10z" />
    </>
  ),
  // Livre de recettes ouvert
  "/cartes": (
    <>
      <path {...s} d="M80 46c-14-10-36-12-56-8v84c20-4 42-2 56 8 14-10 36-12 56-8V38c-20-4-42-2-56 8zM80 46v84" />
      <path {...s} d="M36 60c10-2 22-1 32 3M36 74c10-2 22-1 32 3M36 88c10-2 22-1 32 3M92 63c10-4 22-5 32-3M92 77c10-4 22-5 32-3" />
      <circle {...a} cx="108" cy="102" r="10" opacity=".55" />
      <circle {...s} cx="108" cy="102" r="10" />
    </>
  ),
  // Toque de chef
  "/classement": (
    <>
      <path {...s} d="M50 98c-16-2-24-14-20-28s20-18 28-12c4-12 14-18 22-18s18 6 22 18c8-6 24-2 28 12s-4 26-20 28" />
      <path {...s} d="M50 92v34h60V92" />
      <path {...a} d="M53 112h54v12H53z" opacity=".55" />
      <path {...s} d="M62 96v14M80 96v14M98 96v14" />
    </>
  ),
  // Deux couverts autour d'une assiette
  "/amis": (
    <>
      <circle {...s} cx="80" cy="84" r="36" /><circle {...s} cx="80" cy="84" r="24" />
      <circle {...a} cx="80" cy="84" r="20" opacity=".35" />
      <path {...s} d="M28 50v22a6 6 0 0 0 12 0V50M34 50v22M34 78v52" />
      <path {...s} d="M128 130V50c-8 6-10 18-10 30h10" />
    </>
  ),
  // Panier en osier
  "/echanges": (
    <>
      <path {...s} d="M48 78a32 32 0 0 1 64 0" />
      <path {...s} d="M26 78h108l-12 52H38z" />
      <path {...a} d="M30 84h100l-3 12H33z" opacity=".55" />
      <path {...s} d="M38 96h84M42 112h76M56 78l4 52M80 78v52M104 78l-4 52" />
    </>
  ),
};

export function PageDecor() {
  const path = usePathname();
  const key = Object.keys(ART).find((k) => path.startsWith(k));
  if (!key) return null;
  return (
    <svg className="page-decor" viewBox="0 0 160 160" aria-hidden>
      {ART[key]}
    </svg>
  );
}
