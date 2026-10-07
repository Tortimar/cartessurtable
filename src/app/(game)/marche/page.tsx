"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtMs, RarityFilter, RarityTag, Thumb, useCountdown, useGame } from "@/components/ui";
import { CoinIcon } from "@/components/icons";
import { BankOffers } from "@/components/BankOffers";
import { ChefQuests } from "@/components/ChefQuests";
import { RequestModal } from "@/components/RequestModal";

type Listing = { id: string; ingredientId: string; ingredientName: string; rarity: string; baseValue: number; imageUrl: string | null; quantity: number; unitPrice: number; seller: string; mine: boolean };
type Auction = { id: string; ingredientId: string; ingredientName: string; rarity: string; baseValue: number; imageUrl: string | null; quantity: number; startPrice: number; currentBid: number | null; minBid: number; endsAt: string; seller: string; leader: string | null; mine: boolean; leading: boolean };
type BuyRequest = { id: string; ingredientId: string; ingredientName: string; rarity: string; baseValue: number; imageUrl: string | null; quantity: number; filled: number; unitPrice: number; requester: string; mine: boolean; have: number };
type Data = { listings: Listing[]; auctions: Auction[]; requests: BuyRequest[]; myOpen: number; maxOpen: number };

// Nombre affiché dans l'onglet seulement s'il y a quelque chose (onglets plus courts sur téléphone)
const count = (n?: number) => (n ? ` (${n})` : "");

export default function MarketPage() {
  const { run, toast } = useGame();
  const [tab, setTab] = useState<"listings" | "auctions" | "requests">("listings");
  const [asking, setAsking] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [q, setQ] = useState("");
  // Recherche pré-remplie quand on arrive depuis une fiche (?q=…)
  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    const v = u.get("q"); if (v) setQ(v);
    if (u.get("tab") === "encheres") setTab("auctions");
    if (u.get("tab") === "demandes") setTab("requests");
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

  const requests = data?.requests.filter((r) => !onlyMine || r.mine) ?? [];
  const listings = data?.listings.filter((l) => !onlyMine || l.mine) ?? [];
  const auctions = data?.auctions.filter((a) => !onlyMine || a.mine || a.leading) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Marché</h1>
          <p>Livre au Chef sa commande du jour, profite des offres de la banque, achète les ingrédients des autres joueurs ou enchéris sur leurs lots. Pour vendre, passe par ta collection.</p>
        </div>
        <div className="tabs">
          <button className={tab === "listings" ? "on" : ""} onClick={() => setTab("listings")}>Achat direct{count(data?.listings.length)}</button>
          <button className={tab === "auctions" ? "on" : ""} onClick={() => setTab("auctions")}>Enchères{count(data?.auctions.length)}</button>
          <button className={tab === "requests" ? "on" : ""} onClick={() => setTab("requests")}>Demandes{count(data?.requests.length)}</button>
        </div>
      </div>

      <ChefQuests />
      <BankOffers />

      <div className="toolbar">
        <input className="input" placeholder="Rechercher un ingrédient…" value={q} onChange={(e) => setQ(e.target.value)} />
        <RarityFilter value={rarity} onChange={setRarity} />
        <label className="pill" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> {tab === "listings" ? "Mes annonces" : tab === "auctions" ? "Mes ventes et enchères" : "Mes demandes"}
        </label>
        <button className="btn btn-request" onClick={() => setAsking(true)} disabled={!data} title="Propose un prix pour une carte que tu cherches">
          Faire une demande {data && <span className="count">{data.myOpen}/{data.maxOpen}</span>}
        </button>
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

      {tab === "requests" && (
        <>
          <p className="muted" style={{ margin: "-6px 0 12px", fontSize: ".88rem" }}>
            Les joueurs y indiquent les cartes qu&apos;ils cherchent et le prix qu&apos;ils paient. Si tu en as, vends-les directement : les pièces sont déjà réservées.
          </p>
          <div className="rows">
            {data && requests.length === 0 && <div className="empty">Aucune demande pour le moment. <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setAsking(true)}>Faire une demande</button></div>}
            {requests.map((r) => <RequestRow key={r.id} r={r} onChange={load} />)}
          </div>
        </>
      )}

      {asking && data && <RequestModal myOpen={data.myOpen} maxOpen={data.maxOpen} onClose={() => setAsking(false)} onDone={() => { setTab("requests"); load(); }} />}

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

function RequestRow({ r, onChange }: { r: BuyRequest; onChange: () => void }) {
  const { run } = useGame();
  const remaining = r.quantity - r.filled;
  const max = Math.min(r.have, remaining);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const n = Math.min(Math.max(1, qty), Math.max(1, max));

  const sell = async () => {
    if (!confirm(`Vendre ${n} × ${r.ingredientName} à ${r.requester} pour ${n * r.unitPrice} pièces ?`)) return;
    setBusy(true);
    await run(() => api<{ earned: number }>(`/api/market/requests/${r.id}`, { body: { quantity: n } }), (x) => `+${x.earned} pièces : ${n} × ${r.ingredientName} livré${n > 1 ? "s" : ""} à ${r.requester}`);
    setBusy(false);
    setQty(1);
    onChange();
  };
  const cancel = async () => {
    setBusy(true);
    await run(() => api<{ refund: number }>(`/api/market/requests/${r.id}`, { method: "DELETE" }), (x) => `Demande annulée, ${x.refund} pièces te reviennent`);
    setBusy(false);
    onChange();
  };

  return (
    <div className={`row ${r.mine ? "row-mine" : ""}`}>
      <Thumb ing={{ id: r.ingredientId, name: r.ingredientName, rarity: r.rarity, imageUrl: r.imageUrl }} />
      <div>
        <div className="row-title">{remaining} × {r.ingredientName} <RarityTag rarity={r.rarity} /></div>
        <div className="row-meta">
          Demandé par {r.mine ? "toi" : r.requester} · <b className="price">{r.unitPrice}</b> pièces / carte (indicatif : {r.baseValue})
          {r.filled > 0 && <> · {r.filled}/{r.quantity} déjà reçue{r.filled > 1 ? "s" : ""}</>}
          {!r.mine && <> · tu en as {r.have}</>}
        </div>
      </div>
      <div className="row-side">
        {r.mine ? (
          <button className="btn btn-sm btn-danger" disabled={busy} onClick={cancel}>Annuler</button>
        ) : max > 0 ? (
          <>
            {max > 1 && (
              <div className="stepper">
                <button className="btn" disabled={n <= 1} onClick={() => setQty(n - 1)} aria-label="Moins">−</button>
                <span className="num">{n}</span>
                <button className="btn" disabled={n >= max} onClick={() => setQty(n + 1)} aria-label="Plus">+</button>
              </div>
            )}
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={sell}>Vendre · <CoinIcon size={14} /> {n * r.unitPrice}</button>
          </>
        ) : (
          <span className="muted" style={{ fontSize: ".85rem" }}>Tu n&apos;en as pas</span>
        )}
      </div>
    </div>
  );
}
