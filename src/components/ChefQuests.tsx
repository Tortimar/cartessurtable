"use client";

// Le Chef, PNJ du marché : il rachète chaque jour 5 ingrédients à prix d'or.
import { useCallback, useEffect, useState } from "react";
import { api, RarityTag, Thumb, useCountdown, useGame } from "./ui";
import { CoinIcon } from "./icons";
import { IngredientSources } from "./IngredientSources";
import { playCraftDone } from "@/lib/sound";

type Quest = { id: string; slot: number; reward: number; ingredientId: string; name: string; rarity: string; imageUrl: string | null; have: number; delivered: boolean };
type Data = { day: string; renewsInMs: number; quests: Quest[]; done: number; earnedToday: number };

function fmtWait(ms: number) {
  const m = Math.ceil(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
}

/** Portrait du Chef (dessin vectoriel) */
function ChefPortrait() {
  return (
    <svg className="chef-portrait" viewBox="0 0 96 96" aria-hidden>
      <circle cx="48" cy="48" r="46" fill="#3f2e23" />
      <path d="M22 40c-6-2-8-10-3-15s13-4 15 1c2-8 10-12 14-12s12 4 14 12c2-5 10-6 15-1s3 13-3 15v8H22z" fill="#fff6ea" stroke="#d9c39c" strokeWidth="1.5" />
      <rect x="22" y="40" width="52" height="9" rx="2" fill="#f4e4c8" stroke="#d9c39c" strokeWidth="1.5" />
      <ellipse cx="48" cy="64" rx="19" ry="18" fill="#f2c79e" />
      <circle cx="41" cy="60" r="2.2" fill="#3a2418" /><circle cx="55" cy="60" r="2.2" fill="#3a2418" />
      <circle cx="37" cy="67" r="3" fill="#e98f74" opacity=".55" /><circle cx="59" cy="67" r="3" fill="#e98f74" opacity=".55" />
      <path d="M36 70c4-4 8-4 12 0 4-4 8-4 12 0-3 4-8 4-12 1-4 3-9 3-12-1z" fill="#6b3e22" />
      <path d="M43 76c3 2 7 2 10 0" stroke="#3a2418" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M30 84c5-3 11-4 18-4s13 1 18 4" stroke="#d4492a" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function ChefQuests() {
  const { run, toast } = useGame();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const load = useCallback(() => api<Data>("/api/market/chef").then(setData).catch((e: Error) => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); }, [load]);
  const left = useCountdown(data?.renewsInMs ?? null);
  useEffect(() => { if (left === 0) { const t = setTimeout(load, 1500); return () => clearTimeout(t); } }, [left, load]);

  const give = async (q: Quest) => {
    setBusy(q.id);
    const ok = await run(() => api<{ earned: number }>(`/api/market/chef/${q.id}`, { method: "POST" }), (r) => `Le Chef te remercie : +${r.earned} pièces pour « ${q.name} »`);
    setBusy(null);
    if (ok !== undefined) playCraftDone();
    load();
  };

  if (data && data.quests.length === 0) return null;
  const total = data?.quests.length ?? 5;
  const allDone = !!data && data.done === total;
  const ready = data?.quests.filter((q) => !q.delivered && q.have > 0).length ?? 0;
  const line = !data ? "…"
    : allDone ? "Merci, ma cuisine est pleine ! Reviens demain, j'aurai une nouvelle liste."
    : data.done > 0 ? `Encore ${total - data.done} ingrédient${total - data.done > 1 ? "s" : ""} et mon plat du jour sera prêt !`
    : `Pour le plat du jour, il me faut ces ${total} ingrédients. Je t'en donne ${data.quests[0]?.reward ?? 50} pièces chacun !`;

  return (
    <section className="chef">
      <div className="chef-head">
        <ChefPortrait />
        <div className="chef-talk">
          <div className="chef-name">Le Chef <span className="muted">· commande du jour</span></div>
          <p className="chef-bubble">{line}</p>
        </div>
        <div className="chef-meta">
          <span className="pill"><b>{data?.done ?? 0}/{total}</b>&nbsp;livrés · <CoinIcon size={14} /> {data?.earnedToday ?? 0}</span>
          <span className="muted" style={{ fontSize: ".8rem" }}>Nouvelle commande dans {left != null ? fmtWait(left) : "…"}</span>
        </div>
      </div>
      <div className="chef-list">
        {data?.quests.map((q) => (
          <div key={q.id} className={`chef-item ${q.delivered ? "done" : ""} ${focus === q.ingredientId ? "on" : ""}`}>
            <button type="button" className="chef-ing" onClick={() => setFocus(focus === q.ingredientId ? null : q.ingredientId)} title="Où trouver cet ingrédient ?">
              <Thumb ing={{ id: q.ingredientId, name: q.name, rarity: q.rarity, imageUrl: q.imageUrl }} />
              <span className="chef-ing-text">
                <b>{q.name}</b>
                <span><RarityTag rarity={q.rarity} /> · tu en as {q.have}</span>
              </span>
            </button>
            {q.delivered
              ? <span className="tag me">Livré ✓</span>
              : <button className="btn btn-sm btn-primary" disabled={q.have < 1 || busy === q.id} onClick={() => give(q)} title={q.have < 1 ? "Tu n'as pas cet ingrédient" : undefined}>Donner · <CoinIcon size={13} /> {q.reward}</button>}
          </div>
        ))}
      </div>
      {ready > 1 && <p className="muted" style={{ margin: "8px 0 0", fontSize: ".82rem" }}>Tu peux livrer {ready} ingrédients tout de suite.</p>}
      {focus && <div style={{ marginTop: 10 }}><IngredientSources key={focus} id={focus} onClose={() => setFocus(null)} onChanged={load} /></div>}
    </section>
  );
}
