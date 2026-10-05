"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, fmtMs, IngredientCard, RarityTag, useCountdown, useGame, type IngredientLike } from "@/components/ui";
import { SoundIcon } from "@/components/icons";
import { BOOSTER_MAX, BOOSTER_REFILL_MS, CARDS_PER_BOOSTER, DROP_WEIGHT, type Rarity } from "@/lib/game";
import { isMuted, playDeal, playReveal, playShake, playTear, setMuted } from "@/lib/sound";

type Result = { packs: IngredientLike[][] };
type Phase = "idle" | "shaking" | "torn" | "reveal";

const SHAKE_MS = 650;
const TEAR_MS = 950;
const DEAL_GAP_MS = 110;

export default function BoostersPage() {
  const { me, run } = useGame();
  const [phase, setPhase] = useState<Phase>("idle");
  const [packCount, setPackCount] = useState(1);
  const [packs, setPacks] = useState<IngredientLike[][]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [muted, setMutedState] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const next = useCountdown(me?.nextBoosterInMs ?? null);
  const available = me?.boosters ?? 0;

  useEffect(() => setMutedState(isMuted()), []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  const wait = (ms: number) => new Promise<void>((r) => later(r, ms));

  const open = async (count: number) => {
    if (phase !== "idle" || available < count) return;
    setPackCount(count);
    setPhase("shaking");
    playShake();
    // L'appel serveur part pendant l'animation : le tirage est prêt quand le paquet se déchire
    const [res] = await Promise.all([run(() => api<Result>("/api/boosters/open", { body: { count } })), wait(SHAKE_MS)]);
    if (!res) { setPhase("idle"); return; }
    setPacks(res.packs);
    setRevealed(new Set());
    setPhase("torn");
    playTear();
    await wait(TEAR_MS);
    setPhase("reveal");
    res.packs.flat().forEach((_, i) => later(() => playDeal(i), i * DEAL_GAP_MS));
  };

  const flip = (key: string, rarity: string) => {
    if (revealed.has(key)) return;
    setRevealed((s) => new Set(s).add(key));
    playReveal(rarity);
  };

  const revealAll = () => {
    const pending = packs.flatMap((p, i) => p.map((c, j) => ({ key: `${i}-${j}`, c }))).filter((x) => !revealed.has(x.key));
    pending.forEach((x, k) => later(() => flip(x.key, x.c.rarity), k * 160));
  };

  const reset = () => { timers.current.forEach(clearTimeout); setPhase("idle"); setPacks([]); };
  const toggleMute = () => { setMuted(!muted); setMutedState(!muted); };

  const total = packs.flat().length;
  const allShown = total > 0 && revealed.size === total;
  const totalWeight = Object.values(DROP_WEIGHT).reduce((a, b) => a + b, 0);
  const best = allShown ? [...packs.flat()].sort((a, b) => rank(b.rarity) - rank(a.rarity))[0] : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Boosters</h1>
          <p className="hide-mobile">{CARDS_PER_BOOSTER} ingrédients par booster, dont au moins un peu commun. Tu stockes jusqu&apos;à {BOOSTER_MAX} boosters et tu en regagnes un toutes les {BOOSTER_REFILL_MS / 60_000} minutes.</p>
        </div>
      </div>

      <div className="booster-stage">
        <button className="btn btn-ghost btn-sm stage-corner" onClick={toggleMute} aria-label={muted ? "Activer le son" : "Couper le son"} title={muted ? "Activer le son" : "Couper le son"}>
          <SoundIcon muted={muted} size={20} />
        </button>

        {phase !== "reveal" && (
          <>
            <div
              className={`pack-wrap ${phase === "shaking" ? "shaking" : ""} ${phase === "torn" ? "torn" : ""} ${available < 1 && phase === "idle" ? "disabled" : ""}`}
              onClick={() => open(1)}
              role="button"
              aria-label="Ouvrir un booster"
            >
              {packCount > 1 && phase !== "idle" && <span className="pack-badge">×{packCount}</span>}
              <div className="pack">
                <div className="pack-top"><div className="pack-shine" /></div>
                <div className="pack-body">
                  <div className="pack-art">
                    <div className="pack-logo">Cartes<b>sur Table</b></div>
                    <PackEmblem />
                    <div className="pack-sub">Booster · {CARDS_PER_BOOSTER} ingrédients</div>
                  </div>
                  <div className="pack-shine" />
                </div>
              </div>
              <div className="pack-shadow" />
            </div>
            {phase === "torn" && <><div className="burst" /><Sparks /></>}

            <div className="stage-controls">
              <div className="booster-count" aria-label={`${available} boosters disponibles`}>
                {Array.from({ length: BOOSTER_MAX }, (_, i) => <i key={i} className={i < available ? "on" : ""} />)}
              </div>
              <div className="booster-timer">
                {available >= BOOSTER_MAX ? "Stock plein" : next != null ? `Prochain booster dans ${fmtMs(next)}` : " "}
              </div>
              <div className="toolbar" style={{ marginBottom: 0, justifyContent: "center" }}>
                <button className="btn btn-primary btn-lg" disabled={phase !== "idle" || available < 1} onClick={() => open(1)}>Ouvrir un booster</button>
                {available > 1 && <button className="btn btn-lg" disabled={phase !== "idle"} onClick={() => open(available)}>Tout ouvrir ({available})</button>}
              </div>
            </div>
          </>
        )}

        {phase === "reveal" && (
          <div className="reveal-area">
            <div className="reveal-head">
              {!allShown && <button className="btn btn-primary" onClick={revealAll}>Tout révéler</button>}
              {allShown && best && <span className="pill">Meilleure carte : {best.name} <RarityTag rarity={best.rarity} /></span>}
              <button className="btn" onClick={reset} disabled={available < 1 && !allShown}>
                {available > 0 ? `Ouvrir un autre (${available})` : "Retour"}
              </button>
              <Link href="/collection" className="btn btn-ghost">Voir ma collection</Link>
            </div>
            <div className="reveal">
              {packs.map((cards, i) => [
                packs.length > 1 && <div key={`l${i}`} className="pack-label">Booster {i + 1}</div>,
                ...cards.map((c, j) => {
                  const key = `${i}-${j}`;
                  const order = i * CARDS_PER_BOOSTER + j;
                  return (
                    <div
                      key={key}
                      className={`flip r-${c.rarity} ${revealed.has(key) ? "open" : ""}`}
                      style={{ animationDelay: `${order * DEAL_GAP_MS}ms` }}
                      onClick={() => flip(key, c.rarity)}
                      role="button"
                      aria-label={revealed.has(key) ? c.name : "Retourner la carte"}
                    >
                      <div className="flip-inner">
                        <div className="flip-face"><div className="card-back"><span>Cartes<b>sur Table</b></span></div></div>
                        <div className="flip-face flip-back"><IngredientCard ing={c} /></div>
                      </div>
                    </div>
                  );
                }),
              ])}
            </div>
          </div>
        )}
      </div>

      <section style={{ marginTop: 20 }} className="panel">
        <h3 style={{ marginBottom: 6 }}>Taux de tirage par carte</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: ".9rem" }}>La rareté d&apos;un ingrédient dépend de sa popularité : plus les produits qui le contiennent sont scannés, plus il est commun.</p>
        <div className="rates">
          {(Object.keys(DROP_WEIGHT) as Rarity[]).map((r) => (
            <span key={r} className="pill"><RarityTag rarity={r} /> {((DROP_WEIGHT[r] / totalWeight) * 100).toFixed(0)} %</span>
          ))}
        </div>
      </section>
    </>
  );
}

