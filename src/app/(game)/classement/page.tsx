"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, Avatar, useGame } from "@/components/ui";
import { Medal } from "@/components/icons";

type Entry = {
  rank: number; id: string; username: string; score: number; factories: number;
  best: { name: string; level: number; yieldPerHour: number } | null; me: boolean; friend: boolean;
};
type Data = { scope: "all" | "friends"; total: number; entries: Entry[]; me: Entry | null };

const fmt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const ord = (n: number) => (n === 1 ? "1er" : `${n}e`);

export default function LeaderboardPage() {
  const { toast } = useGame();
  const [scope, setScope] = useState<"all" | "friends">("all");
  const [data, setData] = useState<Data | null>(null);

  const load = useCallback(() => api<Data>(`/api/leaderboard?scope=${scope}`).then(setData).catch((e: Error) => toast(e.message, "error")), [scope, toast]);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  const podium = data?.entries.filter((e) => e.score > 0).slice(0, 3) ?? [];
  const meVisible = data?.entries.some((e) => e.me);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Classement</h1>
          <p>Les joueurs sont classés selon leur score de rendement : la somme des points produits par heure par toutes leurs usines. Construis et améliore tes usines pour grimper.</p>
        </div>
        <div className="tabs">
          <button className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>Général</button>
          <button className={scope === "friends" ? "on" : ""} onClick={() => setScope("friends")}>Entre amis</button>
        </div>
      </div>

      {data?.me && (
        <div className="stat-row" style={{ marginBottom: 22 }}>
          <div className="stat big"><b>{data.me.score > 0 ? ord(data.me.rank) : "—"}</b><span>Ta place sur {data.total} joueur{data.total > 1 ? "s" : ""}</span></div>
          <div className="stat"><b style={{ color: "var(--gold)" }}>{fmt(data.me.score)}</b><span>Ton score (pts / h)</span></div>
          <div className="stat"><b>{data.me.factories}</b><span>Usine{data.me.factories > 1 ? "s" : ""}</span></div>
          {data.me.rank > 1 && data.me.score > 0 && (() => {
            const ahead = data.entries.filter((e) => e.score > data.me!.score).at(-1);
            return ahead ? <div className="stat"><b>{fmt(ahead.score - data.me.score)}</b><span>pts/h pour dépasser {ahead.username}</span></div> : null;
          })()}
        </div>
      )}

      {scope === "friends" && data && data.total <= 1 && (
        <div className="empty" style={{ marginBottom: 20 }}>Tu n&apos;as pas encore d&apos;amis. <Link href="/amis">Ajoute des amis</Link> pour comparer vos scores.</div>
      )}

      {podium.length > 0 && (
        <div className="podium">
          {[podium[1], podium[0], podium[2]].map((e, i) => {
            if (!e) return <div key={i} />;
            const place = e === podium[0] ? 1 : e === podium[1] ? 2 : 3;
            return (
              <div key={e.id} className={`podium-step p${place} ${e.me ? "me" : ""}`}>
                <span className="podium-rank"><Medal place={place as 1 | 2 | 3} size={26} /> {ord(e.rank)}</span>
                <Avatar name={e.username} size={place === 1 ? 64 : 52} />
                <span className="podium-name">{e.username}</span>
                <span className="podium-score">{fmt(e.score)}</span>
                <span className="muted" style={{ fontSize: ".8rem" }}>pts/h · {e.factories} usine{e.factories > 1 ? "s" : ""}</span>
              </div>
            );
          })}
        </div>
      )}

      {data && (
        <div className="lb">
          {data.entries.map((e) => <Row key={e.id} e={e} />)}
          {!meVisible && data.me && (
            <>
              <div className="lb-sep">• • •</div>
              <Row e={data.me} />
            </>
          )}
        </div>
      )}
    </>
  );
}

function Row({ e }: { e: Entry }) {
  return (
    <div className={`lb-row ${e.me ? "me" : ""}`}>
      <span className="lb-rank">{e.score > 0 ? e.rank : "—"}</span>
      <Avatar name={e.username} />
      <div style={{ minWidth: 0 }}>
        <div className="lb-name">
          {e.username}
          {e.me && <span className="tag me">Toi</span>}
          {e.friend && <span className="tag friend">Ami</span>}
        </div>
        <div className="lb-meta">
          {e.factories ? <>{e.factories} usine{e.factories > 1 ? "s" : ""}{e.best && <> · meilleure : {e.best.name} Nv. {e.best.level} ({fmt(e.best.yieldPerHour)} pts/h)</>}</> : "Aucune usine"}
        </div>
      </div>
      <div className="lb-score">{fmt(e.score)}<small>pts / h</small></div>
    </div>
  );
}
