"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, fmtInterval, fmtMs, GameCard, Modal, RarityBadge, RarityTag, Thumb, useCountdown, useGame } from "@/components/ui";
import { CanIcon, CoinIcon } from "@/components/icons";
import { Assembly } from "@/components/Assembly";
import { playCraftDone, playLevelUp } from "@/lib/sound";
import { IngredientSources } from "@/components/IngredientSources";
import { factoryInterval, productFactoryBaseInterval, productFactoryYield, YIELD_POINTS, type Rarity } from "@/lib/game";

type Upgrade = { coins: number; cards: number; nextLevel: number; nextInterval: number; nextCapacity: number; nextYield: number; affordable: boolean };
type Factory = {
  id: string; ingredientId: string; name: string; rarity: string; imageUrl: string | null;
  level: number; interval: number; capacity: number; yieldPerHour: number; stock: number;
  ready: number; nextInMs: number | null; upgrade: Upgrade | null;
};
type OwnedProduct = { code: string; name: string; imageUrl: string | null; rarity: string; quantity: number };
type Option = { id: string; name: string; rarity: string; imageUrl: string | null; available: number; canBuild: boolean; intervalSec: number; yieldPerHour: number; products: OwnedProduct[] };
type ProductFactory = {
  id: string; productCode: string; name: string; brand: string | null; rarity: string; imageUrl: string | null; points: number;
  level: number; interval: number; capacity: number; yieldPerHour: number; stock: number;
  ready: number; nextInMs: number | null; upgrade: Upgrade | null;
};
type FusionFactory = { id: string; ingredientId: string; level: number; yieldPerHour: number; name: string; rarity: string; imageUrl: string | null; interval: number };
type FusionOption = {
  code: string; name: string; brand: string | null; rarity: string; imageUrl: string | null; points: number;
  ingredients: { id: string; name: string; rarity: string; imageUrl: string | null; factories: FusionFactory[] }[];
  missing: number; total: number; consumedYield: number; preview: { interval: number; yieldPerHour: number } | null;
};
type Data = {
  factories: Factory[]; options: Option[]; cost: number; maxLevel: number; score: number;
  productFactories: ProductFactory[]; productOptions: FusionOption[]; productBonus: number;
};
type Fused = { option: FusionOption; consumed: FusionFactory[]; factory: { name: string; rarity: string; imageUrl: string | null; yieldPerHour: number; interval: number }; consumedYield: number };
type Built = { option: Option; picks: OwnedProduct[]; factory: { name: string; rarity: string; imageUrl: string | null; yieldPerHour: number; interval: number } };

const fmtPts = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

