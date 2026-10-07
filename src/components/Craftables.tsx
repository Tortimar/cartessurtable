"use client";

// Produits qui contiennent un ingrédient, du plus proche d'être fabricable au plus lointain,
// avec fabrication directe et « Où trouver ? » sur les ingrédients manquants.
import { useCallback, useEffect, useState } from "react";
import { api, RarityTag, Thumb, useGame } from "./ui";
import { CanIcon } from "./icons";
import { IngredientSources } from "./IngredientSources";
import { playCraftDone } from "@/lib/sound";

type Candidate = { code: string; name: string; brand: string | null; imageUrl: string | null; rarity: string; missing: number; total: number; owned: number; ingredients: { id: string; name: string; rarity: string; imageUrl: string | null; have: number }[] };

/** Produits contenant l'ingrédient, du plus proche d'être fabricable au plus lointain. */
export function Craftables({ ingredient, onCrafted, title, initial = 8 }: { ingredient: { id: string; name: string }; onCrafted: () => void; title?: React.ReactNode; initial?: number }) {
  const { run, toast } = useGame();
  const [list, setList] = useState<Candidate[] | null>(null);
  const [all, setAll] = useState(false);
  const [focus, setFocus] = useState<{ code: string; id: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () => api<{ products: Candidate[] }>(`/api/products?ingredient=${encodeURIComponent(ingredient.id)}`).then((r) => setList(r.products)).catch((e: Error) => toast(e.message, "error")),
    [ingredient.id, toast],
  );
  useEffect(() => { load(); }, [load]);

  const craft = async (c: Candidate) => {
    setBusy(c.code);
    const ok = await run(() => api(`/api/products/${encodeURIComponent(c.code)}/craft`, { body: { quantity: 1 } }), `« ${c.name} » fabriqué : +1 produit éligible`);
    setBusy(null);
    if (ok === undefined) return;
    playCraftDone();
    load();
    onCrafted();
  };

  const shown = (list ?? []).slice(0, all ? undefined : initial);
  return (
    <div>
      <h3 className="menu-sub">{title ?? <>Produits à fabriquer avec « {ingredient.name} »</>}</h3>
      <p className="muted" style={{ margin: "0 0 8px", fontSize: ".85rem" }}>Les plus proches d&apos;être fabricables d&apos;abord. Touche un ingrédient manquant pour voir où le trouver.</p>
      {!list && <div className="muted">Chargement…</div>}
      {list && list.length === 0 && <div className="muted">Aucun produit ne contient cet ingrédient.</div>}
      <div className="rows">
        {shown.map((c) => {
          const missing = c.ingredients.filter((i) => i.have < 1);
          return (
            <div key={c.code} className="candidate">
              <div className="candidate-main">
                {c.imageUrl ? <img className="product-img" src={c.imageUrl} alt="" style={{ width: 40, height: 40 }} /> : <span className="product-img placeholder" style={{ width: 40, height: 40 }}><CanIcon size={22} /></span>}
                <div style={{ minWidth: 0 }}>
                  <div className="row-title">{c.name} <RarityTag rarity={c.rarity} /></div>
                  <div className="row-meta">
                    {c.missing === 0 ? <span className="tag me">Fabricable</span> : <>{c.total - c.missing}/{c.total} ingrédients</>}
                    {c.owned > 0 && <> · possédé ×{c.owned}</>}
                  </div>
                </div>
                {c.missing === 0
                  ? <button className="btn btn-sm btn-primary" disabled={busy === c.code} onClick={() => craft(c)}>Fabriquer</button>
                  : <span className="progress-tag">{c.total - c.missing}/{c.total}</span>}
              </div>
              {missing.length > 0 && (
                <div className="candidate-missing">
                  <span className="muted">Manque :</span>
                  {missing.map((i) => (
                    <button key={i.id} type="button" className={`chip chip-btn r-${i.rarity} ${focus?.code === c.code && focus.id === i.id ? "on" : ""}`} onClick={() => setFocus(focus?.code === c.code && focus.id === i.id ? null : { code: c.code, id: i.id })}>
                      <Thumb ing={i} small /> {i.name}
                    </button>
                  ))}
                </div>
              )}
              {focus?.code === c.code && <IngredientSources key={focus.id} id={focus.id} onClose={() => setFocus(null)} onChanged={() => { load(); onCrafted(); }} />}
            </div>
          );
        })}
      </div>
      {list && list.length > initial && (
        <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setAll(!all)}>{all ? "Voir moins" : `Voir les ${list.length} produits`}</button>
      )}
    </div>
  );
}
