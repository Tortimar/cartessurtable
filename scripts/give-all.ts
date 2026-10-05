import "./load-env";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";

/**
 * Outil de test : ajoute N exemplaires (1 par défaut) de chaque ingrédient à un compte.
 *   npm run give-all -- MonPseudo
 *   npm run give-all -- MonPseudo 5
 */
async function main() {
  const [username, qtyArg] = process.argv.slice(2);
  if (!username) {
    console.error("Usage : npm run give-all -- <pseudo> [quantité]");
    process.exit(1);
  }
  const qty = qtyArg ? parseInt(qtyArg, 10) : 1;
  if (!Number.isInteger(qty) || qty < 1) {
    console.error("La quantité doit être un entier positif.");
    process.exit(1);
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  if (!user) {
    console.error(`Aucun compte « ${username} ». Crée-le d'abord sur le site.`);
    process.exit(1);
  }

  const ings = await db.select({ id: schema.ingredients.id }).from(schema.ingredients);
  const { userIngredients: ui } = schema;
  await db.transaction(async (tx) => {
    for (const { id } of ings) {
      await tx
        .insert(ui)
        .values({ userId: user.id, ingredientId: id, quantity: qty })
        .onConflictDoUpdate({ target: [ui.userId, ui.ingredientId], set: { quantity: sql`${ui.quantity} + ${qty}` } });
    }
  });
  console.log(`${username} a reçu ${qty} exemplaire(s) de chacun des ${ings.length} ingrédients.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
