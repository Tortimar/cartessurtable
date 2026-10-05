import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = () => new Date();

// Rareté stockée en texte : COMMON | UNCOMMON | RARE | EPIC | LEGENDARY

export const users = sqliteTable("users", {
  id: id(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  coins: integer("coins").notNull().default(500),
  // Boosters : stock à l'instant lastBoosterAt ; la recharge (+1 toutes les 10 min, max 10) est calculée à la volée
  boosterStock: integer("booster_stock").notNull().default(10),
  lastBoosterAt: ts("last_booster_at").notNull().$defaultFn(now),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const ingredients = sqliteTable("ingredients", {
  id: text("id").primaryKey(), // identifiant taxonomie OFF, ex. "en:sugar"
  name: text("name").notNull(),
  popularity: integer("popularity").notNull().default(0), // somme des scans OFF des produits qui le contiennent
  rarity: text("rarity").notNull().default("COMMON"),
  baseValue: integer("base_value").notNull().default(5), // valeur indicative (prix suggéré au marché)
  imageUrl: text("image_url"), // photo (Wikimedia Commons / Wikipédia), récupérée par scripts/fetch-images.ts
  imageCheckedAt: integer("image_checked_at", { mode: "timestamp_ms" }), // dernière recherche de photo
});

export const products = sqliteTable("products", {
  code: text("code").primaryKey(), // code-barres OFF
  name: text("name").notNull(),
  brand: text("brand"),
  imageUrl: text("image_url"),
  popularity: integer("popularity").notNull().default(0), // unique_scans_n côté OFF
  rarity: text("rarity").notNull().default("COMMON"),
});

export const productIngredients = sqliteTable(
  "product_ingredients",
  {
    productCode: text("product_code").notNull().references(() => products.code, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.productCode, t.ingredientId] }), index("pi_ingredient_idx").on(t.ingredientId)],
);

export const userIngredients = sqliteTable(
  "user_ingredients",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id").notNull().references(() => ingredients.id),
    quantity: integer("quantity").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.ingredientId] })],
);

export const userProducts = sqliteTable(
  "user_products",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productCode: text("product_code").notNull().references(() => products.code),
    quantity: integer("quantity").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productCode] })],
);

export const boosterOpenings = sqliteTable(
  "booster_openings",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    cards: text("cards").notNull(), // JSON : ids d'ingrédients tirés
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("bo_user_idx").on(t.userId, t.createdAt)],
);

// Vente à prix fixe (les cartes sont mises sous séquestre)
export const listings = sqliteTable(
  "listings",
  {
    id: id(),
    sellerId: text("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id").notNull().references(() => ingredients.id),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
    status: text("status").notNull().default("OPEN"), // OPEN | SOLD | CANCELLED
    buyerId: text("buyer_id").references(() => users.id),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    closedAt: ts("closed_at"),
  },
  (t) => [index("listing_status_idx").on(t.status, t.ingredientId)],
);

// Enchères : l'enchérisseur en tête a ses pièces bloquées, remboursées s'il est dépassé
export const auctions = sqliteTable(
  "auctions",
  {
    id: id(),
    sellerId: text("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id").notNull().references(() => ingredients.id),
    quantity: integer("quantity").notNull(),
    startPrice: integer("start_price").notNull(),
    currentBid: integer("current_bid"),
    leaderId: text("leader_id").references(() => users.id),
    endsAt: ts("ends_at").notNull(),
    status: text("status").notNull().default("OPEN"), // OPEN | SOLD | EXPIRED
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("auction_status_idx").on(t.status, t.endsAt)],
);

export const bids = sqliteTable(
  "bids",
  {
    id: id(),
    auctionId: text("auction_id").notNull().references(() => auctions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("bid_auction_idx").on(t.auctionId)],
);

// Usine : produit 1 ingrédient toutes les intervalSec secondes, stockage plafonné
export const factories = sqliteTable(
  "factories",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id").notNull().references(() => ingredients.id),
    intervalSec: integer("interval_sec").notNull(), // intervalle de base (niveau 1), selon la rareté
    level: integer("level").notNull().default(1),
    capacity: integer("capacity").notNull(),
    lastCollectedAt: ts("last_collected_at").notNull().$defaultFn(now),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("factory_user_idx").on(t.userId)],
);

