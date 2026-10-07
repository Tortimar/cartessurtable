"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, Avatar, Modal, SocialTabs, useGame } from "@/components/ui";

type GuildRow = { id: string; name: string; tag: string; description: string | null; members: number; maxMembers: number; score: number; rank: number; mine: boolean };
type Member = { id: string; username: string; joinedAt: string; leader: boolean; me: boolean; score: number };
type Detail = { guild: { id: string; name: string; tag: string; description: string | null; createdAt: string; maxMembers: number }; members: Member[]; score: number; isMember: boolean; isLeader: boolean; inOtherGuild: boolean };

const fmt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

export default function GuildsPage() {
  const { run, toast } = useGame();
  const [list, setList] = useState<{ guilds: GuildRow[]; myGuildId: string | null } | null>(null);
  const [mine, setMine] = useState<Detail | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const l = await api<{ guilds: GuildRow[]; myGuildId: string | null }>("/api/guilds");
      setList(l);
      setMine(l.myGuildId ? await api<Detail>(`/api/guilds/${l.myGuildId}`) : null);
    } catch (e) { toast((e as Error).message, "error"); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const join = async (g: GuildRow | Detail["guild"]) => {
    const ok = await run(() => api(`/api/guilds/${g.id}/join`, { method: "POST" }), `Bienvenue dans ${g.name} !`);
    if (ok !== undefined) { setViewing(null); load(); }
  };
  const leave = async () => {
    if (!mine) return;
    const last = mine.members.length === 1;
    if (!confirm(last ? `Tu es le dernier membre : ${mine.guild.name} sera dissoute. Continuer ?` : `Quitter ${mine.guild.name} ?`)) return;
    await run(() => api("/api/guilds/leave", { method: "POST" }), last ? "Guilde dissoute" : "Tu as quitté la guilde");
    load();
  };
  const kick = async (m: Member) => {
    if (!confirm(`Exclure ${m.username} de la guilde ?`)) return;
    await run(() => api("/api/guilds/kick", { body: { userId: m.id } }), `${m.username} a été exclu`);
    load();
  };

  const myRow = list?.guilds.find((g) => g.mine);

  return (
    <>
      <SocialTabs />
      <div className="page-head">
        <div>
          <h1>Guildes</h1>
          <p>Rejoins une guilde (une seule à la fois) pour discuter avec ses membres et additionner vos rendements dans le classement des guildes.</p>
        </div>
        {list && !list.myGuildId && <button className="btn btn-primary" onClick={() => setCreating(true)}>Créer une guilde</button>}
      </div>

      {mine && (
        <section className="panel guild-home">
          <div className="guild-banner">
            <span className="guild-crest">{mine.guild.tag}</span>
            <div style={{ minWidth: 0 }}>
              <h2>{mine.guild.name} <span className="guild-tag">[{mine.guild.tag}]</span></h2>
              <div className="muted" style={{ fontSize: ".88rem" }}>
                {mine.members.length}/{mine.guild.maxMembers} membres · <b style={{ color: "var(--gold)" }}>{fmt(mine.score)} pts/h</b>{myRow && <> · {myRow.rank}<sup>{myRow.rank === 1 ? "re" : "e"}</sup> sur {list?.guilds.length}</>}
              </div>
            </div>
            <div className="guild-actions">
              <Link className="btn btn-primary" href="/messages?c=guilde">Chat de guilde</Link>
              <button className="btn btn-ghost btn-danger" onClick={leave}>Quitter</button>
            </div>
          </div>
          <Description detail={mine} onSaved={load} />
          <h3 style={{ margin: "14px 0 8px" }}>Membres</h3>
          <MemberList members={mine.members} canKick={mine.isLeader} onKick={kick} />
        </section>
      )}

      <section className="section">
        <h2>Classement des guildes {list && <span className="count">{list.guilds.length}</span>}</h2>
        {list && list.guilds.length === 0 && <div className="empty">Aucune guilde pour l&apos;instant. <button className="btn btn-sm btn-primary" style={{ marginLeft: 8 }} onClick={() => setCreating(true)}>Fonde la première</button></div>}
        <div className="rows">
          {list?.guilds.map((g) => (
            <div key={g.id} className={`row clickable ${g.mine ? "row-mine" : ""}`} role="button" tabIndex={0} onClick={() => setViewing(g.id)} onKeyDown={(e) => e.key === "Enter" && setViewing(g.id)}>
              <span className="guild-rank">{g.rank}</span>
              <div style={{ minWidth: 0 }}>
                <div className="row-title"><span className="guild-tag">[{g.tag}]</span> {g.name} {g.mine && <span className="tag me">Ta guilde</span>}</div>
                <div className="row-meta">{g.members}/{g.maxMembers} membres{g.description && <> · {g.description}</>}</div>
              </div>
              <div className="row-side">
                <span className="price">{fmt(g.score)} pts/h</span>
                {!list.myGuildId && (g.members < g.maxMembers
                  ? <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); join(g); }}>Rejoindre</button>
                  : <span className="tag">Complète</span>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {viewing && <GuildSheet id={viewing} onClose={() => setViewing(null)} onJoin={join} />}
      {creating && <CreateGuild onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </>
  );
}

function MemberList({ members, canKick, onKick }: { members: Member[]; canKick?: boolean; onKick?: (m: Member) => void }) {
  return (
    <div className="rows">
      {members.map((m) => (
        <div key={m.id} className="friend-row">
          <Avatar name={m.username} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {m.username} {m.leader && <span className="tag me">Chef</span>} {m.me && <span className="tag">Toi</span>}
            </div>
            <div className="muted" style={{ fontSize: ".8rem" }}><b style={{ color: "var(--gold)" }}>{fmt(m.score)} pts/h</b> · membre depuis le {new Date(m.joinedAt).toLocaleDateString("fr-FR")}</div>
          </div>
          <div className="row-side">
            {canKick && !m.me && <button className="btn btn-sm btn-ghost btn-danger" onClick={() => onKick?.(m)}>Exclure</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Description({ detail, onSaved }: { detail: Detail; onSaved: () => void }) {
  const { run } = useGame();
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(detail.guild.description ?? "");
  const save = async () => {
    const ok = await run(() => api("/api/guilds", { method: "PATCH", body: { description: text } }), "Description mise à jour");
    if (ok !== undefined) { setEdit(false); onSaved(); }
  };
  if (edit) return (
    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
      <textarea className="input" rows={2} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} placeholder="Présente ta guilde en une phrase…" />
      <div style={{ display: "flex", gap: 8 }}><button className="btn btn-sm btn-primary" onClick={save}>Enregistrer</button><button className="btn btn-sm btn-ghost" onClick={() => setEdit(false)}>Annuler</button></div>
    </div>
  );
  return (
    <p className="guild-desc">
      {detail.guild.description ?? <span className="muted">Pas encore de description.</span>}
      {detail.isLeader && <button className="btn btn-sm btn-ghost" onClick={() => setEdit(true)}>Modifier</button>}
    </p>
  );
}

function GuildSheet({ id, onClose, onJoin }: { id: string; onClose: () => void; onJoin: (g: Detail["guild"]) => void }) {
  const { toast } = useGame();
  const [d, setD] = useState<Detail | null>(null);
  useEffect(() => { api<Detail>(`/api/guilds/${id}`).then(setD).catch((e: Error) => toast(e.message, "error")); }, [id, toast]);
  return (
    <Modal title={d ? `${d.guild.name} [${d.guild.tag}]` : "Guilde"} onClose={onClose} wide>
      {!d ? <div className="muted">Chargement…</div> : (
        <>
          <div className="guild-banner">
            <span className="guild-crest">{d.guild.tag}</span>
            <div className="muted" style={{ fontSize: ".9rem" }}>
              {d.members.length}/{d.guild.maxMembers} membres · <b style={{ color: "var(--gold)" }}>{fmt(d.score)} pts/h</b> · fondée le {new Date(d.guild.createdAt).toLocaleDateString("fr-FR")}
              {d.guild.description && <div style={{ color: "var(--text)", marginTop: 4 }}>{d.guild.description}</div>}
            </div>
          </div>
          <MemberList members={d.members} />
          <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 0 }}>
            <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
            {!d.isMember && !d.inOtherGuild && <button className="btn btn-primary" disabled={d.members.length >= d.guild.maxMembers} onClick={() => onJoin(d.guild)}>{d.members.length >= d.guild.maxMembers ? "Guilde complète" : "Rejoindre"}</button>}
            {d.inOtherGuild && <span className="muted" style={{ fontSize: ".85rem" }}>Quitte ta guilde pour rejoindre celle-ci.</span>}
          </div>
        </>
      )}
    </Modal>
  );
}

function CreateGuild({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { run } = useGame();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const validTag = /^[A-Z0-9]{2,4}$/.test(tag);
  const submit = async () => {
    setBusy(true);
    const ok = await run(() => api("/api/guilds", { body: { name, tag, description } }), `Guilde ${name} [${tag}] fondée !`);
    setBusy(false);
    if (ok !== undefined) onCreated();
  };
  return (
    <Modal title="Créer une guilde" onClose={onClose}>
      <label className="field">Nom
        <input className="input" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Les Toqués du Fournil" autoFocus />
        <span className="hint">3 à 30 caractères.</span>
      </label>
      <label className="field">Blason
        <input className="input" maxLength={4} value={tag} onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="TOQ" style={{ textTransform: "uppercase", letterSpacing: ".1em" }} />
        <span className="hint">2 à 4 lettres ou chiffres, affichés à côté du pseudo de chaque membre : <span className="guild-tag">[{tag || "TOQ"}]</span></span>
      </label>
      <label className="field">Description (facultatif)
        <textarea className="input" rows={2} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ce que vous cherchez, votre ambiance…" />
      </label>
      <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: 0 }}>
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={busy || name.trim().length < 3 || !validTag} onClick={submit}>Fonder la guilde</button>
      </div>
    </Modal>
  );
}
