"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, GameCard, Modal, RarityBadge, RarityTag, Thumb, useGame } from "@/components/ui";
import { CanIcon } from "@/components/icons";
import { Assembly } from "@/components/Assembly";

type Ing = { id: string; name: string; rarity: string; imageUrl: string | null; have: number };
type Product = { code: string; name: string; brand: string | null; imageUrl: string | null; rarity: string; popularity: number; missing: number; total: number; owned: number; ingredients: Ing[] };
type Data = { products: Product[]; hasMore: boolean };

const productCard = (p: Product) => ({ id: p.code, name: p.name, rarity: p.rarity, imageUrl: p.imageUrl });
const maxCraftable = (p: Product) => (p.ingredients.length ? Math.min(...p.ingredients.map((i) => i.have)) : 0);

export default function ProductsPage() {
  const { run, toast } = useGame();
  const [q, setQ] = useState("");
  // Recherche pré-remplie quand on arrive depuis une fiche (?q=…)
  useEffect(() => { const v = new URLSearchParams(window.location.search).get("q"); if (v) setQ(v); }, []);
  const [filter, setFilter] = useState<"" | "craftable" | "owned">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [crafted, setCrafted] = useState<{ product: Product; quantity: number } | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page) });
    if (q) p.set("q", q);
    if (filter) p.set("filter", filter);
    return api<Data>(`/api/products?${p}`).then(setData).catch((e: Error) => toast(e.message, "error"));
  }, [q, filter, page, toast]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => setPage(1), [q, filter]);

  const craft = async (p: Product, quantity: number) => {
    const ok = await run(() => api(`/api/products/${encodeURIComponent(p.code)}/craft`, { body: { quantity } }));
    if (ok === undefined) return;
    setSelected(null);
    setCrafted({ product: p, quantity });
    load();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Produits</h1>
          <p>Chaque produit se fabrique en consommant une carte de chacun de ses ingrédients. Clique sur un produit pour voir le détail et choisir combien en fabriquer.</p>
        </div>
      </div>

      <div className="toolbar">
        <input className="input" placeholder="Rechercher un produit…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="tabs">
          <button className={filter === "" ? "on" : ""} onClick={() => setFilter("")}>Tous</button>
          <button className={filter === "craftable" ? "on" : ""} onClick={() => setFilter("craftable")}>Fabricables</button>
          <button className={filter === "owned" ? "on" : ""} onClick={() => setFilter("owned")}>Possédés</button>
        </div>
      </div>

      {data && data.products.length === 0 && <div className="empty">{filter === "craftable" ? "Aucun produit fabricable pour l'instant — ouvre des boosters ou passe au marché." : "Aucun produit trouvé."}</div>}

      <div className="grid-wide">
        {data?.products.map((p) => {
          const have = p.total - p.missing;
          return (
            <div key={p.code} className="product clickable" onClick={() => setSelected(p)} role="button" aria-label={`Détail de ${p.name}`}>
              <div className="product-top">
                {p.imageUrl ? <img className="product-img" src={p.imageUrl} alt="" loading="lazy" /> : <div className="product-img placeholder"><CanIcon size={34} /></div>}
                <div style={{ minWidth: 0 }}>
                  <div className="product-name">{p.name}</div>
                  <div className="muted" style={{ fontSize: ".85rem" }}>{p.brand}{p.owned > 0 && <> · possédé ×{p.owned}</>}</div>
                  <RarityTag rarity={p.rarity} />
                </div>
              </div>
              <div className="product-ings">
                {p.ingredients.map((i) => (
                  <span key={i.id} className={`chip r-${i.rarity} ${i.have < 1 ? "missing" : ""}`} title={`${i.name} — ${i.have} en stock`}><Thumb ing={i} small />{i.name}</span>
                ))}
              </div>
              <div className="product-foot">
                <div className="progress" aria-label={`${have} sur ${p.total} ingrédients`}><span style={{ width: `${(have / p.total) * 100}%` }} /></div>
                <span className="muted" style={{ fontSize: ".85rem", fontWeight: 700 }}>{have}/{p.total}</span>
                <button className="btn btn-sm btn-primary" disabled={p.missing > 0} onClick={(e) => { e.stopPropagation(); craft(p, 1); }}>Fabriquer</button>
              </div>
            </div>
          );
        })}
      </div>

      {data && (page > 1 || data.hasMore) && (
        <div className="toolbar" style={{ justifyContent: "center", marginTop: 20 }}>
          <button className="btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Précédent</button>
          <span className="muted">Page {page}</span>
          <button className="btn" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>Suivant →</button>
        </div>
      )}

      {selected && <ProductMenu product={selected} onClose={() => setSelected(null)} onCraft={craft} />}

      {crafted && (
        <Assembly
          inputs={crafted.product.ingredients.map((i) => ({ ing: i, qty: crafted.quantity > 1 ? crafted.quantity : undefined }))}
          result={<GameCard ing={productCard(crafted.product)} kind="product" qty={crafted.quantity} subtitle={crafted.product.brand ?? undefined} />}
          title="Produit fabriqué !"
          subtitle={<>{crafted.quantity > 1 ? `${crafted.quantity} exemplaires de ` : ""}« {crafted.product.name} » rejoignent ta collection.</>}
          actions={<Link href="/usines" className="btn btn-lg">Bâtir une usine</Link>}
          onClose={() => setCrafted(null)}
        />
      )}
    </>
  );
}

