"use client";

// Fil de discussion (général, guilde ou message privé) avec suivi en direct par sondage régulier.
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, Avatar, useGame } from "./ui";

export type ChatTarget = { channel: "global" | "guild" | "dm"; with?: string };
type Message = { id: string; body: string; createdAt: string; sender: string | null; tag: string | null; system: boolean; mine: boolean };

const POLL_MS = 3000;
const MAX = 500;

const time = (d: string) => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
function dayLabel(d: string) {
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  return day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export function ChatView({ target, placeholder, empty, onRead }: { target: ChatTarget; placeholder: string; empty: string; onRead?: () => void }) {
  const { toast, refreshMe } = useGame();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // l'utilisateur est en bas du fil : on suit les nouveaux messages
  const keepOffset = useRef<number | null>(null); // conserver la position après « Messages précédents »

  const query = useCallback((extra: Record<string, string>) => {
    const p = new URLSearchParams({ channel: target.channel, ...(target.with ? { with: target.with } : {}), ...extra });
    return `/api/chat?${p}`;
  }, [target.channel, target.with]);

  // Chargement initial du canal
  useEffect(() => {
    let alive = true;
    setMessages(null);
    stick.current = true;
    api<{ messages: Message[]; hasMore: boolean }>(query({}))
      .then((r) => { if (!alive) return; setMessages(r.messages); setHasMore(r.hasMore); refreshMe(); onRead?.(); })
      .catch((e: Error) => toast(e.message, "error"));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const merge = useCallback((incoming: Message[]) => {
    setMessages((cur) => {
      if (!cur) return incoming;
      const seen = new Set(cur.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      return fresh.length ? [...cur, ...fresh] : cur;
    });
  }, []);

  // Nouveaux messages toutes les 3 s (seulement quand l'onglet est visible)
  const lastAt = messages?.length ? messages[messages.length - 1].createdAt : null;
  const poll = useCallback(async () => {
    if (!messages || document.hidden) return;
    try {
      const r = await api<{ messages: Message[] }>(query(lastAt ? { after: lastAt } : {}));
      const seen = new Set(messages.map((m) => m.id));
      merge(r.messages);
      if (r.messages.some((m) => !m.mine && !seen.has(m.id))) onRead?.(); // nouveaux messages des autres : liste des conversations à jour
    } catch { /* réseau momentanément indisponible : on réessaiera */ }
  }, [messages, lastAt, query, merge, onRead]);
  useEffect(() => { const t = setInterval(poll, POLL_MS); return () => clearInterval(t); }, [poll]);

  // Défilement : en bas au chargement et à l'arrivée de messages si on y était déjà
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !messages) return;
    if (keepOffset.current != null) { el.scrollTop = el.scrollHeight - keepOffset.current; keepOffset.current = null; return; }
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  const onScroll = () => {
    const el = box.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const older = async () => {
    if (!messages?.length) return;
    const el = box.current;
    keepOffset.current = el ? el.scrollHeight - el.scrollTop : null;
    const r = await api<{ messages: Message[]; hasMore: boolean }>(query({ before: messages[0].createdAt }));
    setHasMore(r.hasMore);
    setMessages((cur) => [...r.messages.filter((m) => !cur?.some((c) => c.id === m.id)), ...(cur ?? [])]);
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await api("/api/chat", { body: { channel: target.channel, with: target.with, body } });
      setText("");
      stick.current = true;
      const r = await api<{ messages: Message[] }>(query(lastAt ? { after: lastAt } : {}));
      merge(r.messages);
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setSending(false);
  };

  return (
    <div className="chat">
      <div className="chat-log" ref={box} onScroll={onScroll} aria-live="polite">
        {hasMore && <div className="chat-more"><button className="btn btn-sm btn-ghost" onClick={older}>Messages précédents</button></div>}
        {messages === null && <div className="muted chat-empty">Chargement…</div>}
        {messages?.length === 0 && <div className="muted chat-empty">{empty}</div>}
        {messages?.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
          const grouped = !newDay && prev && !prev.system && !m.system && prev.sender === m.sender && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          return (
            <Fragment key={m.id}>
              {newDay && <div className="chat-day"><span>{dayLabel(m.createdAt)}</span></div>}
              {m.system ? (
                <div className="chat-system">{m.body} <span className="chat-time">{time(m.createdAt)}</span></div>
              ) : (
                <div className={`chat-msg ${m.mine ? "mine" : ""} ${grouped ? "grouped" : ""}`}>
                  {!m.mine && <div className="chat-avatar">{!grouped && <Avatar name={m.sender ?? "?"} size={30} />}</div>}
                  <div className="chat-bubble-wrap">
                    {!grouped && !m.mine && (
                      <div className="chat-author">{m.tag && <span className="guild-tag">[{m.tag}]</span>} {m.sender}</div>
                    )}
                    <div className="chat-bubble" title={new Date(m.createdAt).toLocaleString("fr-FR")}>
                      {m.body}
                      <span className="chat-time">{time(m.createdAt)}</span>
                    </div>
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          className="input"
          rows={1}
          maxLength={MAX}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          aria-label="Message"
        />
        <button className="btn btn-primary" disabled={!text.trim() || sending}>Envoyer</button>
        {text.length > MAX - 80 && <span className="chat-count">{text.length}/{MAX}</span>}
      </form>
    </div>
  );
}
