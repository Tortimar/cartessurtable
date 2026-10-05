import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession } from "@/lib/auth";
import { body, errorResponse, fail } from "@/lib/api";
import { STARTING_COINS } from "@/lib/game";

export async function POST(req: Request) {
  try {
    const { username, password } = await body<{ username?: string; password?: string }>(req);
    const name = (username ?? "").trim();
    if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(name)) fail("Pseudo : 3 à 20 caractères (lettres, chiffres, _ . -)");
    if (!password || password.length < 8) fail("Mot de passe : 8 caractères minimum");
    const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, name));
    if (existing) fail("Ce pseudo est déjà pris", 409);
    const [u] = await db
      .insert(schema.users)
      .values({ username: name, passwordHash: await bcrypt.hash(password, 10), coins: STARTING_COINS })
      .returning({ id: schema.users.id });
    await createSession(u.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
