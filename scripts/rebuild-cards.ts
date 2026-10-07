import "./load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { InStatement } from "@libsql/client";
import { db } from "../src/db";
import {
  assignRarities, BASE_VALUE, FACTORY_INTERVAL_SEC, factoryCapacity, YIELD_POINTS, type Rarity,
} from "../src/lib/game";
import { fetchOffPage, fetchOffProduct, MIN_GAP_MS, normalizeProduct, parsePages, type CleanProduct, type RawProduct } from "./import-off";
import { loadTaxonomy } from "./taxonomy";
import { CardResolver } from "./cards";
import { toCatalog } from "./catalog";

/*
 * Reconstruit le catalogue avec les cartes regroupées, en français, toutes illustrées,
 * et convertit les collections des joueurs.
 *   npm run cards:rebuild                 → simulation : bilan détaillé, rien n'est modifié
 *   npm run cards:rebuild -- --apply      → applique (une sauvegarde JSON est écrite dans data/ avant)
 *   options : --pages=1-10,20  (par défaut : OFF_SEED_PAGES ou la liste du seed)
 *
 * Conversion des joueurs (aucune pièce ni carte en plus, aucun remboursement) :
 *  - les offres en cours (ventes, enchères, demandes, échanges) sont annulées et leur contenu rendu à son
 *    propriétaire (cartes au vendeur, pièces bloquées à l'enchérisseur / au demandeur / à l'expéditeur) ;
 *  - chaque carte devient la carte regroupée (3 « Sel iodé » + 2 « Sel » = 5 « Sel ») ;
 *  - une carte, un produit ou une usine qui disparaît est supprimé, sans compensation ;
 *  - deux usines qui tombent sur la même carte : seule la plus haute est gardée ;
 *  - la production en attente des usines gardées n'est pas touchée (elle se récolte normalement).
 */

const DEFAULT_PAGES = "1-10,20,30,60,120";
const APPLY = process.argv.includes("--apply");
const pagesArg = process.argv.find((a) => a.startsWith("--pages="))?.slice("--pages=".length);