// Relations (pour les requêtes db.query.*)
export const productsRelations = relations(products, ({ many }) => ({ ingredients: many(productIngredients) }));
export const ingredientsRelations = relations(ingredients, ({ many }) => ({ products: many(productIngredients) }));
export const productIngredientsRelations = relations(productIngredients, ({ one }) => ({
  product: one(products, { fields: [productIngredients.productCode], references: [products.code] }),
  ingredient: one(ingredients, { fields: [productIngredients.ingredientId], references: [ingredients.id] }),
}));
export const listingsRelations = relations(listings, ({ one }) => ({
  ingredient: one(ingredients, { fields: [listings.ingredientId], references: [ingredients.id] }),
  seller: one(users, { fields: [listings.sellerId], references: [users.id] }),
}));
export const auctionsRelations = relations(auctions, ({ one }) => ({
  ingredient: one(ingredients, { fields: [auctions.ingredientId], references: [ingredients.id] }),
  seller: one(users, { fields: [auctions.sellerId], references: [users.id], relationName: "seller" }),
  leader: one(users, { fields: [auctions.leaderId], references: [users.id], relationName: "leader" }),
}));
export const factoriesRelations = relations(factories, ({ one }) => ({
  ingredient: one(ingredients, { fields: [factories.ingredientId], references: [ingredients.id] }),
}));
export const userIngredientsRelations = relations(userIngredients, ({ one }) => ({
  ingredient: one(ingredients, { fields: [userIngredients.ingredientId], references: [ingredients.id] }),
}));
export const userProductsRelations = relations(userProducts, ({ one }) => ({
  product: one(products, { fields: [userProducts.productCode], references: [products.code] }),
}));

// Amitiés : une ligne par demande ; « ACCEPTED » = amis dans les deux sens
export const friendships = sqliteTable(
  "friendships",
  {
    id: id(),
    requesterId: text("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("PENDING"), // PENDING | ACCEPTED
    createdAt: ts("created_at").notNull().$defaultFn(now),
    acceptedAt: ts("accepted_at"),
  },
  (t) => [uniqueIndex("friend_pair_idx").on(t.requesterId, t.addresseeId), index("friend_addressee_idx").on(t.addresseeId, t.status)],
);

// Usine de produits : née de la fusion d'usines d'ingrédients, elle fabrique un produit en continu
export const productFactories = sqliteTable(
  "product_factories",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productCode: text("product_code").notNull().references(() => products.code),
    intervalSec: integer("interval_sec").notNull(), // intervalle au niveau 1, fixé à la construction
    points: integer("points").notNull(), // points de rendement par produit (somme des points de ses ingrédients)
    level: integer("level").notNull().default(1),
    lastCollectedAt: ts("last_collected_at").notNull().$defaultFn(now),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("pfactory_user_idx").on(t.userId)],
);

// Échanges entre amis : ce que propose l'expéditeur est mis sous séquestre jusqu'à la réponse
export const trades = sqliteTable(
  "trades",
  {
    id: id(),
    fromUserId: text("from_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("PENDING"), // PENDING | ACCEPTED | DECLINED | CANCELLED
    offerCoins: integer("offer_coins").notNull().default(0),
    requestCoins: integer("request_coins").notNull().default(0),
    message: text("message"),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    closedAt: ts("closed_at"),
  },
  (t) => [index("trade_to_idx").on(t.toUserId, t.status), index("trade_from_idx").on(t.fromUserId, t.status)],
);

export const tradeItems = sqliteTable(
  "trade_items",
  {
    id: id(),
    tradeId: text("trade_id").notNull().references(() => trades.id, { onDelete: "cascade" }),
    side: text("side").notNull(), // OFFER (donné par l'expéditeur) | REQUEST (demandé au destinataire)
    kind: text("kind").notNull(), // INGREDIENT | PRODUCT
    refId: text("ref_id").notNull(), // id d'ingrédient ou code produit
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("trade_items_trade_idx").on(t.tradeId)],
);