export default function FactoriesPage() {
  const { run, toast } = useGame();
  const [data, setData] = useState<Data | null>(null);
  const [building, setBuilding] = useState<string | null>(null); // ingrédient dont le sous-menu est ouvert
  const [built, setBuilt] = useState<Built | null>(null);
  const [leveling, setLeveling] = useState<string | null>(null);
  const [fusing, setFusing] = useState<FusionOption | null>(null);
  const [fused, setFused] = useState<Fused | null>(null);

  const load = useCallback(() => api<Data>("/api/factories").then(setData).catch((e: Error) => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const build = async (option: Option, selection: { product: OwnedProduct; quantity: number }[]) => {
    const res = await run(() =>
      api<{ factory: Built["factory"] }>("/api/factories", { body: { ingredientId: option.id, products: selection.map((s) => ({ code: s.product.code, quantity: s.quantity })) } }),
    );
    if (!res) return;
    setBuilding(null);
    setBuilt({ option, picks: selection.flatMap((s) => Array.from({ length: s.quantity }, () => s.product)), factory: res.factory });
    load();
  };

  const fuse = async (option: FusionOption, chosen: FusionFactory[]) => {
    const res = await run(() =>
      api<{ factory: Fused["factory"]; consumedYield: number }>("/api/product-factories", { body: { productCode: option.code, factoryIds: chosen.map((c) => c.id) } }),
    );
    if (!res) return;
    setFusing(null);
    setFused({ option, consumed: chosen, factory: res.factory, consumedYield: res.consumedYield });
    load();
  };

  const upgrade = async (f: Factory | ProductFactory, base: string) => {
    const res = await run(() => api<{ level: number; collected: number }>(`${base}/${f.id}/upgrade`, { method: "POST" }), (r) => `Usine à ${f.name} : niveau ${r.level} !${r.collected ? ` (+${r.collected} récoltées)` : ""}`);
    if (!res) return;
    playLevelUp();
    setLeveling(f.id);
    setTimeout(() => setLeveling(null), 1000);
    load();
  };

  const buildingOption = building ? data?.options.find((o) => o.id === building) : undefined;
  const totalPerHour = data ? [...data.factories, ...data.productFactories].reduce((n, f) => n + 3600 / f.interval, 0) : 0;
  const factoryCount = data ? data.factories.length + data.productFactories.length : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Usines</h1>
          <p>Une usine produit en continu un ingrédient. Améliore-la pour produire plus vite et stocker davantage. Le rendement mesure la valeur produite : plus l&apos;ingrédient est rare, plus chaque carte rapporte de points.</p>
        </div>
      </div>

      {data && (
        <div className="stat-row" style={{ marginBottom: 24 }}>
          <div className="stat big"><b>{fmtPts(data.score)}</b><span>Score de rendement (points / heure)</span></div>
          <div className="stat"><b>{factoryCount}</b><span>Usine{factoryCount > 1 ? "s" : ""}{data.productFactories.length ? ` dont ${data.productFactories.length} de produits` : ""}</span></div>
          <div className="stat"><b>{fmtPts(totalPerHour)}</b><span>Cartes produites / heure</span></div>
          <div className="stat legend" title="Points de rendement par carte produite">
            <span>Points par carte</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {(Object.keys(YIELD_POINTS) as Rarity[]).map((r) => <span key={r} style={{ fontSize: ".8rem" }}><RarityTag rarity={r} /> {YIELD_POINTS[r]}</span>)}
            </div>
          </div>
        </div>
      )}

      <h2 style={{ marginBottom: 12 }}>Mes usines</h2>
      {data && data.factories.length === 0 && <div className="empty">Aucune usine pour l&apos;instant. Fabrique des produits puis construis-en une ci-dessous.</div>}
      <div className="factory-grid">
        {data?.factories.map((f) => (
          <FactorySlot key={f.id} f={f} card={{ id: f.ingredientId, name: f.name, rarity: f.rarity, imageUrl: f.imageUrl }} kind="factory" base="/api/factories" maxLevel={data.maxLevel} leveling={leveling === f.id} onChange={load} onUpgrade={() => upgrade(f, "/api/factories")} />
        ))}
      </div>

      {data && data.productFactories.length > 0 && (
        <>
          <h2 style={{ margin: "36px 0 12px" }}>Usines de produits</h2>
          <div className="factory-grid">
            {data.productFactories.map((f) => (
              <FactorySlot key={f.id} f={f} card={{ id: f.productCode, name: f.name, rarity: f.rarity, imageUrl: f.imageUrl }} kind="productFactory" base="/api/product-factories" unit="produit" maxLevel={data.maxLevel} leveling={leveling === f.id} onChange={load} onUpgrade={() => upgrade(f, "/api/product-factories")} />
            ))}
          </div>
        </>
      )}

      <h2 style={{ margin: "36px 0 6px" }}>Fusionner en usine de produits</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Réunis une usine pour chaque ingrédient d&apos;un produit : elles fusionnent en une usine qui fabrique directement ce produit,
        avec <b style={{ color: "var(--accent)" }}>+{Math.round(((data?.productBonus ?? 1.5) - 1) * 100)} % de rendement</b> par rapport aux usines fusionnées. Une seule usine par produit.
      </p>
      {data && data.productOptions.length === 0 && <div className="empty">Construis d&apos;abord des usines d&apos;ingrédients : les produits dont tu couvres des ingrédients apparaîtront ici.</div>}
      <div className="rows">
        {data?.productOptions.slice(0, 12).map((o) => (
          <div key={o.code} className="row">
            {o.imageUrl ? <img className="product-img" src={o.imageUrl} alt="" style={{ width: 44, height: 44 }} /> : <span className="product-img placeholder" style={{ width: 44, height: 44 }}><CanIcon size={26} /></span>}
            <div style={{ minWidth: 0 }}>
              <div className="row-title">{o.name} <RarityTag rarity={o.rarity} /></div>
              <div className="row-meta">
                {o.total - o.missing}/{o.total} usines d&apos;ingrédients
                {o.preview ? <> · {fmtPts(o.consumedYield)} → <b className="arrow-gain">{fmtPts(o.preview.yieldPerHour)} pts/h</b></> : <> · manque : {o.ingredients.filter((i) => !i.factories.length).map((i) => i.name).join(", ")}</>}
              </div>
            </div>
            <div className="row-side">
              <button className="btn btn-sm btn-primary" disabled={o.missing > 0} onClick={() => setFusing(o)}>{o.missing ? `${o.total - o.missing}/${o.total}` : "Choisir les usines"}</button>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ margin: "36px 0 6px" }}>Construire une usine d&apos;ingrédient</h2>
      <p className="muted" style={{ marginTop: 0 }}>Une usine coûte {data?.cost ?? 3} produits contenant l&apos;ingrédient choisi. Tu choisis toi-même lesquels sacrifier. <b style={{ color: "var(--text)" }}>Une seule usine par ingrédient</b> : pour produire plus, améliore-la.</p>
      {data && data.options.length === 0 && <div className="empty">{data.factories.length ? "Tu as déjà une usine pour chaque ingrédient de tes produits. Fabrique d'autres produits pour en débloquer de nouvelles : " : "Il te faut des produits fabriqués. Rends-toi dans "}<Link href="/produits">Produits</Link>.</div>}
      <div className="rows">
        {data?.options.map((o) => (
          <div key={o.id} className="row clickable" role="button" tabIndex={0} onClick={() => setBuilding(o.id)} onKeyDown={(e) => e.key === "Enter" && setBuilding(o.id)} aria-label={`Usine à ${o.name}`}>
            <Thumb ing={o} />
            <div>
              <div className="row-title">{o.name} <RarityTag rarity={o.rarity} /></div>
              <div className="row-meta">1 carte / {fmtInterval(o.intervalSec)} · rendement niveau 1 : <b style={{ color: "var(--gold)" }}>{fmtPts(o.yieldPerHour)} pts/h</b> · {o.available} produit{o.available > 1 ? "s" : ""} éligible{o.available > 1 ? "s" : ""}</div>
            </div>
            <div className="row-side">
              <span className={`progress-tag ${o.canBuild ? "done" : ""}`}>{Math.min(o.available, data.cost)}/{data.cost}</span>
              <button className={`btn btn-sm ${o.canBuild ? "btn-primary" : ""}`} onClick={(e) => { e.stopPropagation(); setBuilding(o.id); }}>{o.canBuild ? "Construire" : "Compléter"}</button>
            </div>
          </div>
        ))}
      </div>

      {fusing && data && <FusionMenu option={fusing} bonus={data.productBonus} onClose={() => setFusing(null)} onFuse={fuse} />}

      {fused && (
        <Assembly
          heavy
          inputs={fused.consumed.map((f) => ({ ing: { id: f.ingredientId, name: f.name, rarity: f.rarity, imageUrl: f.imageUrl }, kind: "factory" as const, corner: <span className="card-level">Nv. {f.level}</span> }))}
          result={
            <GameCard
              kind="productFactory"
              ing={{ id: fused.option.code, name: fused.factory.name, rarity: fused.factory.rarity, imageUrl: fused.factory.imageUrl }}
              corner={<span className="card-level">Nv. 1</span>}
              subtitle={<>1 / {fmtInterval(fused.factory.interval)} · {fmtPts(fused.factory.yieldPerHour)} pts/h</>}
            />
          }
          title="Usine de produits construite !"
          subtitle={<>{fused.consumed.length} usines fusionnées : {fmtPts(fused.consumedYield)} → {fmtPts(fused.factory.yieldPerHour)} pts/h. Elle fabrique « {fused.factory.name} ».</>}
          onClose={() => setFused(null)}
        />
      )}

      {buildingOption && data && <BuildMenu key={buildingOption.id} option={buildingOption} cost={data.cost} onClose={() => setBuilding(null)} onBuild={build} onCrafted={load} />}

      {built && (
        <Assembly
          heavy
          inputs={built.picks.map((p) => ({ ing: { id: p.code, name: p.name, rarity: p.rarity, imageUrl: p.imageUrl }, kind: "product" as const }))}
          result={
            <GameCard
              kind="factory"
              ing={{ id: built.option.id, name: built.factory.name, rarity: built.factory.rarity, imageUrl: built.factory.imageUrl }}
              corner={<span className="card-level">Nv. 1</span>}
              subtitle={<>1 / {fmtInterval(built.factory.interval)} · {fmtPts(built.factory.yieldPerHour)} pts/h</>}
            />
          }
          title="Usine construite !"
          subtitle={<>Ton usine à « {built.factory.name} » tourne déjà. Score : +{fmtPts(built.factory.yieldPerHour)} pts/h.</>}
          onClose={() => setBuilt(null)}
        />
      )}
    </>
  );
}

type SlotProps = {
  f: Factory | ProductFactory;
  card: { id: string; name: string; rarity: string; imageUrl: string | null };
  kind: "factory" | "productFactory";
  base: string;
  unit?: string;
  maxLevel: number;
  leveling: boolean;
  onChange: () => void;
  onUpgrade: () => void;
};

function FactorySlot({ f, card, kind, base, unit = "carte", maxLevel, leveling, onChange, onUpgrade }: SlotProps) {
  const { run } = useGame();
  const next = useCountdown(f.nextInMs);
  useEffect(() => { if (next === 0) onChange(); }, [next, onChange]);

  const collect = async () => {
    await run(() => api<{ collected: number }>(`${base}/${f.id}/collect`, { method: "POST" }), (r) => `+${r.collected} ${f.name}`);
    onChange();
  };

  const u = f.upgrade;
  return (
    <div className="factory-slot">
      <div className={leveling ? "leveling" : ""}>
        <GameCard
          kind={kind}
          ing={card}
          corner={<span className="card-level">Nv. {f.level}{f.level >= maxLevel ? " max" : ""}</span>}
          subtitle={<>1 / {fmtInterval(f.interval)} · <b style={{ color: "var(--gold)" }}>{fmtPts(f.yieldPerHour)} pts/h</b></>}
        />
      </div>
      <div className="progress" title={`${f.ready} / ${f.capacity}`}><span style={{ width: `${(f.ready / f.capacity) * 100}%` }} /></div>
      <div className="muted" style={{ fontSize: ".8rem", display: "flex", justifyContent: "space-between" }}>
        <span>{f.ready}/{f.capacity} prêtes</span>
        <span>{f.ready >= f.capacity ? "stock plein" : next != null ? `+1 dans ${fmtMs(next)}` : ""}</span>
      </div>
      <button className="btn btn-primary" disabled={f.ready === 0} onClick={collect}>Récolter{f.ready > 0 && ` (${f.ready})`}</button>
      {u ? (
        <>
          <button className="btn" disabled={!u.affordable} onClick={onUpgrade} title={`Niveau ${u.nextLevel} : 1 ${unit} / ${fmtInterval(u.nextInterval)}, stock ${u.nextCapacity}`}>
            Améliorer → Nv. {u.nextLevel}
          </button>
          <div className="up-cost">
            <CoinIcon size={14} style={{ verticalAlign: "-2px" }} /> {u.coins} + {u.cards} {f.name} <span style={{ opacity: .8 }}>(tu en as {f.stock}{f.ready ? ` + ${f.ready} prêtes` : ""})</span><br />
            {fmtPts(f.yieldPerHour)} → <b style={{ color: "var(--gold)" }}>{fmtPts(u.nextYield)} pts/h</b>
          </div>
        </>
      ) : (
        <div className="up-cost">Niveau maximal atteint</div>
      )}
    </div>
  );
}

/** Sous-menu de construction : le joueur choisit exactement les produits à sacrifier. */
function BuildMenu({ option, cost, onClose, onBuild, onCrafted }: { option: Option; cost: number; onClose: () => void; onBuild: (o: Option, sel: { product: OwnedProduct; quantity: number }[]) => Promise<void>; onCrafted: () => void }) {
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const total = Object.values(picks).reduce((a, b) => a + b, 0);
  const set = (code: string, n: number) => setPicks((p) => ({ ...p, [code]: n }));

  // Remplissage automatique : on sacrifie d'abord les produits dont on a le plus d'exemplaires
  const autoFill = () => {
    const next: Record<string, number> = {};
    let left = cost;
    for (const p of [...option.products].sort((a, b) => b.quantity - a.quantity)) {
      if (!left) break;
      const n = Math.min(p.quantity, left);
      next[p.code] = n;
      left -= n;
    }
    setPicks(next);
  };

  const slots = useMemo(() => option.products.flatMap((p) => Array.from({ length: picks[p.code] ?? 0 }, () => p)), [option.products, picks]);

  const submit = async () => {
    setBusy(true);
    await onBuild(option, option.products.filter((p) => (picks[p.code] ?? 0) > 0).map((p) => ({ product: p, quantity: picks[p.code] })));
    setBusy(false);
  };

  return (
    <Modal title={`Usine à « ${option.name} »`} onClose={onClose} wide>
      <div className="modal-head">
        <Thumb ing={option} />
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <RarityBadge rarity={option.rarity} />
            <span className="pill">1 carte / {fmtInterval(option.intervalSec)}</span>
            <span className="pill" style={{ color: "var(--gold)" }}>{fmtPts(option.yieldPerHour)} pts/h</span>
          </div>
          <div className="muted" style={{ fontSize: ".88rem", marginTop: 6 }}>
            {option.canBuild
              ? <>Choisis {cost} produits contenant « {option.name} ». Ils seront détruits.</>
              : <>Il te manque <b style={{ color: "var(--text)" }}>{cost - option.available} produit{cost - option.available > 1 ? "s" : ""}</b> contenant « {option.name} » : fabrique-{cost - option.available > 1 ? "les" : "le"} ci-dessous.</>}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div className="slots">
          {Array.from({ length: cost }, (_, i) => {
            const p = slots[i];
            return (
              <div key={i} className={`slot ${p ? "filled" : ""}`} title={p?.name}>
                {p ? (p.imageUrl ? <img src={p.imageUrl} alt={p.name} /> : <CanIcon size={30} />) : i + 1}
              </div>
            );
          })}
        </div>
        <div>
          <b>{total}/{cost}</b> <span className="muted">sélectionné{total > 1 ? "s" : ""}</span>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button className="btn btn-sm" disabled={!option.canBuild} onClick={autoFill}>Remplir automatiquement</button>
            {total > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setPicks({})}>Vider</button>}
          </div>
        </div>
      </div>

      <h3 className="menu-sub">Tes produits éligibles <span className="count">{option.available}</span></h3>
      <div style={{ display: "grid", gap: 8 }}>
        {option.products.map((p) => {
          const n = picks[p.code] ?? 0;
          return (
            <div key={p.code} className={`pick-row ${n > 0 ? "on" : ""}`}>
              {p.imageUrl ? <img className="product-img" src={p.imageUrl} alt="" style={{ width: 44, height: 44 }} /> : <div className="product-img placeholder" style={{ width: 44, height: 44 }}><CanIcon size={26} /></div>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div className="muted" style={{ fontSize: ".8rem" }}><RarityTag rarity={p.rarity} /> · possédé ×{p.quantity}</div>
              </div>
              <div className="stepper">
                <button className="btn" disabled={n === 0} onClick={() => set(p.code, n - 1)} aria-label="Retirer">−</button>
                <span className="num">{n}</span>
                <button className="btn" disabled={n >= p.quantity || total >= cost} onClick={() => set(p.code, n + 1)} aria-label="Ajouter">+</button>
              </div>
            </div>
          );
        })}
      </div>

      <Craftables ingredient={option} onCrafted={onCrafted} />

      <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 0 }}>
        <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
        <button className="btn btn-primary" disabled={busy || total !== cost} onClick={submit}>Construire l&apos;usine</button>
      </div>
    </Modal>
  );
}

