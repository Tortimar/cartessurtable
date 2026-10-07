"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, Avatar, SocialTabs, Modal, RarityTag, Thumb, useGame } from "@/components/ui";
import { CanIcon, CoinIcon } from "@/components/icons";
import { playCraftDone } from "@/lib/sound";

type Card = { id: string; name: string; rarity: string; imageUrl: string | null };
type Item = Card & { kind: "INGREDIENT" | "PRODUCT"; quantity: number };
type Side = { coins: number; items: Item[] };
type Trade = { id: string; status: string; message: string | null; createdAt: string; closedAt: string | null; direction: "in" | "out"; partner: string; give: Side; get: Side };
type Data = { incoming: Trade[]; outgoing: Trade[]; history: Trade[] };
type Friend = { id: string; username: string };
type Inventory = { username: string; coins: number | null; ingredients: (Card & { quantity: number })[]; products: (Card & { quantity: number })[] };

const STATUS: Record<string, string> = { ACCEPTED: "Accepté", DECLINED: "Refusé", CANCELLED: "Annulé" };
const date = (d: string | null) => (d ? new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function TradesPage() {
  const { run, toast, refreshMe } = useGame();
  const [data, setData] = useState<Data | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [composeFor, setComposeFor] = useState<string | null | undefined>(undefined); // undefined = fermé
  const [wanted, setWanted] = useState<string | null>(null); // ingrédient demandé d'avance (?ing=…)

  const load = useCallback(() => api<Data>("/api/trades").then(setData).catch((e: Error) => toast(e.message, "error")), [toast]);
  useEffect(() => {
    load();
    api<{ friends: Friend[] }>("/api/friends").then((r) => setFriends(r.friends)).catch(() => setFriends([]));
    const t = setInterval(load, 20_000);
    // Ouverture directe depuis la page Amis : /echanges?ami=pseudo
    const params = new URLSearchParams(window.location.search);
    const ami = params.get("ami");
    if (ami) { setComposeFor(ami); setWanted(params.get("ing")); }
    return () => clearInterval(t);
  }, [load]);

  const refresh = () => { load(); refreshMe(); };
  const accept = async (t: Trade) => {
    const ok = await run(() => api(`/api/trades/${t.id}/accept`, { method: "POST" }), `Échange avec ${t.partner} conclu !`);
    if (ok !== undefined) playCraftDone();
    refresh();
  };
  const close = async (t: Trade) => {
    await run(() => api(`/api/trades/${t.id}`, { method: "DELETE" }), t.direction === "in" ? "Échange refusé" : "Proposition annulée, tes cartes te sont rendues");
    refresh();
  };

  return (
    <>
      <SocialTabs />
      <div className="page-head">
        <div>
          <h1>Échanges</h1>
          <p>Propose à un ami d&apos;échanger des ingrédients, des produits ou des pièces. Ce que tu offres est mis de côté jusqu&apos;à sa réponse, et te revient s&apos;il refuse ou si tu annules.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setComposeFor(null)} disabled={!friends?.length}>Nouvel échange</button>
      </div>

      {friends && friends.length === 0 && (
        <div className="empty" style={{ marginBottom: 20 }}>Il te faut des amis pour échanger. <Link href="/amis">Ajoute des amis</Link>.</div>
      )}

      <section className="section" style={{ marginTop: 0 }}>
        <h2>Propositions reçues {data && <span className="count">{data.incoming.length}</span>}</h2>
        {data && data.incoming.length === 0 && <div className="muted" style={{ fontSize: ".9rem" }}>Aucune proposition en attente.</div>}
        <div className="trade-list">
          {data?.incoming.map((t) => (
            <TradeCard key={t.id} t={t}>
              <button className="btn btn-primary" onClick={() => accept(t)}>Accepter</button>
              <button className="btn btn-ghost" onClick={() => close(t)}>Refuser</button>
            </TradeCard>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Propositions envoyées {data && <span className="count">{data.outgoing.length}</span>}</h2>
        {data && data.outgoing.length === 0 && <div className="muted" style={{ fontSize: ".9rem" }}>Aucune proposition en attente de réponse.</div>}
        <div className="trade-list">
          {data?.outgoing.map((t) => (
            <TradeCard key={t.id} t={t}>
              <span className="tag">En attente</span>
              <button className="btn btn-ghost" onClick={() => close(t)}>Annuler</button>
            </TradeCard>
          ))}
        </div>
      </section>

      {data && data.history.length > 0 && (
        <section className="section">
          <h2>Historique</h2>
          <div className="trade-list">
            {data.history.map((t) => (
              <TradeCard key={t.id} t={t} compact>
                <span className={`tag ${t.status === "ACCEPTED" ? "me" : ""}`}>{STATUS[t.status] ?? t.status}</span>
              </TradeCard>
            ))}
          </div>
        </section>
      )}

      {composeFor !== undefined && friends && (
        <Composer
          friends={friends}
          initial={composeFor}
          wanted={wanted}
          onClose={() => { setComposeFor(undefined); setWanted(null); }}
          onSent={() => { setComposeFor(undefined); setWanted(null); refresh(); }}
        />
      )}
    </>
  );
}

function SideView({ side, label }: { side: Side; label: string }) {
  const empty = !side.coins && side.items.length === 0;
  return (
    <div className="trade-side">
      <div className="trade-side-label">{label}</div>
      {empty && <span className="muted" style={{ fontSize: ".85rem" }}>Rien</span>}
      <div className="trade-items">
        {side.coins > 0 && <span className="trade-chip coin"><CoinIcon size={18} /> {side.coins.toLocaleString("fr-FR")}</span>}
        {side.items.map((i) => (
          <span key={`${i.kind}:${i.id}`} className={`trade-chip r-${i.rarity}`} title={`${i.name} (${i.kind === "PRODUCT" ? "produit" : "ingrédient"})`}>
            {i.kind === "PRODUCT" ? (i.imageUrl ? <img src={i.imageUrl} alt="" className="trade-pimg" /> : <CanIcon size={18} />) : <Thumb ing={i} small />}
            <span className="trade-chip-name">{i.name}</span> <b>×{i.quantity}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function TradeCard({ t, children, compact }: { t: Trade; children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`trade ${compact ? "compact" : ""}`}>
      <div className="trade-head">
        <Avatar name={t.partner} size={34} />
        <div style={{ minWidth: 0 }}>
          <b>{t.direction === "in" ? `${t.partner} te propose` : `Proposé à ${t.partner}`}</b>
          <div className="muted" style={{ fontSize: ".78rem" }}>{date(t.closedAt ?? t.createdAt)}</div>
        </div>
        <div className="trade-actions">{children}</div>
      </div>
      {t.message && <div className="trade-msg">« {t.message} »</div>}
      <div className="trade-body">
        <SideView side={t.get} label="Tu reçois" />
        <div className="trade-arrow" aria-hidden>⇄</div>
        <SideView side={t.give} label="Tu donnes" />
      </div>
    </div>
  );
}

/* ───────── Composeur d'échange ───────── */

type Pick = Record<string, { item: Card & { kind: Item["kind"] }; quantity: number; max: number }>;

function Composer({ friends, initial, wanted, onClose, onSent }: { friends: Friend[]; initial: string | null; wanted?: string | null; onClose: () => void; onSent: () => void }) {
  const { run, toast } = useGame();
  const [friendId, setFriendId] = useState<string>(() => friends.find((f) => f.username === initial)?.id ?? friends[0]?.id ?? "");
  const [mine, setMine] = useState<Inventory | null>(null);
  const [theirs, setTheirs] = useState<Inventory | null>(null);
  const [offer, setOffer] = useState<Pick>({});
  const [request, setRequest] = useState<Pick>({});
  const [offerCoins, setOfferCoins] = useState(0);
  const [requestCoins, setRequestCoins] = useState(0);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"give" | "get">("give");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<Inventory>("/api/trades/inventory").then(setMine).catch((e: Error) => toast(e.message, "error")); }, [toast]);
  useEffect(() => {
    if (!friendId) return;
    setTheirs(null);
    setRequest({});
    api<Inventory>(`/api/trades/inventory?user=${encodeURIComponent(friendId)}`)
      .then((inv) => {
        setTheirs(inv);
        // Arrivée depuis « Où trouver cet ingrédient ? » : la carte voulue est déjà dans la demande
        const w = wanted && inv.username === initial ? inv.ingredients.find((c) => c.id === wanted) : undefined;
        if (w) {
          setRequest({ [`INGREDIENT:${w.id}`]: { item: { ...w, kind: "INGREDIENT" }, quantity: 1, max: w.quantity } });
          setTab("get");
        }
      })
      .catch((e: Error) => toast(e.message, "error"));
  }, [friendId, toast, wanted, initial]);

  const friend = friends.find((f) => f.id === friendId);
  const toLines = (p: Pick) => Object.values(p).map((x) => ({ kind: x.item.kind, id: x.item.id, quantity: x.quantity }));
  const empty = !offerCoins && !requestCoins && !Object.keys(offer).length && !Object.keys(request).length;

  const submit = async () => {
    setBusy(true);
    const ok = await run(
      () => api("/api/trades", { body: { toUserId: friendId, offer: { coins: offerCoins, items: toLines(offer) }, request: { coins: requestCoins, items: toLines(request) }, message } }),
      `Proposition envoyée à ${friend?.username}`,
    );
    setBusy(false);
    if (ok !== undefined) onSent();
  };

  return (
    <Modal title="Nouvel échange" onClose={onClose} wide>
      <label className="field">Avec
        <select className="select" value={friendId} onChange={(e) => setFriendId(e.target.value)}>
          {friends.map((f) => <option key={f.id} value={f.id}>{f.username}</option>)}
        </select>
      </label>

      <div className="tabs composer-tabs">
        <button className={tab === "give" ? "on" : ""} onClick={() => setTab("give")}>Tu donnes ({Object.keys(offer).length + (offerCoins ? 1 : 0)})</button>
        <button className={tab === "get" ? "on" : ""} onClick={() => setTab("get")}>Tu demandes ({Object.keys(request).length + (requestCoins ? 1 : 0)})</button>
      </div>

      <div className="composer">
        <div className={`composer-col ${tab === "give" ? "on" : ""}`}>
          <h3>Tu donnes</h3>
          <Picker inv={mine} pick={offer} setPick={setOffer} coins={offerCoins} setCoins={setOfferCoins} maxCoins={mine?.coins ?? 0} />
        </div>
        <div className={`composer-col ${tab === "get" ? "on" : ""}`}>
          <h3>Tu demandes à {friend?.username ?? "…"}</h3>
          <Picker inv={theirs} pick={request} setPick={setRequest} coins={requestCoins} setCoins={setRequestCoins} maxCoins={1_000_000} />
        </div>
      </div>

      <label className="field">Message (facultatif)
        <input className="input" maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ex. : il me manque juste ça pour ma pâte à tartiner !" />
      </label>

      <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 0 }}>
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={busy || empty || !friendId} onClick={submit}>Envoyer la proposition</button>
      </div>
    </Modal>
  );
}

function Picker({ inv, pick, setPick, coins, setCoins, maxCoins }: {
  inv: Inventory | null; pick: Pick; setPick: (p: Pick) => void; coins: number; setCoins: (n: number) => void; maxCoins: number;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Item["kind"]>("INGREDIENT");
  const list = useMemo(() => {
    const src = kind === "INGREDIENT" ? inv?.ingredients : inv?.products;
    return (src ?? []).filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  }, [inv, kind, q]);
  const key = (k: Item["kind"], id: string) => `${k}:${id}`;
  const set = (c: Card & { quantity: number }, k: Item["kind"], n: number) => {
    const next = { ...pick };
    if (n <= 0) delete next[key(k, c.id)];
    else next[key(k, c.id)] = { item: { ...c, kind: k }, quantity: Math.min(n, c.quantity), max: c.quantity };
    setPick(next);
  };

  if (!inv) return <div className="muted">Chargement…</div>;
  return (
    <div className="picker">
      <div className="picker-coins">
        <CoinIcon size={18} />
        <input className="input" type="number" min={0} max={maxCoins} value={coins || ""} placeholder="0 pièce" onChange={(e) => setCoins(Math.max(0, Math.min(maxCoins, parseInt(e.target.value, 10) || 0)))} />
        {inv.coins != null && <span className="muted" style={{ fontSize: ".8rem" }}>sur {inv.coins.toLocaleString("fr-FR")}</span>}
      </div>

      {Object.keys(pick).length > 0 && (
        <div className="picker-selected">
          {Object.values(pick).map(({ item, quantity, max }) => (
            <div key={key(item.kind, item.id)} className="picker-row on">
              {item.kind === "PRODUCT" ? <span className="product-img placeholder" style={{ width: 28, height: 28 }}>{item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} /> : <CanIcon size={18} />}</span> : <Thumb ing={item} small />}
              <span className="picker-name">{item.name}</span>
              <div className="stepper">
                <button className="btn" onClick={() => set({ ...item, quantity: max }, item.kind, quantity - 1)} aria-label="Retirer">−</button>
                <span className="num">{quantity}</span>
                <button className="btn" disabled={quantity >= max} onClick={() => set({ ...item, quantity: max }, item.kind, quantity + 1)} aria-label="Ajouter">+</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="picker-filters">
        <div className="tabs">
          <button className={kind === "INGREDIENT" ? "on" : ""} onClick={() => setKind("INGREDIENT")}>Ingrédients ({inv.ingredients.length})</button>
          <button className={kind === "PRODUCT" ? "on" : ""} onClick={() => setKind("PRODUCT")}>Produits ({inv.products.length})</button>
        </div>
        <input className="input" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="picker-list">
        {list.length === 0 && <div className="muted" style={{ fontSize: ".85rem", padding: 8 }}>Rien à proposer ici.</div>}
        {list.map((c) => {
          const chosen = pick[key(kind, c.id)];
          return (
            <button key={c.id} className={`picker-row ${chosen ? "on" : ""}`} onClick={() => set(c, kind, (chosen?.quantity ?? 0) + 1)} disabled={(chosen?.quantity ?? 0) >= c.quantity}>
              {kind === "PRODUCT" ? <span className="product-img placeholder" style={{ width: 28, height: 28 }}>{c.imageUrl ? <img src={c.imageUrl} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} /> : <CanIcon size={18} />}</span> : <Thumb ing={c} small />}
              <span className="picker-name">{c.name} <RarityTag rarity={c.rarity} /></span>
              <span className="muted" style={{ fontSize: ".8rem" }}>×{c.quantity}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
