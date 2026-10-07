"use client";

// Offres de la banque : 5 produits à prix cassé, renouvelés toutes les heures.
import { useCallback, useEffect, useState } from "react";
import { api, fmtMs, GameCard, Modal, RarityBadge, useCountdown, useGame } from "./ui";
import { IngredientSources } from "./IngredientSources";
import { CanIcon, CoinIcon } from "./icons";
import { playCraftDone } from "@/lib/sound";

type Offer = { id: string; slot: number; discount: number; price: number; code: string; name: string; brand: string | null; rarity: string; imageUrl: string | null; owned: number; bought: boolean };
type Data = { offers: Offer[]; basePrice: number; renewsInMs: number };

export function BankOffers() {
  const { me, run, toast } = useGame();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // offre dont on affiche la recette
  const load = useCallback(() => api<Data>("/api/market/bank").then(setData).catch((e: Error) => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); }, [load]);
  const left = useCountdown(data?.renewsInMs ?? null);
  // Renouvellement à l'heure pile
  useEffect(() => { if (left === 0) { const t = setTimeout(load, 1500); return () => clearTimeout(t); } }, [left, load]);

  const buy = async (o: Offer) => {
    if (!confirm(`Acheter « ${o.name} » à la banque pour ${o.price} pièces ?`)) return false;
    setBusy(o.id);
    const ok = await run(() => api(`/api/market/bank/${o.id}`, { method: "POST" }), `« ${o.name} » ajouté à tes produits`);
    setBusy(null);
    if (ok !== undefined) playCraftDone();
    load();
    return ok !== undefined;
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
              <GameCard kind="product" ing={{ id: o.code, name: o.name, rarity: o.rarity, imageUrl: o.imageUrl }} qty={o.owned || undefined} subtitle={o.brand ?? "Voir la recette"} onClick={() => setOpen(o.id)} />
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
      {open && data && (() => {
        const o = data.offers.find((x) => x.id === open);
        return o ? <OfferRecipe offer={o} basePrice={data.basePrice} canAfford={(me?.coins ?? 0) >= o.price} busy={busy === o.id} onBuy={() => buy(o)} onClose={() => setOpen(null)} /> : null;
      })()}
    </section>
  );
}

type RecipeIng = { id: string; name: string; rarity: string; imageUrl: string | null; have: number };

/** Recette du produit en promotion : ingrédients utilisés et ceux que l'on possède déjà. */
function OfferRecipe({ offer: o, basePrice, canAfford, busy, onBuy, onClose }: {
  offer: Offer; basePrice: number; canAfford: boolean; busy: boolean; onBuy: () => Promise<boolean>; onClose: () => void;
}) {
  const { toast } = useGame();
  const [ings, setIngs] = useState<RecipeIng[] | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const load = useCallback(
    () => api<{ ingredients: RecipeIng[] }>(`/api/catalog/product/${encodeURIComponent(o.code)}`).then((r) => setIngs(r.ingredients)).catch((e: Error) => toast(e.message, "error")),
    [o.code, toast],
  );
  useEffect(() => { load(); }, [load]);
  const owned = ings?.filter((i) => i.have > 0).length ?? 0;

  return (
    <Modal title={o.name} onClose={onClose} wide>
      <div className="modal-head">
        {o.imageUrl ? <img className="product-img" src={o.imageUrl} alt="" /> : <div className="product-img placeholder"><CanIcon size={34} /></div>}
        <div style={{ minWidth: 0 }}>
          <div className="muted" style={{ fontSize: ".9rem" }}>{o.brand ?? "Marque inconnue"}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
            <RarityBadge rarity={o.rarity} />
            <span className="pill">Possédé ×{o.owned}</span>
            {ings && <span className="pill">{owned}/{ings.length} ingrédients possédés</span>}
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: 4 }}>Ingrédients utilisés</h3>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: ".85rem" }}>Ce produit se fabrique avec ces cartes. Touche un ingrédient pour voir où le trouver.</p>
        {!ings ? <div className="muted">Chargement…</div> : (
          <div className="mini-grid">
            {ings.map((i) => (
              <button key={i.id} type="button" className={`mini-pick ${i.have < 1 ? "mini-missing" : ""} ${focus === i.id ? "on" : ""}`} aria-pressed={focus === i.id} onClick={() => setFocus(focus === i.id ? null : i.id)}>
                <GameCard ing={i} qty={i.have} />
              </button>
            ))}
          </div>
        )}
      </div>
      {focus && <IngredientSources key={focus} id={focus} onClose={() => setFocus(null)} onChanged={load} />}

      <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 0 }}>
        <div className="bank-price" style={{ justifyContent: "flex-start" }}>
          {o.discount > 0 && <><span className="promo-inline">−{o.discount}%</span><s>{basePrice}</s></>}
          <b><CoinIcon size={15} /> {o.price}</b>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
          {o.bought
            ? <button className="btn" disabled>Acheté ✓</button>
            : <button className="btn btn-primary" disabled={!canAfford || busy} onClick={async () => { if (await onBuy()) onClose(); }}>Acheter à la banque</button>}
        </div>
      </div>
    </Modal>
  );
}
