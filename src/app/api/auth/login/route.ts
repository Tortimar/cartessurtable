import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession } from "@/lib/auth";
import { body, errorResponse, fail } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const { username, password } = await body<{ username?: string; password?: string }>(req);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.username, (username ?? "").trim()));
    if (!u || !password || !(await bcrypt.compare(password, u.passwordHash))) fail("Identifiants incorrects", 401);
    await createSession(u.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
