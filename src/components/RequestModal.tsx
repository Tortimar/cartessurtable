"use client";

// Demande d'achat au marché : on choisit un ingrédient, une quantité et le prix qu'on est prêt à payer.
import { useEffect, useState } from "react";
import { api, Modal, RarityTag, Thumb, useGame } from "./ui";
import { CoinIcon } from "./icons";

export type RequestTarget = { id: string; name: string; rarity: string; imageUrl: string | null; baseValue: number };

export function RequestModal({ initial, myOpen, maxOpen, onClose, onDone }: {
  initial?: RequestTarget | null; myOpen: number; maxOpen: number; onClose: () => void; onDone: () => void;
}) {
  const { me, run } = useGame();
  const [target, setTarget] = useState<RequestTarget | null>(initial ?? null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<RequestTarget[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(initial ? Math.max(1, initial.baseValue) : 10);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target || q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api<{ items: RequestTarget[] }>(`/api/catalog?type=ingredients&sort=name&q=${encodeURIComponent(q.trim())}`).then((r) => setResults(r.items.slice(0, 8))).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q, target]);

  const pick = (t: RequestTarget) => { setTarget(t); setPrice(Math.max(1, t.baseValue)); };
  const qty = Math.min(100, Math.max(1, quantity || 1));
  const total = qty * price;
  const full = myOpen >= maxOpen;
  const short = (me?.coins ?? 0) < total;

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    const ok = await run(
      () => api("/api/market/requests", { body: { ingredientId: target.id, quantity: qty, unitPrice: price } }),
      `Demande publiée : ${qty} × ${target.name} à ${price} pièces`,
    );
    setBusy(false);
    if (ok !== undefined) { onDone(); onClose(); }
  };

  return (
    <Modal title="Faire une demande" onClose={onClose}>
      <p className="muted" style={{ margin: 0, fontSize: ".9rem" }}>
        Indique la carte que tu cherches et le prix que tu es prêt à payer. Les autres joueurs pourront te la vendre directement.
        Le montant est mis de côté et te revient si tu annules.
      </p>

      {target ? (
        <div className="pick-row on">
          <Thumb ing={target} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{target.name}</div>
            <div className="muted" style={{ fontSize: ".8rem" }}><RarityTag rarity={target.rarity} /> · valeur indicative {target.baseValue}</div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => { setTarget(null); setQ(""); }}>Changer</button>
        </div>
      ) : (
        <div className="field">Carte recherchée
          <input className="input" autoFocus placeholder="Nom de l'ingrédient…" value={q} onChange={(e) => setQ(e.target.value)} />
          {results.length > 0 && (
            <div className="picker-list" style={{ maxHeight: 240 }}>
              {results.map((r) => (
                <button key={r.id} type="button" className="picker-row" onClick={() => pick(r)}>
                  <Thumb ing={r} small />
                  <span className="picker-name">{r.name} <RarityTag rarity={r.rarity} /></span>
                  <span className="muted" style={{ fontSize: ".8rem" }}>{r.baseValue}</span>
                </button>
              ))}
            </div>
          )}
          {q.trim().length >= 2 && results.length === 0 && <span className="hint">Aucun ingrédient ne correspond.</span>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="field">Quantité
          <input className="input" type="number" min={1} max={100} value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value, 10))} />
        </label>
        <label className="field">Prix par carte
          <input className="input" type="number" min={1} value={price} onChange={(e) => setPrice(Math.max(1, parseInt(e.target.value, 10) || 1))} />
        </label>
      </div>

      <div className="request-sum">
        <span>Total mis de côté</span>
        <b><CoinIcon size={16} /> {total.toLocaleString("fr-FR")}</b>
        <span className="muted">tu as {(me?.coins ?? 0).toLocaleString("fr-FR")} pièces</span>
      </div>
      {full && <div className="error-text">Tu as déjà {maxOpen} demandes en cours : annule-en une ou attends qu&apos;elles soient remplies.</div>}
      {!full && short && <div className="error-text">Pas assez de pièces pour ce total.</div>}

      <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 0 }}>
        <span className="muted" style={{ fontSize: ".85rem" }}>Demandes en cours : {myOpen}/{maxOpen}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={busy || !target || full || short} onClick={submit}>Publier la demande</button>
        </div>
      </div>
    </Modal>
  );
}
