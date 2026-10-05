"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "./ui";
import { Logo } from "./decor";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/auth/${mode}`, { body: { username, password } });
      router.push("/boosters");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth-box" onSubmit={submit}>
        <div className="logo auth-logo"><Logo size={64} /></div>
        <p className="tagline">Collectionnez les ingrédients</p>
        <div style={{ display: "grid", gap: 14 }}>
          <label className="field">Pseudo
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={20} />
          </label>
          <label className="field">Mot de passe
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 8 : 1} />
          </label>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary" disabled={busy}>{mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
        </div>
        <p className="muted" style={{ textAlign: "center", margin: 0, fontSize: ".9rem" }}>
          {mode === "login" ? <>Pas encore de compte ? <Link href="/signup">Inscription</Link></> : <>Déjà inscrit ? <Link href="/login">Connexion</Link></>}
        </p>
      </form>
    </div>
  );
}
