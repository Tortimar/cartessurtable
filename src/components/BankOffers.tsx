"use client";

// Offres de la banque : 5 produits à prix cassé, renouvelés toutes les heures.
import { useCallback, useEffect, useState } from "react";
import { api, fmtMs, GameCard, useCountdown, useGame } from "./ui";
import { CoinIcon } from "./icons";
import { playCraftDone } from "@/lib/sound";

type Offer = { id: string; slot: number; discount: number; price: number; code: string; name: string; brand: string | null; rarity: string; imageUrl: string | null; owned: number; bought: boolean };
type Data = { offers: Offer[]; basePrice: number; renewsInMs: number };

export function BankOffers() {
  const { me, run, toast } = useGame();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api<Data>("/api/market/bank").then(setData).catch((e: Error) => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); }, [load]);
  const left = useCountdown(data?.renewsInMs ?? null);
  // Renouvellement à l'heure pile
  useEffect(() => { if (left === 0) { const t = setTimeout(load, 1500); return () => clearTimeout(t); } }, [left, load]);

  const buy = async (o: Offer) => {
    if (!confirm(`Acheter « ${o.name} » à la banque pour ${o.price} pièces ?`)) return;
    setBusy(o.id);
    const ok = await run(() => api(`/api/market/bank/${o.id}`, { method: "POST" }), `« ${o.name} » ajouté à tes produits`);
    setBusy(null);
    if (ok !== undefined) playCraftDone();
    load();
  };

  if (data && data.offers.length === 0) return null;
  return (
    <section className="bank">
      <div className="bank-head">
        <div>
          <h2>Offres de la banque</h2>
          <p className="muted">Des produits à {data?.basePrice ?? 500} pièces, avec jusqu&apos;à 80 % de réduction. Une seule fois par offre.</p>
        </div>
        <span className="pill bank-timer" title="Les offres changent toutes les heures">Nouvelles offres dans <b className="num">{left != null ? fmtMs(left) : "…"}</b></span>
      </div>
      <div className="bank-strip">
        {!data && <div className="muted">Chargement…</div>}
        {data?.offers.map((o) => {
          const short = (me?.coins ?? 0) < o.price;
          return (
            <div key={o.id} className={`bank-offer ${o.bought ? "sold" : ""}`}>
              {o.discount > 0 && <span className="promo" aria-label={`Réduction de ${o.discount} %`}>−{o.discount}%</span>}
              <GameCard kind="product" ing={{ id: o.code, name: o.name, rarity: o.rarity, imageUrl: o.imageUrl }} qty={o.owned || undefined} subtitle={o.brand ?? undefined} />
              <div className="bank-price">
                {o.discount > 0 && <s>{data.basePrice}</s>}
                <b><CoinIcon size={15} /> {o.price}</b>
              </div>
              {o.bought
                ? <button className="btn btn-sm" disabled>Acheté ✓</button>
                : <button className="btn btn-sm btn-primary" disabled={short || busy === o.id} title={short ? "Pas assez de pièces" : undefined} onClick={() => buy(o)}>Acheter</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
