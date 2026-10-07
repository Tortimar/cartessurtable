"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, Avatar, useGame } from "@/components/ui";
import { ChatView, type ChatTarget } from "@/components/ChatView";
import { NAV_ICONS } from "@/components/icons";

type Preview = { body: string; createdAt: string; mine: boolean } | null;
type Conversations = {
  global: { unread: number; last: Preview };
  guild: { id: string; name: string; tag: string; unread: number; last: Preview } | null;
  friends: { id: string; username: string; unread: number; last: Preview }[];
};
/** Conversation ouverte : « general », « guilde » ou l'identifiant d'un ami */
type Sel = "general" | "guilde" | string;

const when = (d: string) => {
  const t = new Date(d);
  return Date.now() - t.getTime() < 86_400_000 && t.getDate() === new Date().getDate()
    ? t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : t.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};
const badge = (n: number) => (n > 0 ? <span className="nav-badge">{n > 99 ? "99+" : n}</span> : null);

export default function MessagesPage() {
  const { toast } = useGame();
  const [conv, setConv] = useState<Conversations | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);

  const load = useCallback(() => api<Conversations>("/api/chat/conversations").then(setConv).catch((e: Error) => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);

  // Ouverture directe : /messages?c=general | guilde | <pseudo d'un ami>
  const [wanted, setWanted] = useState<string | null>(null);
  useEffect(() => { setWanted(new URLSearchParams(window.location.search).get("c")); }, []);
  useEffect(() => {
    if (!conv || sel) return;
    const desktop = window.matchMedia("(min-width: 761px)").matches;
    if (wanted === "guilde" && conv.guild) setSel("guilde");
    else if (wanted && wanted !== "general") { const f = conv.friends.find((x) => x.username.toLowerCase() === wanted.toLowerCase()); if (f) setSel(f.id); else if (desktop) setSel("general"); }
    else if (wanted === "general" || desktop) setSel("general");
  }, [conv, wanted, sel]);

  const open = (s: Sel) => { setSel(s); history.replaceState(null, "", `/messages?c=${encodeURIComponent(s === "general" || s === "guilde" ? s : conv?.friends.find((f) => f.id === s)?.username ?? "")}`); };

  const friend = sel && sel !== "general" && sel !== "guilde" ? conv?.friends.find((f) => f.id === sel) : undefined;
  const target: ChatTarget | null = sel === "general" ? { channel: "global" } : sel === "guilde" ? { channel: "guild" } : friend ? { channel: "dm", with: friend.id } : null;
  const title = sel === "general" ? "Chat général" : sel === "guilde" && conv?.guild ? `${conv.guild.name} [${conv.guild.tag}]` : friend?.username ?? "";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Messages</h1>
          <p>Discute avec tout le monde dans le chat général, avec ta guilde, ou en privé avec tes amis.</p>
        </div>
      </div>

      <div className={`messenger ${sel ? "has-sel" : ""}`}>
        <aside className="conv-list" aria-label="Conversations">
          <button className={`conv ${sel === "general" ? "on" : ""}`} onClick={() => open("general")}>
            <span className="conv-icon">{NAV_ICONS["/messages"]({ size: 20 })}</span>
            <span className="conv-main"><b>Chat général</b><span className="muted">{conv?.global.last ? conv.global.last.body : "Tous les joueurs"}</span></span>
            <span className="conv-side">{conv?.global.last && <small>{when(conv.global.last.createdAt)}</small>}{badge(conv?.global.unread ?? 0)}</span>
          </button>

          {conv?.guild ? (
            <button className={`conv ${sel === "guilde" ? "on" : ""}`} onClick={() => open("guilde")}>
              <span className="conv-icon guild">{NAV_ICONS["/guildes"]({ size: 20 })}</span>
              <span className="conv-main"><b>{conv.guild.name} <span className="guild-tag">[{conv.guild.tag}]</span></b><span className="muted">{conv.guild.last ? conv.guild.last.body : "Chat de ta guilde"}</span></span>
              <span className="conv-side">{conv.guild.last && <small>{when(conv.guild.last.createdAt)}</small>}{badge(conv.guild.unread)}</span>
            </button>
          ) : conv && (
            <Link className="conv conv-hint" href="/guildes">
              <span className="conv-icon guild">{NAV_ICONS["/guildes"]({ size: 20 })}</span>
              <span className="conv-main"><b>Pas encore de guilde</b><span className="muted">Rejoins-en une pour son chat</span></span>
            </Link>
          )}

          <div className="conv-title">Amis</div>
          {conv && conv.friends.length === 0 && <div className="muted conv-empty">Ajoute des amis pour leur écrire en privé. <Link href="/amis" style={{ color: "var(--accent)" }}>Amis</Link></div>}
          {conv?.friends.map((f) => (
            <button key={f.id} className={`conv ${sel === f.id ? "on" : ""} ${f.unread ? "unread" : ""}`} onClick={() => open(f.id)}>
              <Avatar name={f.username} size={34} />
              <span className="conv-main"><b>{f.username}</b><span className="muted">{f.last ? `${f.last.mine ? "Toi : " : ""}${f.last.body}` : "Pas encore de message"}</span></span>
              <span className="conv-side">{f.last && <small>{when(f.last.createdAt)}</small>}{badge(f.unread)}</span>
            </button>
          ))}
        </aside>

        <section className="conv-view">
          {target ? (
            <>
              <div className="conv-head">
                <button className="btn btn-sm btn-ghost conv-back" onClick={() => setSel(null)} aria-label="Retour aux conversations">←</button>
                <b>{title}</b>
                {sel === "general" && <span className="muted">Visible par tous les joueurs</span>}
                {sel === "guilde" && <Link href="/guildes" className="muted" style={{ marginLeft: "auto" }}>Voir la guilde</Link>}
              </div>
              <ChatView
                key={sel}
                target={target}
                onRead={load}
                placeholder={sel === "general" ? "Écris à tout le monde…" : sel === "guilde" ? "Écris à ta guilde…" : `Écris à ${title}…`}
                empty={sel === "general" ? "Personne n'a encore parlé. Lance la conversation !" : sel === "guilde" ? "Aucun message dans la guilde pour l'instant." : `Aucun message avec ${title}. Dis bonjour !`}
              />
            </>
          ) : (
            <div className="muted conv-placeholder">Choisis une conversation.</div>
          )}
        </section>
      </div>
    </>
  );
}