/** Sous-menu d'un produit : ingrédients possédés / manquants et quantité à fabriquer. */
function ProductMenu({ product: p, onClose, onCraft }: { product: Product; onClose: () => void; onCraft: (p: Product, qty: number) => Promise<void> }) {
  const max = maxCraftable(p);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const missing = p.ingredients.filter((i) => i.have < 1);

  const submit = async () => {
    setBusy(true);
    await onCraft(p, qty);
    setBusy(false);
  };

  return (
    <Modal title={p.name} onClose={onClose} wide>
      <div className="modal-head">
        {p.imageUrl ? <img className="product-img" src={p.imageUrl} alt="" /> : <div className="product-img placeholder"><CanIcon size={34} /></div>}
        <div style={{ minWidth: 0 }}>
          <div className="muted" style={{ fontSize: ".9rem" }}>{p.brand ?? "Marque inconnue"} · code {p.code}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
            <RarityBadge rarity={p.rarity} />
            <span className="pill">Possédé ×{p.owned}</span>
            <span className="pill">{p.total - p.missing}/{p.total} ingrédients</span>
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: 10 }}>Recette</h3>
        <div className="mini-grid">
          {p.ingredients.map((i) => (
            <div key={i.id} className={i.have < 1 ? "mini-missing" : ""} title={i.have < 1 ? "Manquant" : `${i.have} en stock`}>
              <GameCard ing={i} qty={i.have} />
            </div>
          ))}
        </div>
      </div>

      {missing.length > 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Il manque : <b style={{ color: "var(--text)" }}>{missing.map((m) => m.name).join(", ")}</b>. Ouvre des boosters ou cherche-les sur le <Link href="/marche" style={{ color: "var(--accent)" }}>marché</Link>.
        </p>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="field" style={{ display: "inline" }}>Quantité</span>
          <div className="stepper">
            <button className="btn" disabled={qty <= 1} onClick={() => setQty(qty - 1)} aria-label="Moins">−</button>
            <span className="num">{qty}</span>
            <button className="btn" disabled={qty >= max} onClick={() => setQty(qty + 1)} aria-label="Plus">+</button>
          </div>
          <button className="btn btn-sm btn-ghost" disabled={qty === max} onClick={() => setQty(max)}>Max ({max})</button>
          <span className="muted" style={{ fontSize: ".85rem" }}>Consomme {qty} carte{qty > 1 ? "s" : ""} de chaque ingrédient.</span>
        </div>
      )}

      <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 0 }}>
        <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
        <button className="btn btn-primary" disabled={busy || missing.length > 0} onClick={submit}>Fabriquer{qty > 1 ? ` ×${qty}` : ""}</button>
      </div>
    </Modal>
  );
}