type Row = Record<string, unknown>;
const all = async (sql: string) => (await db.$client.execute(sql)).rows as unknown as Row[];
const ts = (v: unknown) => new Date(Number(v));
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function main() {
  const now = new Date();
  console.log(APPLY ? "Reconstruction du catalogue (APPLICATION)\n" : "Reconstruction du catalogue — SIMULATION (rien n'est modifié ; ajoute -- --apply pour appliquer)\n");

  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") }); // tables à jour (ingredient_aliases)

  // 1. Produits Open Food Facts : français, avec photo
  const tax = await loadTaxonomy(console.log);
  const spec = pagesArg ?? process.env.OFF_SEED_PAGES ?? DEFAULT_PAGES;
  const pages = parsePages(spec);
  const country = process.env.OFF_COUNTRY ?? "france";
  console.log(`Lecture de ${pages.length} page(s) Open Food Facts (une toutes les ${MIN_GAP_MS / 1000} s)…`);
  const raw: RawProduct[] = [];
  const failed: number[] = [];
  for (const [k, page] of pages.entries()) {
    try {
      const list = await fetchOffPage(page, country, console.log);
      raw.push(...list);
      console.log(`  [${k + 1}/${pages.length}] page ${page} : ${list.length} produits`);
    } catch (e) {
      failed.push(page);
      console.warn(`  [${k + 1}/${pages.length}] page ${page} : ÉCHEC — ${(e as Error).message}`);
    }
  }
  if (failed.length) console.warn(`  Pages non reçues : ${failed.join(", ")} (Open Food Facts surchargé) — sans gravité : seuls des produits nouveaux manqueront.`);

  // Produits déjà en base absents des pages reçues : récupérés un par un par leur code-barres
  const have = new Set(raw.map((p) => p.code));
  const missing = (await all("select code from products")).map((r) => String(r.code)).filter((c) => !have.has(c));
  if (missing.length) {
    console.log(`Récupération de ${missing.length} produit(s) déjà en base, un par un (≈ ${Math.ceil(missing.length * 0.8 / 60)} min ; ceux déjà reçus sont gardés dans data/off-products)…`);
    const lost: string[] = [];
    for (const [k, code] of missing.entries()) {
      try {
        const p = await fetchOffProduct(code, console.log);
        if (p) raw.push(p);
      } catch (e) {
        lost.push(code);
        console.warn(`  ${code} : ÉCHEC — ${(e as Error).message}`);
      }
      if ((k + 1) % 50 === 0) console.log(`  ${k + 1}/${missing.length}`);
    }
    if (lost.length)
      throw new Error(`${lost.length} produit(s) non reçus (Open Food Facts surchargé). Rien n'a été modifié. Relance la même commande plus tard : tout ce qui a déjà été reçu est gardé et ne sera pas redemandé.`);
  }
  const fresh = [...new Map(raw.map((p) => normalizeProduct(p, true)).filter((p): p is CleanProduct => !!p).map((p) => [p.code, p])).values()];
  console.log(`${raw.length} produits reçus, ${fresh.length} en français avec photo.\n`);

  // 2. État actuel de la base
  const [users, oldIngs, oldProds, userIngs, userProds, factories, pFactories, listings, auctions, requests, trades, tradeItems] = await Promise.all([
    all("select id, username, coins from users"),
    all("select id, name, rarity from ingredients"),
    all("select code, name, rarity from products"),
    all("select user_id, ingredient_id, quantity from user_ingredients where quantity > 0"),
    all("select user_id, product_code, quantity from user_products where quantity > 0"),
    all("select * from factories"),
    all("select * from product_factories"),
    all("select * from listings where status = 'OPEN'"),
    all("select * from auctions where status = 'OPEN'"),
    all("select * from buy_requests where status = 'OPEN'"),
    all("select * from trades where status = 'PENDING'"),
    all("select ti.* from trade_items ti join trades t on t.id = ti.trade_id where t.status = 'PENDING' and ti.side = 'OFFER'"),
  ]);

  // 3. Cartes : regroupement + photos (ingrédients des nouveaux produits et ceux que possèdent les joueurs)
  console.log("Regroupement des ingrédients et recherche des photos…");
  const resolver = new CardResolver(tax, undefined, console.log);
  const res = await resolver.resolve([...fresh.flatMap((p) => p.ingredients.map((i) => i.id)), ...oldIngs.map((i) => String(i.id))]);
  const { products, cards } = toCatalog(fresh, res);
  const used = new Set(products.flatMap((p) => p.cards));
  for (const id of [...cards.keys()]) if (!used.has(id)) cards.delete(id);
  // Une carte actuelle qui reste au catalogue garde son identité (stabilité d'un passage à l'autre)
  for (const i of oldIngs) { const id = String(i.id); if (used.has(id)) res.set(id, { card: cards.get(id)!, reason: null }); }
  const cardOf = (oldId: string) => { const c = res.get(oldId)?.card; return c && used.has(c.id) ? c.id : null; };

  // Raretés recalculées comme d'habitude (popularité = scans des produits qui contiennent la carte)
  const pop = new Map<string, number>();
  for (const p of products) for (const c of p.cards) pop.set(c, (pop.get(c) ?? 0) + p.popularity + 1);
  const ingItems = [...cards.keys()].map((id) => ({ id, popularity: pop.get(id) ?? 0 }));
  const ingRarity = new Map([...assignRarities(ingItems)].map(([k, v]) => [k.id, v]));
  const prodRarity = new Map([...assignRarities(products, "popular-rare")].map(([k, v]) => [k.code, v]));
  const newCodes = new Set(products.map((p) => p.code));
  const recipe = new Map(products.map((p) => [p.code, p.cards]));

  // 4. Joueurs : on rend d'abord tout ce qui est en séquestre
  const inv = new Map<string, Map<string, number>>();
  const pinv = new Map<string, Map<string, number>>();
  const coins = new Map<string, number>();
  const add = (m: Map<string, Map<string, number>>, u: string, k: string, q: number) => { const x = m.get(u) ?? new Map(); x.set(k, (x.get(k) ?? 0) + q); m.set(u, x); };
  const pay = (u: string, n: number) => coins.set(u, (coins.get(u) ?? 0) + n);
  type Report = { cartesAvant: number; cartesApres: number; cartesSupprimees: number; produitsSupprimes: number; usinesSupprimees: number; pieces: number };
  const report = new Map<string, Report>(users.map((u) => [String(u.id), { cartesAvant: 0, cartesApres: 0, cartesSupprimees: 0, produitsSupprimes: 0, usinesSupprimees: 0, pieces: 0 }]));
  const rep = (u: string) => report.get(u)!;

  for (const r of userIngs) add(inv, String(r.user_id), String(r.ingredient_id), Number(r.quantity));
  for (const r of userProds) add(pinv, String(r.user_id), String(r.product_code), Number(r.quantity));
  for (const l of listings) add(inv, String(l.seller_id), String(l.ingredient_id), Number(l.quantity));
  for (const a of auctions) {
    add(inv, String(a.seller_id), String(a.ingredient_id), Number(a.quantity));
    if (a.leader_id && a.current_bid != null) pay(String(a.leader_id), Number(a.current_bid));
  }
  for (const b of requests) pay(String(b.requester_id), (Number(b.quantity) - Number(b.filled)) * Number(b.unit_price));
  const tradeFrom = new Map(trades.map((t) => [String(t.id), String(t.from_user_id)]));
  for (const t of trades) pay(String(t.from_user_id), Number(t.offer_coins));
  for (const it of tradeItems) add(it.kind === "PRODUCT" ? pinv : inv, tradeFrom.get(String(it.trade_id))!, String(it.ref_id), Number(it.quantity));

  // 5. Conversion des cartes
  const newInv = new Map<string, Map<string, number>>();
  for (const [u, m] of inv)
    for (const [ing, q] of m) {
      rep(u).cartesAvant += q;
      const card = cardOf(ing);
      if (card) { add(newInv, u, card, q); rep(u).cartesApres += q; }
      else rep(u).cartesSupprimees += q;
    }
  const newPinv = new Map<string, Map<string, number>>();
  for (const [u, m] of pinv)
    for (const [code, q] of m) {
      if (newCodes.has(code)) add(newPinv, u, code, q);
      else rep(u).produitsSupprimes += q;
    }

  // Usines : une seule par carte
  const keptFactories: { id: string; card: string; level: number }[] = [];
  const removedFactories: string[] = [];
  const byUserCard = new Map<string, Row[]>();
  for (const f of factories) {
    const card = cardOf(String(f.ingredient_id));
    if (!card) {
      removedFactories.push(String(f.id));
      rep(String(f.user_id)).usinesSupprimees++;
      continue;
    }
    const key = `${f.user_id}|${card}`;
    byUserCard.set(key, [...(byUserCard.get(key) ?? []), f]);
  }
  for (const [key, list] of byUserCard) {
    const card = key.split("|")[1];
    list.sort((a, b) => Number(b.level) - Number(a.level) || Number(a.created_at) - Number(b.created_at));
    keptFactories.push({ id: String(list[0].id), card, level: Number(list[0].level) });
    for (const f of list.slice(1)) {
      removedFactories.push(String(f.id));
      rep(String(f.user_id)).usinesSupprimees++;
    }
  }
  const keptPF: { id: string; points: number }[] = [];
  const removedPF: string[] = [];
  for (const f of pFactories) {
    const code = String(f.product_code);
    if (!newCodes.has(code)) {
      removedPF.push(String(f.id));
      rep(String(f.user_id)).usinesSupprimees++;
    } else keptPF.push({ id: String(f.id), points: recipe.get(code)!.reduce((n, c) => n + YIELD_POINTS[ingRarity.get(c) ?? "COMMON"], 0) });
  }
  for (const [u, n] of coins) rep(u).pieces = n;

  // 6. Bilan
  const withPhotoBefore = (await all("select count(*) n from ingredients where image_url is not null"))[0].n;
  console.log("\n══════════ Bilan ══════════");
  console.log(`Cartes ingrédients : ${oldIngs.length} (dont ${withPhotoBefore} avec photo) → ${cards.size}, toutes avec photo et nom français`);
  console.log(`Produits : ${oldProds.length} → ${products.length} (${oldProds.filter((p) => !newCodes.has(String(p.code))).length} retirés, ${products.filter((p) => !oldProds.some((o) => o.code === p.code)).length} nouveaux)`);
  const reasons = new Map<string, number>();
  for (const r of res.values()) if (!r.card) reasons.set(r.reason ?? "?", (reasons.get(r.reason ?? "?") ?? 0) + 1);
  console.log(`Ingrédients OFF écartés : ${[...reasons].map(([k, v]) => `${k} ${v}`).join(", ") || "aucun"}`);
  const merged = new Map<string, string[]>();
  for (const i of oldIngs) { const c = cardOf(String(i.id)); if (c) merged.set(c, [...(merged.get(c) ?? []), String(i.name)]); }
  const examples = [...merged].filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length).slice(0, 12);
  if (examples.length) console.log("Exemples de regroupements :\n" + examples.map(([c, v]) => `  ${cards.get(c)!.name} ← ${v.join(", ")}`).join("\n"));
  console.log(`Annulés et rendus : ${listings.length} ventes, ${auctions.length} enchères, ${requests.length} demandes, ${trades.length} échanges.`);
  console.log("\nJoueurs :");
  for (const u of users) {
    const r = rep(String(u.id));
    if (!r.cartesAvant && !r.pieces && !r.usinesSupprimees) continue;
    console.log(`  ${u.username} : ${r.cartesAvant} cartes → ${r.cartesApres}${r.cartesSupprimees ? `, ${r.cartesSupprimees} cartes supprimées` : ""}${r.produitsSupprimes ? `, ${r.produitsSupprimes} produits supprimés` : ""}${r.usinesSupprimees ? `, ${r.usinesSupprimees} usine(s) supprimée(s)` : ""}${r.pieces ? `, ${r.pieces} pièces bloquées rendues` : ""}`);
  }
  if (!APPLY) { console.log("\nSimulation terminée. Pour appliquer : npm run cards:rebuild -- --apply"); return; }

  // 7. Sauvegarde avant modification
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  const backupFile = join(process.cwd(), "data", `sauvegarde-${now.toISOString().replace(/[:.]/g, "-")}.json`);
  const dump: Record<string, Row[]> = {};
  for (const t of ["users", "ingredients", "products", "product_ingredients", "user_ingredients", "user_products", "factories", "product_factories", "listings", "auctions", "bids", "buy_requests", "trades", "trade_items"])
    dump[t] = await all(`select * from ${t}`);
  writeFileSync(backupFile, JSON.stringify(dump, (_, v) => (typeof v === "bigint" ? Number(v) : v)));
  console.log(`\nSauvegarde écrite : ${backupFile}`);

  // 8. Application en un seul lot (tout ou rien)
  const s: InStatement[] = [];
  const t = now.getTime();
  const inList = (ids: string[]) => ids.map(() => "?").join(",");
  // A. Correspondances
  s.push("delete from ingredient_aliases");
  for (const part of chunk([...res], 200))
    s.push({ sql: `insert into ingredient_aliases (raw_id, card_id, reason, updated_at) values ${part.map(() => "(?,?,?,?)").join(",")}`, args: part.flatMap(([raw, r]) => [raw, r.card && used.has(r.card.id) ? r.card.id : null, r.card ? (used.has(r.card.id) ? null : "hors-catalogue") : r.reason, t]) });
  // B-C. Nouvelles cartes et produits
  for (const part of chunk([...cards.values()], 150))
    s.push({ sql: `insert into ingredients (id, name, image_url, image_checked_at, popularity, rarity, base_value) values ${part.map(() => "(?,?,?,?,?,?,?)").join(",")}
      on conflict(id) do update set name = excluded.name, image_url = excluded.image_url, image_checked_at = excluded.image_checked_at, popularity = excluded.popularity, rarity = excluded.rarity, base_value = excluded.base_value`,
      args: part.flatMap((c) => [c.id, c.name, c.imageUrl, t, pop.get(c.id) ?? 0, ingRarity.get(c.id)!, BASE_VALUE[ingRarity.get(c.id)!]]) });
  for (const part of chunk(products, 150))
    s.push({ sql: `insert into products (code, name, brand, image_url, popularity, rarity) values ${part.map(() => "(?,?,?,?,?,?)").join(",")}
      on conflict(code) do update set name = excluded.name, brand = excluded.brand, image_url = excluded.image_url, popularity = excluded.popularity, rarity = excluded.rarity`,
      args: part.flatMap((p) => [p.code, p.name, p.brand, p.imageUrl, p.popularity, prodRarity.get(p.code)!]) });
  // D. Offres en cours annulées (leur contenu a été rendu plus haut), quêtes et offres de la banque régénérées
  if (listings.length) s.push({ sql: `update listings set status = 'CANCELLED', closed_at = ? where id in (${inList(listings.map((l) => String(l.id)))})`, args: [t, ...listings.map((l) => String(l.id))] });
  if (auctions.length) s.push({ sql: `update auctions set status = 'EXPIRED', leader_id = null, current_bid = null where id in (${inList(auctions.map((a) => String(a.id)))})`, args: auctions.map((a) => String(a.id)) });
  if (requests.length) s.push({ sql: `update buy_requests set status = 'CANCELLED', closed_at = ? where id in (${inList(requests.map((r) => String(r.id)))})`, args: [t, ...requests.map((r) => String(r.id))] });
  if (trades.length) s.push({ sql: `update trades set status = 'CANCELLED', closed_at = ? where id in (${inList(trades.map((x) => String(x.id)))})`, args: [t, ...trades.map((x) => String(x.id))] });
  s.push("delete from chef_deliveries", "delete from chef_quests", "delete from bank_purchases", "delete from bank_offers");
  // E. Historique du marché : rattaché à la nouvelle carte, ou effacé si la carte disparaît
  for (const table of ["listings", "auctions", "buy_requests"])
    s.push(`update ${table} set ingredient_id = (select card_id from ingredient_aliases a where a.raw_id = ${table}.ingredient_id)
      where ingredient_id in (select raw_id from ingredient_aliases where card_id is not null and card_id != raw_id)`);
  s.push(`update trade_items set ref_id = (select card_id from ingredient_aliases a where a.raw_id = trade_items.ref_id)
    where kind = 'INGREDIENT' and ref_id in (select raw_id from ingredient_aliases where card_id is not null and card_id != raw_id)`);
  const keep = "(select card_id from ingredient_aliases where card_id is not null)";
  s.push(`delete from bids where auction_id in (select id from auctions where ingredient_id not in ${keep})`);
  for (const table of ["listings", "auctions", "buy_requests"]) s.push(`delete from ${table} where ingredient_id not in ${keep}`);
  // F. Collections
  s.push("delete from user_ingredients");
  const invRows = [...newInv].flatMap(([u, m]) => [...m].filter(([, q]) => q > 0).map(([c, q]) => [u, c, q]));
  for (const part of chunk(invRows, 300)) s.push({ sql: `insert into user_ingredients (user_id, ingredient_id, quantity) values ${part.map(() => "(?,?,?)").join(",")}`, args: part.flat() });
  // G-H. Usines
  if (removedFactories.length) s.push({ sql: `delete from factories where id in (${inList(removedFactories)})`, args: removedFactories });
  for (const f of keptFactories)
    s.push({ sql: "update factories set ingredient_id = ?, interval_sec = ?, capacity = ? where id = ?", args: [f.card, FACTORY_INTERVAL_SEC[ingRarity.get(f.card)!], factoryCapacity(f.level), f.id] });
  if (removedPF.length) s.push({ sql: `delete from product_factories where id in (${inList(removedPF)})`, args: removedPF });
  for (const f of keptPF) s.push({ sql: "update product_factories set points = ? where id = ?", args: [f.points, f.id] });
  // I. Produits possédés
  s.push("delete from user_products");
  const pRows = [...newPinv].flatMap(([u, m]) => [...m].filter(([, q]) => q > 0).map(([c, q]) => [u, c, q]));
  for (const part of chunk(pRows, 300)) s.push({ sql: `insert into user_products (user_id, product_code, quantity) values ${part.map(() => "(?,?,?)").join(",")}`, args: part.flat() });
  // J. Pièces bloquées rendues (enchères, demandes, échanges en cours)
  for (const [u, n] of coins) if (n) s.push({ sql: "update users set coins = coins + ? where id = ?", args: [n, u] });
  // K-L. Recettes, puis suppression de l'ancien catalogue
  s.push("delete from product_ingredients");
  const links = products.flatMap((p) => p.cards.map((c) => [p.code, c]));
  for (const part of chunk(links, 300)) s.push({ sql: `insert into product_ingredients (product_code, ingredient_id) values ${part.map(() => "(?,?)").join(",")}`, args: part.flat() });
  const codes = [...newCodes];
  s.push({ sql: `delete from products where code not in (${inList(codes)})`, args: codes });
  const cardIds = [...cards.keys()];
  s.push({ sql: `delete from ingredients where id not in (${inList(cardIds)})`, args: cardIds });

  console.log(`Application (${s.length} opérations en un seul lot)…`);
  await db.$client.batch(s, "write");
  console.log("Terminé. Les joueurs retrouvent leurs cartes converties ; la sauvegarde permet de revenir en arrière si besoin.");
}

main().catch((e) => { console.error(`\nÉchec : ${(e as Error).message}`); process.exit(1); });
