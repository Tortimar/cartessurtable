"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, IngredientCard, RarityFilter, RarityTag, useGame } from "@/components/ui";
import { CanIcon } from "@/components/icons";
import { SellModal, type Sellable } from "@/components/SellModal";
import { RARITIES } from "@/lib/game";

type Data = {
  ingredients: (Sellable & { popularity: number; imageUrl: string | null })[];
  products: { code: string; name: string; brand: string | null; imageUrl: string | null; rarity: string; quantity: number }[];
  totalIngredients: number;
};

export default function CollectionPage() {
  const { toast } = useGame();
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<"ingredients" | "products">("ingredients");
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState("");
  const [sort, setSort] = useState<"name" | "rarity" | "qty">("rarity");
  const [selling, setSelling] = useState<Sellable | null>(null);

  const load = useCallback(() => api<Data>("/api/collection").then(setData).catch((e: Error) => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => {
    if (!data) return [];
    const list = data.ingredients.filter((i) => (!rarity || i.rarity === rarity) && i.name.toLowerCase().includes(q.toLowerCase()));
    const rank = (r: string) => RARITIES.indexOf(r as never);
    return list.sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "qty" ? b.quantity - a.quantity : rank(b.rarity) - rank(a.rarity) || a.name.localeCompare(b.name),
    );
  }, [data, q, rarity, sort]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Collection</h1>
          {data && <p>{data.ingredients.length} ingrédients différents sur {data.totalIngredients} · {data.ingredients.reduce((s, i) => s + i.quantity, 0)} cartes · {data.products.reduce((s, p) => s + p.quantity, 0)} produits fabriqués</p>}
        </div>
        <div className="tabs">
          <button className={tab === "ingredients" ? "on" : ""} onClick={() => setTab("ingredients")}>Ingrédients</button>
          <button className={tab === "products" ? "on" : ""} onClick={() => setTab("products")}>Produits</button>
        </div>
      </div>

      {tab === "ingredients" && (
        <>
          <div className="toolbar">
            <input className="input" placeholder="Rechercher un ingrédient…" value={q} onChange={(e) => setQ(e.target.value)} />
            <RarityFilter value={rarity} onChange={setRarity} />
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Tri">
              <option value="rarity">Plus rares d&apos;abord</option>
              <option value="qty">Plus nombreux d&apos;abord</option>
              <option value="name">Ordre alphabétique</option>
            </select>
          </div>
          {data && items.length === 0 && (
            <div className="empty">{data.ingredients.length === 0 ? <>Ta collection est vide. <Link href="/boosters">Ouvre un booster</Link> pour commencer.</> : "Aucun ingrédient ne correspond."}</div>
          )}
          <div className="grid">
            {items.map((i) => (
              <IngredientCard key={i.id} ing={i} qty={i.quantity}>
                <button className="btn btn-sm" onClick={() => setSelling(i)}>Vendre</button>
              </IngredientCard>
            ))}
          </div>
        </>
      )}

      {tab === "products" && data && (
        data.products.length === 0 ? (
          <div className="empty">Aucun produit fabriqué. Réunis tous les ingrédients d&apos;un produit dans <Link href="/produits">Produits</Link>.</div>
        ) : (
          <div className="grid-wide">
            {data.products.map((p) => (
              <div key={p.code} className="product">
                <div className="product-top">
                  {p.imageUrl ? <img className="product-img" src={p.imageUrl} alt="" loading="lazy" /> : <div className="product-img placeholder"><CanIcon size={34} /></div>}
                  <div>
                    <div className="product-name">{p.name}</div>
                    <div className="muted" style={{ fontSize: ".85rem" }}>{p.brand}</div>
                    <RarityTag rarity={p.rarity} />
                  </div>
                </div>
                <div className="product-foot"><span className="price">×{p.quantity}</span><Link href="/usines" className="btn btn-sm">Bâtir une usine</Link></div>
              </div>
            ))}
          </div>
        )
      )}

      {selling && <SellModal item={selling} onClose={() => setSelling(null)} onDone={load} />}
    </>
  );
}
