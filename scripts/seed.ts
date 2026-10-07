import "./load-env";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { fetchOffPage, ingredientNames, MIN_GAP_MS, normalizeProduct, parsePages, type CleanProduct, type RawProduct } from "./import-off";
import { recomputeRarities } from "./rarity";
import { loadTaxonomy } from "./taxonomy";
import { CardResolver } from "./cards";
import { aliasRows, resolveIngredients, saveCatalog, toCatalog } from "./catalog";

/*
 * Import des produits Open Food Facts.
 *   npm run db:seed                      → pages de OFF_SEED_PAGES (ou la liste par défaut)
 *   npm run db:seed -- --pages=10,30-35  → seulement ces pages (utile pour relancer celles qui ont échoué)
 *   npm run db:seed:offline              → jeu de démonstration, sans connexion
 * Chaque page est enregistrée dès qu'elle est reçue : un arrêt en cours de route ne fait rien perdre.
 * Relancer l'import ne crée pas de doublons (les produits existants sont mis à jour).
 */

const DEFAULT_PAGES = "1-10,20,30,60,120";
const offline = process.argv.includes("--offline");
const pagesArg = process.argv.find((a) => a.startsWith("--pages="))?.slice("--pages=".length);

/** Enregistre un lot de produits (et leurs nouveaux ingrédients) dans une transaction. */
async function saveProducts(prods: CleanProduct[]) {
  const names = ingredientNames(prods);
  await db.transaction(async (tx) => {
    // Un ingrédient déjà connu garde son nom : seuls les nouveaux sont ajoutés
    for (const [id, name] of names) await tx.insert(schema.ingredients).values({ id, name }).onConflictDoNothing();
    for (const p of prods) {
      const data = { name: p.name, brand: p.brand, imageUrl: p.imageUrl, popularity: p.popularity };
      await tx.insert(schema.products).values({ code: p.code, ...data }).onConflictDoUpdate({ target: schema.products.code, set: data });
      await tx.delete(schema.productIngredients).where(eq(schema.productIngredients.productCode, p.code));
      await tx.insert(schema.productIngredients).values(p.ingredients.map((i) => ({ productCode: p.code, ingredientId: i.id })));
    }
  });
}

async function countProducts() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.products);
  return n;
}

function fromSample(): CleanProduct[] {
  const raw = JSON.parse(readFileSync(join(__dirname, "sample-products.json"), "utf8")) as RawProduct[];
  return raw.map((p) => normalizeProduct(p, false)).filter((p): p is CleanProduct => p !== null);
}

async function importFromOff() {
  const spec = pagesArg ?? process.env.OFF_SEED_PAGES ?? DEFAULT_PAGES;
  const pages = parsePages(spec);
  const country = process.env.OFF_COUNTRY ?? "france";
  if (pages.length === 0) throw new Error(`Liste de pages invalide : « ${spec} »`);

  const minutes = Math.ceil((pages.length * MIN_GAP_MS) / 60_000);
  console.log(`Import de ${pages.length} page(s) Open Food Facts (${country}) : ${pages.join(", ")}`);
  console.log(`Une page toutes les ${MIN_GAP_MS / 1000} s pour respecter la limite de l'API : environ ${minutes} min, davantage si l'API ralentit.\n`);

  const tax = await loadTaxonomy(console.log);
  const resolver = new CardResolver(tax);
  const ok: number[] = [];
  const failed: { page: number; reason: string }[] = [];
  const empty: number[] = [];
  let saved = 0;

  for (const [k, page] of pages.entries()) {
    const label = `[${k + 1}/${pages.length}] page ${page}`;
    try {
      const raw = await fetchOffPage(page, country, console.log);
      if (raw.length === 0) {
        empty.push(page);
        console.log(`${label} : vide (plus de résultats à cette profondeur)`);
        continue;
      }
      // Produits en français avec photo ; ingrédients regroupés en cartes illustrées
      const prods = raw.map((p) => normalizeProduct(p, true)).filter((p): p is CleanProduct => p !== null);
      const res = await resolveIngredients(prods.flatMap((p) => p.ingredients.map((i) => i.id)), resolver, true);
      const { products, cards } = toCatalog(prods, res);
      if (products.length) await saveCatalog(products, cards, aliasRows(res));
      saved += products.length;
      ok.push(page);
      console.log(`${label} : ${raw.length} reçus, ${products.length} retenus (produits en base : ${await countProducts()})`);
    } catch (e) {
      failed.push({ page, reason: (e as Error).message });
      console.warn(`${label} : ÉCHEC — ${(e as Error).message}`);
    }
  }

  console.log(`\nBilan : ${ok.length} page(s) importée(s), ${saved} produits enregistrés ou mis à jour.`);
  if (empty.length) console.log(`Pages vides (rien à cette profondeur) : ${empty.join(", ")}`);
  if (failed.length) {
    console.warn(`Pages en échec : ${failed.map((f) => f.page).join(", ")}`);
    console.warn(`Pour les relancer plus tard : npm run db:seed -- --pages=${failed.map((f) => f.page).join(",")}`);
  }
  return { ok, failed };
}

async function main() {
  if (offline) {
    console.log("Mode hors ligne : jeu de démonstration.");
    await saveProducts(fromSample());
  } else {
    const { ok } = await importFromOff();
    if (ok.length === 0 && (await countProducts()) === 0) {
      console.warn("\nAucune page n'a pu être importée et la base est vide : chargement du jeu de démonstration.");
      await saveProducts(fromSample());
    }
  }

  console.log("\nCalcul des raretés…");
  console.log("Répartition des ingrédients :", await recomputeRarities());
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.products);
  const [{ i }] = await db.select({ i: sql<number>`count(*)` }).from(schema.ingredients);
  console.log(`${n} produits et ${i} ingrédients en base.`);

  if (offline) console.log("Photos des ingrédients : lance « npm run images:fetch » une fois connecté.");
  console.log("Terminé.");
}

main().catch((e) => { console.error(e); process.exit(1); });
