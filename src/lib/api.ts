import "server-only";
import { NextResponse } from "next/server";
import { getUserId } from "./auth";

export class GameError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function fail(message: string, status = 400): never {
  throw new GameError(message, status);
}

type Handler<C> = (ctx: { userId: string; req: Request; params: C }) => Promise<unknown>;

/** Route authentifiée : renvoie du JSON, transforme les GameError en réponses propres. */
export function authed<C = Record<string, string>>(handler: Handler<C>) {
  return async (req: Request, ctx: { params: Promise<C> }) => {
    try {
      const userId = await getUserId();
      if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
      const data = await handler({ userId, req, params: await ctx.params });
      return NextResponse.json(data ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  // En développement, on renvoie la cause pour qu'elle s'affiche dans le message d'erreur du site
  const detail = process.env.NODE_ENV !== "production" && e instanceof Error ? ` : ${e.message}` : "";
  return NextResponse.json({ error: `Erreur serveur${detail}` }, { status: 500 });
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    fail("Corps de requête invalide");
  }
}

export function posInt(v: unknown, label: string, max = 1_000_000): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > max) fail(`${label} invalide`);
  return n;
}
