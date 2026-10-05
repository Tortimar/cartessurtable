"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { RARITY_LABEL, type Rarity } from "@/lib/game";
import { CoinIcon, GearIcon, NAV_ICONS, PackIcon } from "./icons";
import { Logo } from "./decor";

/* ───────── Appels API ───────── */

export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) location.href = "/login";
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erreur ${res.status}`);
  return data as T;
}

/* ───────── Joueur + toasts (contexte global) ───────── */

export type Me = { id: string; username: string; coins: number; boosters: number; boosterMax: number; nextBoosterInMs: number | null; friendRequests: number; tradeRequests: number };
type Toast = { id: number; text: string; kind: "ok" | "error" };
type Ctx = { me: Me | null; refreshMe: () => Promise<void>; toast: (text: string, kind?: Toast["kind"]) => void; run: <T>(fn: () => Promise<T>, okText?: string | ((r: T) => string)) => Promise<T | undefined> };

const GameCtx = createContext<Ctx | null>(null);
export const useGame = () => useContext(GameCtx)!;

export function GameProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const refreshMe = useCallback(async () => {
    try { setMe(await api<Me>("/api/me")); } catch { /* redirection gérée par api() */ }
  }, []);

  const toast = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  /** Exécute une action, affiche le résultat, rafraîchit le solde. */
  const run = useCallback(async <T,>(fn: () => Promise<T>, okText?: string | ((r: T) => string)) => {
    try {
      const r = await fn();
      if (okText) toast(typeof okText === "function" ? okText(r) : okText);
      refreshMe();
      return r;
    } catch (e) {
      toast((e as Error).message, "error");
      return undefined;
    }
  }, [toast, refreshMe]);

  useEffect(() => {
    refreshMe();
    const t = setInterval(refreshMe, 30_000);
    return () => clearInterval(t);
  }, [refreshMe]);

  return (
    <GameCtx.Provider value={{ me, refreshMe, toast, run }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </GameCtx.Provider>
  );
}

/* ───────── Navigation ───────── */

const LINKS = [
  ["/boosters", "Boosters"],
  ["/collection", "Collection"],
  ["/marche", "Marché"],
  ["/produits", "Produits"],
  ["/usines", "Usines"],
  ["/cartes", "Cartes"],
  ["/classement", "Classement"],
  ["/amis", "Amis"],
  ["/echanges", "Échanges"],
] as const;
/** Sur téléphone : 5 onglets dans la barre du bas, le reste dans « Plus ». */
const MOBILE_MAIN = LINKS.slice(0, 5);
const MOBILE_MORE = LINKS.slice(5);

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { me, refreshMe } = useGame();
  const next = useCountdown(me?.nextBoosterInMs ?? null);
  // Un booster vient de se recharger : on met à jour le compteur sans attendre le rafraîchissement périodique
  useEffect(() => { if (next === 0) { const t = setTimeout(refreshMe, 400); return () => clearTimeout(t); } }, [next, refreshMe]);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [path]);
  const logout = async () => { await api("/api/auth/logout", { method: "POST" }); router.push("/login"); };
  const badge = (href: string) =>
    (href === "/amis" && !!me?.friendRequests && <span className="nav-badge" title="Demandes d'amis en attente">{me.friendRequests}</span>) ||
    (href === "/echanges" && !!me?.tradeRequests && <span className="nav-badge" title="Propositions d'échange reçues">{me.tradeRequests}</span>);
  const moreBadge = (me?.friendRequests ?? 0) + (me?.tradeRequests ?? 0);
  const moreActive = MOBILE_MORE.some(([h]) => path.startsWith(h));

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/boosters" className="logo" aria-label="Cartes sur Table — accueil"><Logo /></Link>
          <div className="nav-links">
            {LINKS.filter(([href]) => href !== "/echanges").map(([href, label]) => (
              // Sur ordinateur, Échanges est un onglet de la page Amis
              <Link key={href} href={href} className={path.startsWith(href) || (href === "/amis" && path.startsWith("/echanges")) ? "active" : ""}>
                {label}
                {href === "/amis" ? moreBadge > 0 && <span className="nav-badge" title="Demandes d'amis et propositions d'échange">{moreBadge}</span> : badge(href)}
              </Link>
            ))}
          </div>
          {me && (
            <div className="nav-stats">
              <Link href="/boosters" className="pill" title="Boosters disponibles"><PackIcon /> <span className="num">{me.boosters}/{me.boosterMax}</span>{next != null && <small className="num">{fmtMs(next)}</small>}</Link>
              <span className="pill pill-price" title="Pièces"><CoinIcon /> <span className="num">{me.coins.toLocaleString("fr-FR")}</span></span>
              <button className="btn btn-ghost btn-sm nav-quit" onClick={logout} title={`Connecté en tant que ${me.username} — se déconnecter`} aria-label="Se déconnecter">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="quit-label">Quitter</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Barre d'onglets fixe en bas de l'écran, uniquement sur téléphone */}
      <nav className="tabbar" aria-label="Navigation principale">
        {MOBILE_MAIN.map(([href, label]) => (
          <Link key={href} href={href} className={path.startsWith(href) ? "active" : ""}>
            {NAV_ICONS[href]({ size: 22 })}
            <span>{label}</span>
          </Link>
        ))}
        <button className={moreActive || moreOpen ? "active" : ""} onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>
          {NAV_ICONS.more({ size: 22 })}
          <span>Plus</span>
          {moreBadge > 0 && <span className="nav-badge dot">{moreBadge}</span>}
        </button>
      </nav>
      {moreOpen && (
        <div className="sheet-bg" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {me && <div className="sheet-user">Connecté en tant que <b>{me.username}</b></div>}
            {MOBILE_MORE.map(([href, label]) => (
              <Link key={href} href={href} className={`sheet-item ${path.startsWith(href) ? "active" : ""}`}>
                {NAV_ICONS[href]({ size: 22 })} {label}{badge(href)}
              </Link>
            ))}
            <button className="sheet-item" onClick={logout}>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Se déconnecter
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ───────── Compte à rebours ───────── */

/** Décompte local à partir d'une durée serveur ; null quand terminé ou absent. */
export function useCountdown(ms: number | null) {
  const [left, setLeft] = useState(ms);
  useEffect(() => {
    if (ms == null) { setLeft(null); return; }
    const end = Date.now() + ms;
    setLeft(ms);
    const t = setInterval(() => setLeft(Math.max(0, end - Date.now())), 250);
    return () => clearInterval(t);
  }, [ms]);
  return left;
}

export function fmtMs(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function fmtInterval(sec: number) {
  if (sec < 60) return `${sec} s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60), r = sec % 60;
    return r ? `${m} min ${r} s` : `${m} min`;
  }
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/* ───────── Carte ingrédient ───────── */

