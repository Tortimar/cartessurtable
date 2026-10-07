"use client";

// « Où trouver cet ingrédient ? » : offres du marché en cours et amis qui possèdent la carte.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, Avatar, RarityTag, Thumb, useGame } from "./ui";
import { CoinIcon } from "./icons";

type Sources = {
  ingredient: { id: string; name: string; rarity: string; imageUrl: string | null; baseValue: number; have: number };
  listings: { id: string; quantity: number; unitPrice: number; seller: string; mine: boolean }[];
  auctions: { id: string; quantity: number; startPrice: number; currentBid: number | null; minBid: number; endsAt: string; seller: string; mine: boolean; leading: boolean }[];
  friends: { id: string; username: string; quantity: number }[];
  friendCount: number;
};

const coins = (n: number) => n.toLocaleString("fr-FR");
function endsIn(d: string) {
  const min = Math.max(0, Math.round((new Date(d).getTime() - Date.now()) / 60_000));
  if (min < 1) return "se termine";
  if (min < 60) return `fin dans ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `fin dans ${h} h ${String(min % 60).padStart(2, "0")}` : `fin dans ${Math.floor(h / 24)} j`;
}

export function IngredientSources({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: () => void }) {
  const { me, run, toast } = useGame();
  const [data, setData] = useState<Sources | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Le panneau s'ouvre sous la recette : on le fait apparaître à l'écran (utile sur téléphone)
  useEffect(() => { box.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [data === null]);

  const load = useCallback(() => {
    return api<Sources>(`/api/catalog/ingredient/${encodeURIComponent(id)}/sources`).then(setData).catch((e: Error) => toast(e.message, "error"));
  }, [id, toast]);
  useEffect(() => { setData(null); load(); }, [load]);

  const buy = async (l: Sources["listings"][number]) => {
    if (!data) return;
    const total = l.quantity * l.unitPrice;
    if (!confirm(`Acheter ${l.quantity} × ${data.ingredient.name} à ${l.seller} pour ${coins(total)} pièces ?`)) return;
    setBusy(l.id);
    const ok = await run(() => api(`/api/market/listings/${l.id}`, { method: "POST" }), `${l.quantity} × ${data.ingredient.name} ajouté${l.quantity > 1 ? "s" : ""} à ta collection`);
    setBusy(null);
    await load();
    if (ok !== undefined) onChanged?.();
  };

  if (!data) return <div className="sources" ref={box}><div className="muted">Recherche des offres…</div></div>;
  const ing = data.ingredient;
  const offers = data.listings.filter((l) => !l.mine);
  const myOffers = data.listings.length - offers.length;

  return (
    <div className="sources" aria-live="polite" ref={box}>
      <div className="sources-head">
        <Thumb ing={ing} />
        <div style={{ minWidth: 0 }}>
          <div className="sources-title">Où trouver « {ing.name} » ?</div>
          <div className="muted" style={{ fontSize: ".82rem" }}><RarityTag rarity={ing.rarity} /> · tu en as {ing.have} · valeur indicative {ing.baseValue}</div>
        </div>
        <button className="btn btn-ghost btn-sm sources-close" onClick={onClose} aria-label="Fermer">✕</button>
      </div>

      <div className="sources-cols">
        <section>
          <h4>Sur le marché</h4>
          {offers.length === 0 && data.auctions.length === 0 && (
            <p className="muted sources-empty">
              Aucune offre en ce moment{myOffers ? " (à part la tienne)" : ""}. Repasse plus tard ou demande à un ami.
            </p>
          )}
          <div className="sources-list">
            {offers.map((l) => {
              const total = l.quantity * l.unitPrice;
              const short = (me?.coins ?? 0) < total;
              return (
                <div key={l.id} className="source-row">
                  <div className="source-main">
                    <span><b>{l.quantity} ×</b> par {l.seller}</span>
                    <span className="muted">{coins(l.unitPrice)} / carte</span>
                  </div>
                  <button className="btn btn-sm btn-primary" disabled={short || busy === l.id} onClick={() => buy(l)} title={short ? "Pas assez de pièces" : undefined}>
                    <CoinIcon size={15} /> {coins(total)}
                  </button>
                </div>
              );
            })}
            {data.auctions.map((a) => (
              <div key={a.id} className="source-row">
                <div className="source-main">
                  <span><b>{a.quantity} ×</b> aux enchères par {a.mine ? "toi" : a.seller}</span>
                  <span className="muted">
                    {a.currentBid != null ? `offre à ${coins(a.currentBid)}` : `mise à prix ${coins(a.startPrice)}`} · {endsIn(a.endsAt)}
                    {a.leading && " · tu es en tête"}
                  </span>
                </div>
                {!a.mine && (
                  <Link className="btn btn-sm" href={`/marche?tab=encheres&q=${encodeURIComponent(ing.name)}`}>Enchérir</Link>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h4>Chez tes amis</h4>
          {data.friendCount === 0 ? (
            <p className="muted sources-empty">Tu n&apos;as pas encore d&apos;amis. <Link href="/amis" style={{ color: "var(--accent)" }}>Ajoute des joueurs</Link> pour voir leurs cartes et leur proposer des échanges.</p>
          ) : data.friends.length === 0 ? (
            <p className="muted sources-empty">Aucun de tes amis n&apos;a cette carte pour l&apos;instant.</p>
          ) : (
            <div className="sources-list">
              {data.friends.map((f) => (
                <div key={f.id} className="source-row">
                  <div className="source-main source-friend">
                    <Avatar name={f.username} size={28} />
                    <span><b>{f.username}</b> en a {f.quantity}</span>
                  </div>
                  <Link className="btn btn-sm" href={`/echanges?ami=${encodeURIComponent(f.username)}&ing=${encodeURIComponent(ing.id)}`}>Proposer un échange</Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
