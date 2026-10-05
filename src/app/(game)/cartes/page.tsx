"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, GameCard, Modal, RarityBadge, RarityFilter, useGame } from "@/components/ui";
import { CanIcon } from "@/components/icons";

type Ing = { id: string; name: string; rarity: string; imageUrl: string | null; popularity: number; baseValue: number; owned: number; usedIn: number };
type Prod = { code: string; name: string; brand: string | null; rarity: string; imageUrl: string | null; popularity: number; owned: number; ingredientCount: number; missing: number };
type Page<T> = { items: T[]; hasMore: boolean; matching: number; total: number; discovered: number };
type Selected = { kind: "ingredient"; id: string } | { kind: "product"; code: string };

const fmt = (n: number) => n.toLocaleString("fr-FR");

export default function CardsPage() {
  const { toast } = useGame();
  const [type, setType] = useState<"ingredients" | "products">("ingredients");
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState("");
  const [owned, setOwned] = useState<"all" | "owned" | "missing">("all");
  const [sort, setSort] = useState<"rarity" | "name" | "popularity">("rarity");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Ing | Prod> | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async (p: number) => {
    const id = ++reqId.current;
    setLoading(true);
    const params = new URLSearchParams({ type, owned, sort, page: String(p) });
    if (q.trim()) params.set("q", q.trim());
    if (rarity) params.set("rarity", rarity);
    try {
      const res = await api<Page<Ing | Prod>>(`/api/catalog?${params}`);
      if (id !== reqId.current) return; // une recherche plus récente est en cours
      setData((prev) => (p > 1 && prev ? { ...res, items: [...prev.items, ...res.items] } : res));
      setPage(p);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [type, q, rarity, owned, sort, toast]);

  // Nouvelle recherche dès qu'un filtre change (petit délai pendant la frappe)
  useEffect(() => { const t = setTimeout(() => load(1), 250); return () => clearTimeout(t); }, [load]);

  const switchType = (t: typeof type) => { if (t !== type) { setData(null); setType(t); } };
  const pct = data && data.total ? Math.round((data.discovered / data.total) * 100) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Toutes les cartes</h1>
          <p className="hide-mobile">Le catalogue complet du jeu. Les cartes en couleur sont dans ta collection, les grisées te manquent encore. Touche une carte pour voir sa fiche.</p>
        </div>
        <div className="tabs">
          <button className={type === "ingredients" ? "on" : ""} onClick={() => switchType("ingredients")}>Ingrédients</button>
          <button className={type === "products" ? "on" : ""} onClick={() => switchType("products")}>Produits</button>
        </div>
      </div>

      {data && (
        <div className="discover">
          <div className="discover-text">
            <b>{fmt(data.discovered)}</b> / {fmt(data.total)} {type === "ingredients" ? "ingrédients découverts" : "produits fabriqués"}
            <span className="muted"> · {pct} %</span>
          </div>
          <div className="progress"><span style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      <div className="toolbar">
        <input className="input" placeholder={type === "ingredients" ? "Rechercher un ingrédient…" : "Rechercher un produit ou une marque…"} value={q} onChange={(e) => setQ(e.target.value)} />
        <RarityFilter value={rarity} onChange={setRarity} />
        <select className="select" value={owned} onChange={(e) => setOwned(e.target.value as typeof owned)} aria-label="Possession">
          <option value="all">Toutes les cartes</option>
          <option value="owned">{type === "ingredients" ? "Possédées" : "Fabriqués"}</option>
          <option value="missing">Manquantes</option>
        </select>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Tri">
          <option value="rarity">Plus rares d&apos;abord</option>
          <option value="popularity">Plus scannés d&apos;abord</option>
          <option value="name">Ordre alphabétique</option>
        </select>
      </div>

      {data && <div className="muted" style={{ fontSize: ".85rem", marginBottom: 12 }}>{fmt(data.matching)} carte{data.matching > 1 ? "s" : ""}</div>}
      {data && data.items.length === 0 && <div className="empty">Aucune carte ne correspond à ces critères.</div>}

      <div className="grid">
        {data?.items.map((it) =>
          type === "ingredients" ? (
            <IngTile key={(it as Ing).id} i={it as Ing} onOpen={() => setSelected({ kind: "ingredient", id: (it as Ing).id })} />
          ) : (
            <ProdTile key={(it as Prod).code} p={it as Prod} onOpen={() => setSelected({ kind: "product", code: (it as Prod).code })} />
          ),
        )}
      </div>

      {data?.hasMore && (
        <div className="toolbar" style={{ justifyContent: "center", marginTop: 20 }}>
          <button className="btn" disabled={loading} onClick={() => load(page + 1)}>{loading ? "Chargement…" : `Voir plus (${fmt(data.matching - data.items.length)} restantes)`}</button>
        </div>
      )}

      {selected && <CardSheet selected={selected} onNavigate={setSelected} onClose={() => setSelected(null)} />}
    </>
  );
}

function IngTile({ i, onOpen }: { i: Ing; onOpen: () => void }) {
  return (
    <div className={i.owned ? "" : "unowned"}>
      <GameCard ing={i} qty={i.owned || undefined} onClick={onOpen} subtitle={`Dans ${i.usedIn} produit${i.usedIn > 1 ? "s" : ""}`} />
    </div>
  );
}

function ProdTile({ p, onOpen }: { p: Prod; onOpen: () => void }) {
  return (
    <div className={p.owned ? "" : "unowned"}>
      <GameCard
        kind="product"
        ing={{ id: p.code, name: p.name, rarity: p.rarity, imageUrl: p.imageUrl }}
        qty={p.owned || undefined}
        onClick={onOpen}
        subtitle={p.missing === 0 ? <span style={{ color: "var(--accent)" }}>Fabricable</span> : `${p.ingredientCount - p.missing}/${p.ingredientCount} ingrédients`}
      />
    </div>
  );
}

/* ───────── Fiches détail ───────── */

type IngCard = {
  ingredient: Ing & { owned: number };
  products: { code: string; name: string; brand: string | null; rarity: string; imageUrl: string | null; missing: number; total: number }[];
  onMarket: number;
  factories: number;
};
type ProdCard = {
  product: Omit<Prod, "ingredientCount" | "missing">;
  ingredients: { id: string; name: string; rarity: string; imageUrl: string | null; have: number }[];
};

function CardSheet({ selected, onNavigate, onClose }: { selected: Selected; onNavigate: (s: Selected) => void; onClose: () => void }) {
  const { toast } = useGame();
  const [ing, setIng] = useState<IngCard | null>(null);
  const [prod, setProd] = useState<ProdCard | null>(null);
  const key = selected.kind === "ingredient" ? selected.id : selected.code;

  useEffect(() => {
    setIng(null);
    setProd(null);
    const url = selected.kind === "ingredient" ? `/api/catalog/ingredient/${encodeURIComponent(selected.id)}` : `/api/catalog/product/${encodeURIComponent(selected.code)}`;
    api<IngCard | ProdCard>(url)
      .then((r) => (selected.kind === "ingredient" ? setIng(r as IngCard) : setProd(r as ProdCard)))
      .catch((e: Error) => toast(e.message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (selected.kind === "ingredient") {
    const d = ing;
    return (
      <Modal title={d?.ingredient.name ?? "Ingrédient"} onClose={onClose} wide>
        {!d ? <div className="muted">Chargement…</div> : (
          <>
            <div className="sheet-top">
              <div className={`sheet-card ${d.ingredient.owned ? "" : "unowned"}`}><GameCard ing={d.ingredient} qty={d.ingredient.owned || undefined} /></div>
              <div className="sheet-info">
                <RarityBadge rarity={d.ingredient.rarity} />
                <dl className="facts">
                  <div><dt>Dans ta collection</dt><dd>{d.ingredient.owned ? `×${d.ingredient.owned}` : "Pas encore"}</dd></div>
                  <div><dt>Popularité</dt><dd>{fmt(d.ingredient.popularity)} scans</dd></div>
                  <div><dt>Valeur indicative</dt><dd>{d.ingredient.baseValue} pièces</dd></div>
                  <div><dt>Sur le marché</dt><dd>{d.onMarket ? `${d.onMarket} en vente` : "Aucune offre"}</dd></div>
                  <div><dt>Tes usines</dt><dd>{d.factories || "Aucune"}</dd></div>
                </dl>
                <div className="sheet-actions">
                  <Link className="btn btn-sm" href={`/marche?q=${encodeURIComponent(d.ingredient.name)}`}>Chercher au marché</Link>
                  {d.ingredient.owned > 0 && <Link className="btn btn-sm" href="/collection">Vendre</Link>}
                </div>
                <div className="muted" style={{ fontSize: ".75rem" }}>Identifiant :{d.ingredient.id}</div>
              </div>
            </div>
            <div>
              <h3 style={{ marginBottom: 8 }}>Utilisé dans {d.products.length}{d.products.length === 60 ? "+" : ""} produit{d.products.length > 1 ? "s" : ""}</h3>
              <div className="sheet-list">
                {d.products.map((p) => (
                  <button key={p.code} className="sheet-row" onClick={() => onNavigate({ kind: "product", code: p.code })}>
                    {p.imageUrl ? <img className="product-img" src={p.imageUrl} alt="" /> : <span className="product-img placeholder"><CanIcon size={22} /></span>}
                    <span className="sheet-row-main">
                      <b>{p.name}</b>
                      <span className="muted">{p.brand ?? "—"}</span>
                    </span>
                    <span className={p.missing === 0 ? "tag me" : "tag"}>{p.missing === 0 ? "Fabricable" : `${p.total - p.missing}/${p.total}`}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </Modal>
    );
  }

  const d = prod;
  const missing = d?.ingredients.filter((i) => i.have < 1) ?? [];
  return (
    <Modal title={d?.product.name ?? "Produit"} onClose={onClose} wide>
      {!d ? <div className="muted">Chargement…</div> : (
        <>
          <div className="sheet-top">
            <div className={`sheet-card ${d.product.owned ? "" : "unowned"}`}>
              <GameCard kind="product" ing={{ id: d.product.code, name: d.product.name, rarity: d.product.rarity, imageUrl: d.product.imageUrl }} qty={d.product.owned || undefined} subtitle={d.product.brand ?? undefined} />
            </div>
            <div className="sheet-info">
              <RarityBadge rarity={d.product.rarity} />
              <dl className="facts">
                <div><dt>Fabriqué</dt><dd>{d.product.owned ? `×${d.product.owned}` : "Jamais"}</dd></div>
                <div><dt>Popularité</dt><dd>{fmt(d.product.popularity)} scans</dd></div>
                <div><dt>Recette</dt><dd>{d.ingredients.length - missing.length}/{d.ingredients.length} ingrédients possédés</dd></div>
                <div><dt>Code-barres</dt><dd>{d.product.code}</dd></div>
              </dl>
              <div className="sheet-actions">
                {missing.length === 0
                  ? <Link className="btn btn-sm btn-primary" href={`/produits?q=${encodeURIComponent(d.product.name)}`}>Fabriquer</Link>
                  : <span className="muted" style={{ fontSize: ".85rem" }}>Il manque {missing.length} ingrédient{missing.length > 1 ? "s" : ""}.</span>}
              </div>
            </div>
          </div>
          <div>
            <h3 style={{ marginBottom: 8 }}>Recette</h3>
            <div className="mini-grid">
              {d.ingredients.map((i) => (
                <div key={i.id} className={i.have < 1 ? "mini-missing" : ""}>
                  <GameCard ing={i} qty={i.have} onClick={() => onNavigate({ kind: "ingredient", id: i.id })} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
