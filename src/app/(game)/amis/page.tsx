"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, Avatar, SocialTabs, useGame } from "@/components/ui";

type Score = { score: number; factories: number; best: { name: string; level: number; yieldPerHour: number } | null };
type Friend = Score & { friendshipId: string; id: string; username: string; since: string | null };
type Incoming = Score & { friendshipId: string; id: string; username: string; createdAt: string };
type Outgoing = { friendshipId: string; id: string; username: string; createdAt: string };
type Data = { friends: Friend[]; incoming: Incoming[]; outgoing: Outgoing[] };
type Found = { id: string; username: string; relation: "none" | "friend" | "incoming" | "outgoing"; friendshipId: string | null; score: number };

const fmt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const since = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

export default function FriendsPage() {
  const { run, toast, refreshMe } = useGame();
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);

  const load = useCallback(() => api<Data>("/api/friends").then(setData).catch((e: Error) => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const search = useCallback(() => {
    if (q.trim().length < 2) { setFound(null); return; }
    api<{ users: Found[] }>(`/api/users/search?q=${encodeURIComponent(q.trim())}`).then((r) => setFound(r.users)).catch(() => {});
  }, [q]);
  useEffect(() => { const t = setTimeout(search, 250); return () => clearTimeout(t); }, [search]);

  const refresh = () => { load(); search(); refreshMe(); };

  const add = async (username: string) => {
    await run(
      () => api<{ status: "PENDING" | "ACCEPTED"; username: string }>("/api/friends", { body: { username } }),
      (r) => (r.status === "ACCEPTED" ? `${r.username} et toi êtes maintenant amis !` : `Demande envoyée à ${r.username}`),
    );
    refresh();
  };
  const accept = async (id: string, username: string) => {
    await run(() => api(`/api/friends/${id}/accept`, { method: "POST" }), `${username} et toi êtes maintenant amis !`);
    refresh();
  };
  const remove = async (id: string, message: string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    await run(() => api(`/api/friends/${id}`, { method: "DELETE" }), message);
    refresh();
  };

  return (
    <>
      <SocialTabs />
      <div className="page-head">
        <div>
          <h1>Amis</h1>
          <p>Ajoute d&apos;autres joueurs par leur pseudo. Une fois la demande acceptée, vous pouvez comparer vos scores dans le <Link href="/classement" style={{ color: "var(--accent)" }}>classement entre amis</Link>.</p>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginBottom: 10 }}>Ajouter un ami</h2>
        <form className="toolbar" style={{ marginBottom: 0 }} onSubmit={(e) => { e.preventDefault(); if (q.trim()) add(q.trim()); }}>
          <input className="input" placeholder="Pseudo du joueur…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          <button className="btn btn-primary" disabled={!q.trim()}>Envoyer une demande</button>
        </form>
        {found && (
          <div className="search-results">
            {found.length === 0 && <div className="muted" style={{ fontSize: ".9rem" }}>Aucun joueur ne correspond à « {q} ».</div>}
            {found.map((u) => (
              <div key={u.id} className="friend-row">
                <Avatar name={u.username} />
                <div>
                  <div style={{ fontWeight: 600 }}>{u.username}</div>
                  <div className="muted" style={{ fontSize: ".8rem" }}>{fmt(u.score)} pts/h</div>
                </div>
                <div className="row-side">
                  {u.relation === "none" && <button className="btn btn-sm btn-primary" onClick={() => add(u.username)}>Ajouter</button>}
                  {u.relation === "outgoing" && <><span className="tag">Demande envoyée</span><button className="btn btn-sm btn-ghost" onClick={() => remove(u.friendshipId!, "Demande annulée")}>Annuler</button></>}
                  {u.relation === "incoming" && <button className="btn btn-sm btn-primary" onClick={() => accept(u.friendshipId!, u.username)}>Accepter sa demande</button>}
                  {u.relation === "friend" && <span className="tag friend">Ami ✓</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {data && data.incoming.length > 0 && (
        <section className="section">
          <h2>Demandes reçues <span className="count">{data.incoming.length}</span></h2>
          <div className="rows">
            {data.incoming.map((r) => (
              <div key={r.friendshipId} className="friend-row">
                <Avatar name={r.username} />
                <div>
                  <div style={{ fontWeight: 600 }}>{r.username}</div>
                  <div className="muted" style={{ fontSize: ".8rem" }}>{fmt(r.score)} pts/h · {r.factories} usine{r.factories > 1 ? "s" : ""}</div>
                </div>
                <div className="row-side">
                  <button className="btn btn-sm btn-primary" onClick={() => accept(r.friendshipId, r.username)}>Accepter</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => remove(r.friendshipId, "Demande refusée")}>Refuser</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2>Mes amis {data && <span className="count">{data.friends.length}</span>}</h2>
        {data && data.friends.length === 0 && <div className="empty">Pas encore d&apos;amis. Cherche un pseudo ci-dessus pour envoyer une demande.</div>}
        <div className="rows">
          {data?.friends.map((f) => (
            <div key={f.friendshipId} className="friend-row">
              <Avatar name={f.username} size={42} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, display: "flex", gap: 8, alignItems: "center" }}>
                  {f.username}
                </div>
                <div className="muted" style={{ fontSize: ".8rem" }}>
                  <b style={{ color: "var(--gold)" }}>{fmt(f.score)} pts/h</b> · {f.factories} usine{f.factories > 1 ? "s" : ""}
                  {f.best && <> · meilleure : {f.best.name} Nv. {f.best.level}</>}
                  {f.since && <> · amis depuis le {since(f.since)}</>}
                </div>
              </div>
              <div className="row-side">
                <Link className="btn btn-sm" href={`/messages?c=${encodeURIComponent(f.username)}`}>Écrire</Link>
                <Link className="btn btn-sm" href={`/echanges?ami=${encodeURIComponent(f.username)}`}>Échanger</Link>
                <button className="btn btn-sm btn-ghost btn-danger" onClick={() => remove(f.friendshipId, `${f.username} retiré de tes amis`, `Retirer ${f.username} de tes amis ?`)}>Retirer</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {data && data.outgoing.length > 0 && (
        <section className="section">
          <h2>Demandes envoyées <span className="count">{data.outgoing.length}</span></h2>
          <div className="rows">
            {data.outgoing.map((r) => (
              <div key={r.friendshipId} className="friend-row">
                <Avatar name={r.username} />
                <div>
                  <div style={{ fontWeight: 600 }}>{r.username}</div>
                  <div className="muted" style={{ fontSize: ".8rem" }}>En attente depuis le {since(r.createdAt)}</div>
                </div>
                <div className="row-side">
                  <button className="btn btn-sm btn-ghost" onClick={() => remove(r.friendshipId, "Demande annulée")}>Annuler</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
