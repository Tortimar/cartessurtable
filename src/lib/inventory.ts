import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { fail } from "./api";

const { userIngredients, userProducts, users } = schema;

export async function addIngredient(tx: Tx, userId: string, ingredientId: string, qty: number) {
  await tx
    .insert(userIngredients)
    .values({ userId, ingredientId, quantity: qty })
    .onConflictDoUpdate({
      target: [userIngredients.userId, userIngredients.ingredientId],
      set: { quantity: sql`${userIngredients.quantity} + ${qty}` },
    });
}

/** Retire des cartes ; échoue (et annule la transaction) si le stock est insuffisant. */
export async function takeIngredient(tx: Tx, userId: string, ingredientId: string, qty: number) {
  const rows = await tx
    .update(userIngredients)
    .set({ quantity: sql`${userIngredients.quantity} - ${qty}` })
    .where(and(eq(userIngredients.userId, userId), eq(userIngredients.ingredientId, ingredientId), gte(userIngredients.quantity, qty)))
    .returning({ q: userIngredients.quantity });
  if (rows.length === 0) fail("Pas assez de cartes de cet ingrédient");
}

export async function addProduct(tx: Tx, userId: string, productCode: string, qty: number) {
  await tx
    .insert(userProducts)
    .values({ userId, productCode, quantity: qty })
    .onConflictDoUpdate({
      target: [userProducts.userId, userProducts.productCode],
      set: { quantity: sql`${userProducts.quantity} + ${qty}` },
    });
}

export async function takeProduct(tx: Tx, userId: string, productCode: string, qty: number) {
  const rows = await tx
    .update(userProducts)
    .set({ quantity: sql`${userProducts.quantity} - ${qty}` })
    .where(and(eq(userProducts.userId, userId), eq(userProducts.productCode, productCode), gte(userProducts.quantity, qty)))
    .returning({ q: userProducts.quantity });
  if (rows.length === 0) fail("Pas assez de ce produit");
}

export async function addCoins(tx: Tx, userId: string, amount: number) {
  await tx.update(users).set({ coins: sql`${users.coins} + ${amount}` }).where(eq(users.id, userId));
}

/** Débite des pièces ; échoue si le solde est insuffisant. */
export async function takeCoins(tx: Tx, userId: string, amount: number) {
  const rows = await tx
    .update(users)
    .set({ coins: sql`${users.coins} - ${amount}` })
    .where(and(eq(users.id, userId), gte(users.coins, amount)))
    .returning({ c: users.coins });
  if (rows.length === 0) fail("Pas assez de pièces");
}
