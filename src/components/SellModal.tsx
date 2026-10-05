"use client";

import { useState } from "react";
import { api, Modal, RarityTag, Thumb, useGame } from "./ui";
import { AUCTION_DURATIONS_MIN, BANK_BUYBACK_PRICE } from "@/lib/game";

export type Sellable = { id: string; name: string; rarity: string; baseValue: number; quantity: number; imageUrl?: string | null };

const DURATION_LABEL: Record<number, string> = { 10: "10 minutes", 60: "1 heure", 360: "6 heures", 1440: "24 heures" };

/** Vente d'un ingrédient : rachat banque, prix fixe ou enchère. */
export function SellModal({ item, onClose, onDone }: { item: Sellable; onClose: () => void; onDone: () => void }) {
  const { run } = useGame();
  const [mode, setMode] = useState<"bank" | "fixed" | "auction">("fixed");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(Math.max(1, Math.round(item.baseValue * 1.5)));
  const [duration, setDuration] = useState(60);
  const [busy, setBusy] = useState(false);

  const qty = Math.min(Math.max(1, quantity || 1), item.quantity);

  const submit = async () => {
    setBusy(true);
    const ok =
      mode === "bank"
        ? await run(() => api<{ earned: number }>("/api/collection/sell", { body: { ingredientId: item.id, quantity: qty } }), (r) => `+${r.earned} pièces`)
        : mode === "fixed"
          ? await run(() => api("/api/market/listings", { body: { ingredientId: item.id, quantity: qty, unitPrice: price } }), "Annonce publiée sur le marché")
          : await run(() => api("/api/market/auctions", { body: { ingredientId: item.id, quantity: qty, startPrice: price, durationMin: duration } }), "Enchère lancée");
    setBusy(false);
    if (ok !== undefined) { onDone(); onClose(); }
  };

  return (
    <Modal title={`Vendre « ${item.name} »`} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}><Thumb ing={item} /><div><RarityTag rarity={item.rarity} /><div className="muted" style={{ fontSize: ".88rem" }}>{item.quantity} en stock</div></div></div>
      <div className="tabs" role="tablist">
        <button className={mode === "fixed" ? "on" : ""} onClick={() => setMode("fixed")}>Prix fixe</button>
        <button className={mode === "auction" ? "on" : ""} onClick={() => setMode("auction")}>Enchère</button>
        <button className={mode === "bank" ? "on" : ""} onClick={() => setMode("bank")}>Banque</button>
      </div>
      <label className="field">Quantité
        <input className="input" type="number" min={1} max={item.quantity} value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value, 10))} />
      </label>
      {mode === "bank" && <p className="muted" style={{ margin: 0 }}>Rachat immédiat à {BANK_BUYBACK_PRICE} pièce par carte, quelle que soit sa rareté, soit <b>{BANK_BUYBACK_PRICE * qty}</b> pièce{BANK_BUYBACK_PRICE * qty > 1 ? "s" : ""}. Le marché rapporte bien plus.</p>}
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