export type IngredientLike = { id: string; name: string; rarity: string; imageUrl?: string | null };

function hue(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
const fallbackBg = (id: string) => `linear-gradient(160deg, hsl(${hue(id)} 40% 34%), hsl(${(hue(id) + 40) % 360} 35% 16%))`;

export function RarityTag({ rarity }: { rarity: string }) {
  return <span className={`rarity-tag r-${rarity}`}>{RARITY_LABEL[rarity as Rarity] ?? rarity}</span>;
}

export function RarityBadge({ rarity }: { rarity: string }) {
  return <span className={`rarity-badge r-${rarity}`}>{RARITY_LABEL[rarity as Rarity] ?? rarity}</span>;
}

/** Photo de l'ingrédient, ou initiale sur fond coloré si absente / introuvable. */
function Photo({ ing, className, letterSize }: { ing: IngredientLike; className: string; letterSize?: string }) {
  const [broken, setBroken] = useState(false);
  if (ing.imageUrl && !broken)
    return <div className={className}><img src={ing.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /></div>;
  return <div className={`${className} fallback`} style={{ background: fallbackBg(ing.id), fontSize: letterSize }}>{ing.name.charAt(0).toUpperCase()}</div>;
}

export function Thumb({ ing, small }: { ing: IngredientLike; small?: boolean }) {
  return <span className={`r-${ing.rarity}`} style={{ display: "contents" }}><Photo ing={ing} className={`thumb ${small ? "sm" : ""}`} /></span>;
}

const HOLO = new Set(["RARE", "EPIC", "LEGENDARY"]);

type CardProps = {
  ing: IngredientLike;
  qty?: number;
  children?: ReactNode;
  /** ingrédient (photo plein cadre), produit (photo d'emballage entière) ou usine (cadre industriel) */
  kind?: "ingredient" | "product" | "factory" | "productFactory";
  /** ligne d'information sous le nom */
  subtitle?: ReactNode;
  /** pastille en haut à droite (remplace la quantité), ex. niveau d'usine */
  corner?: ReactNode;
  onClick?: () => void;
};

/** Carte de jeu : ingrédient, produit ou usine. */
export function GameCard({ ing, qty, children, kind = "ingredient", subtitle, corner, onClick }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isFactory = kind === "factory" || kind === "productFactory";
  const holo = HOLO.has(ing.rarity) || isFactory;
  const move = (e: React.PointerEvent) => {
    if (!holo || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    ref.current.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  };
  return (
    <div ref={ref} className={`card card-${kind} ${isFactory ? "card-factory" : ""} r-${ing.rarity} ${holo ? "holo" : ""} ${onClick ? "clickable" : ""}`} onPointerMove={move} onClick={onClick}>
      <div className="card-inner">
        <div className="card-top">
          <RarityBadge rarity={ing.rarity} />
          {corner ?? (qty != null && <span className="card-qty">×{qty}</span>)}
        </div>
        <Photo ing={ing} className={`card-photo ${kind === "product" || kind === "productFactory" ? "contain" : ""}`} />
        {isFactory && <div className="card-gear" aria-hidden><GearIcon size={20} /></div>}
        <div className="card-body">
          {kind !== "ingredient" && <div className="card-kind">{kind === "product" ? "Produit" : kind === "productFactory" ? "Usine de produits" : "Usine"}</div>}
          <div className="card-name" title={ing.name}>{ing.name}</div>
          {subtitle && <div className="card-sub">{subtitle}</div>}
          {children && <div className="card-actions">{children}</div>}
        </div>
        {holo && <div className="card-holo" />}
      </div>
    </div>
  );
}

export const IngredientCard = GameCard;

/* ───────── Modale ───────── */

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function RarityFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Rareté">
      <option value="">Toutes raretés</option>
      {Object.entries(RARITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

/* ───────── Avatar (initiale sur fond coloré) ───────── */

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  let h = 0;
  for (const c of name) h = (h * 37 + c.charCodeAt(0)) % 360;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(140deg, hsl(${h} 55% 45%), hsl(${(h + 50) % 360} 50% 28%))` }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/* ───────── Onglets Amis / Échanges ───────── */

export function SocialTabs() {
  const path = usePathname();
  const { me } = useGame();
  return (
    <div className="tabs social-tabs">
      <Link href="/amis" className={path.startsWith("/amis") ? "on" : ""}>Amis{!!me?.friendRequests && <span className="nav-badge">{me.friendRequests}</span>}</Link>
      <Link href="/echanges" className={path.startsWith("/echanges") ? "on" : ""}>Échanges{!!me?.tradeRequests && <span className="nav-badge">{me.tradeRequests}</span>}</Link>
    </div>
  );
}