/** Sous-menu de fusion : une usine par ingrédient de la recette, au choix du joueur. */
function FusionMenu({ option, bonus, onClose, onFuse }: { option: FusionOption; bonus: number; onClose: () => void; onFuse: (o: FusionOption, chosen: FusionFactory[]) => Promise<void> }) {
  // Par défaut : l'usine la moins rentable de chaque ingrédient, pour garder les meilleures
  const [pick, setPick] = useState<Record<string, string>>(() =>
    Object.fromEntries(option.ingredients.map((i) => [i.id, i.factories[i.factories.length - 1]?.id ?? ""])),
  );
  const [busy, setBusy] = useState(false);
  const chosen = option.ingredients.map((i) => i.factories.find((f) => f.id === pick[i.id])).filter((f): f is FusionFactory => !!f);
  const consumed = chosen.reduce((n, f) => n + f.yieldPerHour, 0);
  const base = productFactoryBaseInterval(consumed, option.points);
  const gain = productFactoryYield(base, 1, option.points);

  const submit = async () => {
    setBusy(true);
    await onFuse(option, chosen);
    setBusy(false);
  };

  return (
    <Modal title={`Usine de produits : ${option.name}`} onClose={onClose} wide>
      <div className="modal-head">
        {option.imageUrl ? <img className="product-img" src={option.imageUrl} alt="" /> : <div className="product-img placeholder"><CanIcon size={34} /></div>}
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <RarityBadge rarity={option.rarity} />
            <span className="pill">{option.points} pts par produit</span>
          </div>
          <div className="muted" style={{ fontSize: ".88rem", marginTop: 6 }}>Choisis une usine pour chacun des {option.total} ingrédients. Elles seront démolies (leur production en attente est récoltée avant).</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {option.ingredients.map((i) => (
          <div key={i.id} className="fusion-row">
            <Thumb ing={i} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{i.name}</div>
              <div className="muted" style={{ fontSize: ".8rem" }}><RarityTag rarity={i.rarity} /> · {i.factories.length} usine{i.factories.length > 1 ? "s" : ""}</div>
            </div>
            <select className="select" value={pick[i.id]} onChange={(e) => setPick((p) => ({ ...p, [i.id]: e.target.value }))} aria-label={`Usine de ${i.name}`}>
              {i.factories.map((f) => <option key={f.id} value={f.id}>Nv. {f.level} · {fmtPts(f.yieldPerHour)} pts/h</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className="fusion-sum">
        <span className="pill">Usines fusionnées : {fmtPts(consumed)} pts/h</span>
        <span className="arrow-gain">→</span>
        <span className="pill" style={{ color: "var(--gold)" }}>Usine de produits : {fmtPts(gain)} pts/h</span>
        <span className="muted" style={{ fontSize: ".85rem" }}>1 produit / {fmtInterval(factoryInterval(base, 1))} · +{Math.round((bonus - 1) * 100)} %</span>
      </div>

      <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 0 }}>
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={busy || chosen.length !== option.total} onClick={submit}>Fusionner les {option.total} usines</button>
      </div>
    </Modal>
  );
}

type Candidate = { code: string; name: string; brand: string | null; imageUrl: string | null; rarity: string; missing: number; total: number; owned: number; ingredients: { id: string; name: string; rarity: string; imageUrl: string | null; have: number }[] };

/** Produits contenant l'ingrédient, du plus proche d'être fabricable au plus lointain. */
function Craftables({ ingredient, onCrafted }: { ingredient: { id: string; name: string }; onCrafted: () => void }) {
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

  const shown = (list ?? []).slice(0, all ? undefined : 8);
  return (
    <div>
      <h3 className="menu-sub">Produits à fabriquer avec « {ingredient.name} »</h3>
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
      {list && list.length > 8 && (
        <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setAll(!all)}>{all ? "Voir moins" : `Voir les ${list.length} produits`}</button>
      )}
    </div>
  );
}
