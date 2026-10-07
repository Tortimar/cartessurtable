"use client";

import { useState } from "react";
import { api, Modal, RarityTag, Thumb, useGame } from "./ui";
import { AUCTION_DURATIONS_MIN, BANK_BUYBACK, bankBuyback, RARITY_LABEL, type Rarity } from "@/lib/game";

export type Sellable = { id: string; name: string; rarity: string; baseValue: number; quantity: number; imageUrl?: string | null };

const DURATION_LABEL: Record<number, string> = { 10: "10 minutes", 60: "1 heure", 360: "6 heures", 1440: "24 heures" };

/** Vente d'un ingrédient (banque, prix fixe ou enchère) ou d'un produit (banque uniquement). */
export function SellModal({ item, kind = "ingredient", onClose, onDone }: { item: Sellable; kind?: "ingredient" | "product"; onClose: () => void; onDone: () => void }) {
  const { run } = useGame();
  const product = kind === "product";
  const [mode, setMode] = useState<"bank" | "fixed" | "auction">(product ? "bank" : "fixed");
  const unit = bankBuyback(item.rarity);
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(Math.max(1, Math.round(item.baseValue * 1.5)));
  const [duration, setDuration] = useState(60);
  const [busy, setBusy] = useState(false);

  const qty = Math.min(Math.max(1, quantity || 1), item.quantity);

  const submit = async () => {
    setBusy(true);
    const ok =
      mode === "bank"
        ? await run(() => api<{ earned: number }>("/api/collection/sell", { body: { ...(product ? { productCode: item.id } : { ingredientId: item.id }), quantity: qty } }), (r) => `+${r.earned} pièces`)
        : mode === "fixed"
          ? await run(() => api("/api/market/listings", { body: { ingredientId: item.id, quantity: qty, unitPrice: price } }), "Annonce publiée sur le marché")
          : await run(() => api("/api/market/auctions", { body: { ingredientId: item.id, quantity: qty, startPrice: price, durationMin: duration } }), "Enchère lancée");
    setBusy(false);
    if (ok !== undefined) { onDone(); onClose(); }
  };

  return (
    <Modal title={product ? `Vendre « ${item.name} » à la banque` : `Vendre « ${item.name} »`} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}><Thumb ing={item} /><div><RarityTag rarity={item.rarity} /><div className="muted" style={{ fontSize: ".88rem" }}>{item.quantity} en stock</div></div></div>
      {!product && (
        <div className="tabs" role="tablist">
          <button className={mode === "fixed" ? "on" : ""} onClick={() => setMode("fixed")}>Prix fixe</button>
          <button className={mode === "auction" ? "on" : ""} onClick={() => setMode("auction")}>Enchère</button>
          <button className={mode === "bank" ? "on" : ""} onClick={() => setMode("bank")}>Banque</button>
        </div>
      )}
      <label className="field">Quantité
        <input className="input" type="number" min={1} max={item.quantity} value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value, 10))} />
      </label>
      {mode === "bank" && (
        <div className="muted" style={{ margin: 0, display: "grid", gap: 6 }}>
          <span>
            Rachat immédiat à <b style={{ color: "var(--gold)" }}>{unit} pièce{unit > 1 ? "s" : ""}</b> par {product ? "produit" : "carte"} ({RARITY_LABEL[item.rarity as Rarity] ?? item.rarity}),
            soit <b style={{ color: "var(--text)" }}>{unit * qty} pièce{unit * qty > 1 ? "s" : ""}</b>.{!product && " Le marché rapporte souvent plus."}
          </span>
          <span className="bank-scale">{(Object.keys(BANK_BUYBACK) as Rarity[]).map((r) => <span key={r} className={r === item.rarity ? "on" : ""}><RarityTag rarity={r} /> {BANK_BUYBACK[r]}</span>)}</span>
        </div>
      )}
      {mode !== "bank" && (
        <label className="field">{mode === "fixed" ? "Prix unitaire" : "Mise de départ (pour le lot)"}
          <input className="input" type="number" min={1} value={price} onChange={(e) => setPrice(Math.max(1, parseInt(e.target.value, 10) || 1))} />
          <span className="hint">Valeur indicative : {item.baseValue} pièces / unité. Les cartes restent bloquées jusqu&apos;à la vente ou l&apos;annulation.</span>
        </label>
      )}
      {mode === "auction" && (
        <label className="field">Durée
          <select className="select" value={duration} onChange={(e) => setDuration(parseInt(e.target.value, 10))}>
            {AUCTION_DURATIONS_MIN.map((d) => <option key={d} value={d}>{DURATION_LABEL[d] ?? `${d} min`}</option>)}
          </select>
          <span className="hint">Une enchère dans la dernière minute prolonge la vente d&apos;une minute.</span>
        </label>
      )}
      <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 0 }}>
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>
          {mode === "bank" ? "Vendre à la banque" : mode === "fixed" ? "Publier l'annonce" : "Lancer l'enchère"}
        </button>
      </div>
    </Modal>
  );
}
