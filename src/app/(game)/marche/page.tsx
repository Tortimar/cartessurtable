"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtMs, RarityFilter, RarityTag, Thumb, useCountdown, useGame } from "@/components/ui";
import { CoinIcon } from "@/components/icons";
import { BankOffers } from "@/components/BankOffers";

type Listing = { id: string; ingredientId: string; ingredientName: string; rarity: string; baseValue: number; imageUrl: string | null; quantity: number; unitPrice: number; seller: string; mine: boolean };
type Auction = { id: string; ingredientId: string; ingredientName: string; rarity: string; baseValue: number; imageUrl: string | null; quantity: number; startPrice: number; currentBid: number | null; minBid: number; endsAt: string; seller: string; leader: string | null; mine: boolean; leading: boolean };
type Data = { listings: Listing[]; auctions: Auction[] };

export default function MarketPage() {
  const { run, toast } = useGame();
  const [tab, setTab] = useState<"listings" | "auctions">("listings");
  const [onlyMine, setOnlyMine] = useState(false);
  const [q, setQ] = useState("");
  // Recherche pré-remplie quand on arrive depuis une fiche (?q=…)
  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    const v = u.get("q"); if (v) setQ(v);
    if (u.get("tab") === "encheres") setTab("auctions");
  }, []);
  const [rarity, setRarity] = useState("");
  const [data, setData] = useState<Data | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (rarity) p.set("rarity", rarity);
    return api<Data>(`/api/market?${p}`).then(setData).catch((e: Error) => toast(e.message, "error"));
  }, [q, rarity]);

  useEffect(() => {
    const t = setTimeout(load, 250); // petit délai pour la recherche
    const i = setInterval(load, 10_000);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [load]);

  const buy = async (l: Listing) => {
    if (!confirm(`Acheter ${l.quantity} × ${l.ingredientName} pour ${l.quantity * l.unitPrice} pièces ?`)) return;
    await run(() => api(`/api/market/listings/${l.id}`, { method: "POST" }), "Achat effectué");
    load();
  };
  const cancel = async (l: Listing) => {
    await run(() => api(`/api/market/listings/${l.id}`, { method: "DELETE" }), "Annonce retirée, cartes rendues");
    load();
  };

  const listings = data?.listings.filter((l) => !onlyMine || l.mine) ?? [];
  const auctions = data?.auctions.filter((a) => !onlyMine || a.mine || a.leading) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Marché</h1>
          <p>Profite des offres de la banque, achète les ingrédients des autres joueurs ou enchéris sur leurs lots. Pour vendre, passe par ta collection.</p>
        </div>
        <div className="tabs">
          <button className={tab === "listings" ? "on" : ""} onClick={() => setTab("listings")}>Achat immédiat {data && `(${data.listings.length})`}</button>
          <button className={tab === "auctions" ? "on" : ""} onClick={() => setTab("auctions")}>Enchères {data && `(${data.auctions.length})`}</button>
        </div>
      </div>

      <BankOffers />

      <div className="toolbar">
        <input className="input" placeholder="Rechercher un ingrédient…" value={q} onChange={(e) => setQ(e.target.value)} />
        <RarityFilter value={rarity} onChange={setRarity} />
        <label className="pill" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> {tab === "listings" ? "Mes annonces" : "Mes ventes et enchères"}
        </label>
      </div>

      {tab === "listings" && (
        <div className="rows">
          {data && listings.length === 0 && <div className="empty">Aucune annonce pour le moment.</div>}
          {listings.map((l) => (
            <div key={l.id} className="row">
              <Thumb ing={{ id: l.ingredientId, name: l.ingredientName, rarity: l.rarity, imageUrl: l.imageUrl }} />
              <div>
                <div className="row-title">{l.quantity} × {l.ingredientName} <RarityTag rarity={l.rarity} /></div>
                <div className="row-meta">Vendu par {l.mine ? "toi" : l.seller} · {l.unitPrice} pièces / unité (indicatif : {l.baseValue})</div>
              </div>
              <div className="row-side">
                <span className="price"><CoinIcon size={16} style={{ verticalAlign: "-3px" }} /> {(l.quantity * l.unitPrice).toLocaleString("fr-FR")}</span>
                {l.mine ? <button className="btn btn-sm btn-danger" onClick={() => cancel(l)}>Retirer</button> : <button className="btn btn-sm btn-primary" onClick={() => buy(l)}>Acheter</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "auctions" && (
        <div className="rows">
          {data && auctions.length === 0 && <div className="empty">Aucune enchère en cours.</div>}
          {auctions.map((a) => <AuctionRow key={a.id} a={a} onChange={load} />)}
        </div>
      )}
    </>
  );
}

function AuctionRow({ a, onChange }: { a: Auction; onChange: () => void }) {
  const { run } = useGame();
  const [amount, setAmount] = useState(a.minBid);
  const left = useCountdown(new Date(a.endsAt).getTime() - Date.now());
  useEffect(() => setAmount((v) => Math.max(v, a.minBid)), [a.minBid]);

  const bid = async () => {
    await run(() => api(`/api/market/auctions/${a.id}/bid`, { body: { amount } }), `Enchère de ${amount} pièces placée`);
    onChange();
  };

  const ended = left != null && left <= 0;
  return (
    <div className="row">
      <Thumb ing={{ id: a.ingredientId, name: a.ingredientName, rarity: a.rarity, imageUrl: a.imageUrl }} />
      <div>
        <div className="row-title">{a.quantity} × {a.ingredientName} <RarityTag rarity={a.rarity} /></div>
        <div className="row-meta">
          Vendu par {a.mine ? "toi" : a.seller} · {a.currentBid != null ? <>meilleure offre <b>{a.currentBid}</b> par {a.leading ? "toi" : a.leader}</> : <>mise de départ {a.startPrice}</>}
          {" · "}{ended ? "clôture en cours…" : <>fin dans <b>{left != null ? fmtMs(left) : ""}</b></>}
        </div>
      </div>
      <div className="row-side">
        {a.mine ? <span className="muted">Ta vente</span> : a.leading ? <span className="pill" style={{ color: "var(--accent)" }}>Tu es en tête</span> : (
          <>
            <input className="input" type="number" min={a.minBid} value={amount} onChange={(e) => setAmount(parseInt(e.target.value, 10) || a.minBid)} style={{ width: 110 }} aria-label="Montant" />
            <button className="btn btn-sm btn-primary" disabled={ended || amount < a.minBid} onClick={bid}>Enchérir</button>
          </>
        )}
      </div>
    </div>
  );
}