const RANKS = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];
const rank = (r: string) => RANKS.indexOf(r);

function Sparks() {
  // Étincelles projetées dans toutes les directions à l'ouverture
  const sparks = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const d = 120 + (i % 3) * 50;
    return { dx: `${Math.cos(a) * d}px`, dy: `${Math.sin(a) * d}px`, delay: `${(i % 4) * 30}ms` };
  });
  return (
    <div className="sparks" aria-hidden>
      {sparks.map((s, i) => <i key={i} style={{ "--dx": s.dx, "--dy": s.dy, animationDelay: s.delay } as React.CSSProperties} />)}
    </div>
  );
}

function PackEmblem() {
  // Bol stylisé rempli d'ingrédients
  return (
    <svg className="pack-emblem" viewBox="0 0 120 120" aria-hidden>
      <defs>
        <radialGradient id="emb" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#f3b544" stopOpacity=".55" />
          <stop offset="100%" stopColor="#1e1510" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="56" fill="url(#emb)" />
      <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" strokeDasharray="3 5" />
      <circle cx="44" cy="54" r="13" fill="#d4492a" />
      <circle cx="68" cy="47" r="15" fill="#f3b544" />
      <circle cx="80" cy="62" r="10" fill="#8e4fa0" />
      <path d="M57 30c4-8 12-10 16-8-3 6-9 9-16 8z" fill="#96c25e" />
      <path d="M24 62h72c0 18-16 32-36 32S24 80 24 62z" fill="#f4e4c8" />
      <path d="M24 62h72" stroke="#7a5230" strokeWidth="3" strokeLinecap="round" />
      <path d="M42 94h36" stroke="rgba(0,0,0,.3)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
