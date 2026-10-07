// Règles du jeu — toutes les constantes d'équilibrage sont ici.

export const RARITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"] as const;
export type Rarity = (typeof RARITIES)[number];

// Mêmes paliers que WikiMasters
export const RARITY_LABEL: Record<Rarity, string> = {
  COMMON: "Commun",
  UNCOMMON: "Peu commun",
  RARE: "Rare",
  EPIC: "Super rare",
  LEGENDARY: "Légende",
};

/**
 * Répartition par rang de popularité (scans OFF) : les 50 % les plus scannés
 * sont communs, … les 3 % les moins scannés sont légendaires.
 * Les parts sont cumulées dans l'ordre COMMON → LEGENDARY.
 */
export const RARITY_SHARE: Record<Rarity, number> = {
  COMMON: 0.5,
  UNCOMMON: 0.25,
  RARE: 0.15,
  EPIC: 0.07,
  LEGENDARY: 0.03,
};

/** Probabilité de tirer chaque rareté pour une carte de booster. */
export const DROP_WEIGHT: Record<Rarity, number> = {
  COMMON: 60,
  UNCOMMON: 25,
  RARE: 10,
  EPIC: 4,
  LEGENDARY: 1,
};

/** Rachat immédiat par la banque, selon la rareté (ingrédients comme produits). */
export const BANK_BUYBACK: Record<Rarity, number> = {
  COMMON: 1,
  UNCOMMON: 5,
  RARE: 10,
  EPIC: 25,
  LEGENDARY: 50,
};
export const bankBuyback = (rarity: string) => BANK_BUYBACK[rarity as Rarity] ?? 1;

/** Valeur indicative par rareté : sert de prix suggéré quand on vend sur le marché. */
export const BASE_VALUE: Record<Rarity, number> = {
  COMMON: 5,
  UNCOMMON: 15,
  RARE: 50,
  EPIC: 150,
  LEGENDARY: 500,
};

/** Production des usines selon la rareté de l'ingrédient produit. */
export const FACTORY_INTERVAL_SEC: Record<Rarity, number> = {
  COMMON: 5 * 60,
  UNCOMMON: 15 * 60,
  RARE: 60 * 60,
  EPIC: 4 * 60 * 60,
  LEGENDARY: 12 * 60 * 60,
};
export const FACTORY_CAPACITY = 24;
/** Nombre de produits (contenant l'ingrédient) à sacrifier pour construire une usine. */
export const FACTORY_PRODUCT_COST = 3;

/* ───── Niveaux d'usine ───── */
export const FACTORY_MAX_LEVEL = 10;
/** Multiplicateur de vitesse : +25 % par niveau au-delà du premier (niveau 10 = ×3,25). */
export const factorySpeed = (level: number) => 1 + 0.25 * (level - 1);
/** Stock maximal : +6 cartes par niveau. */
export const factoryCapacity = (level: number) => FACTORY_CAPACITY + 6 * (level - 1);
/** Intervalle réel entre deux cartes, en secondes. */
export const factoryInterval = (baseSec: number, level: number) => Math.max(30, Math.round(baseSec / factorySpeed(level)));

const UPGRADE_RARITY_MULT: Record<Rarity, number> = { COMMON: 1, UNCOMMON: 1.5, RARE: 2, EPIC: 3, LEGENDARY: 4 };
/** Coût pour passer du niveau `level` au suivant : des pièces + des cartes de l'ingrédient produit. */
export function factoryUpgradeCost(level: number, rarity: Rarity) {
  return { coins: Math.round(40 * level * UPGRADE_RARITY_MULT[rarity]), cards: 2 * level };
}

/* ───── Rendement ───── */
/**
 * Points de rendement par carte produite, selon la rareté.
 * Calibrés pour qu'une usine plus rare rapporte davantage de points par heure malgré sa lenteur
 * (niveau 1 : commun 12 pts/h, peu commun 16, rare 20, super rare 25, légende 30).
 */
export const YIELD_POINTS: Record<Rarity, number> = { COMMON: 1, UNCOMMON: 4, RARE: 20, EPIC: 100, LEGENDARY: 360 };

/* ───── Usines de produits ───── */
/** Une usine de produits rapporte ce bonus par rapport à la somme des usines fusionnées. */
export const PRODUCT_FACTORY_BONUS = 1.5;

/**
 * Intervalle de base (niveau 1) d'une usine de produits, choisi pour que son rendement
 * = BONUS × somme des rendements des usines fusionnées.
 */
export function productFactoryBaseInterval(consumedYield: number, points: number) {
  const perHour = (PRODUCT_FACTORY_BONUS * consumedYield) / Math.max(1, points);
  return Math.max(30, Math.round(3600 / Math.max(perHour, 1 / 48))); // au plus lent : 1 produit toutes les 48 h
}

/** Rendement en points par heure d'une usine de produits. */
export const productFactoryYield = (baseSec: number, level: number, points: number) =>
  Math.round((3600 / factoryInterval(baseSec, level)) * points * 10) / 10;

/** Amélioration d'une usine de produits : pièces selon la rareté du produit + exemplaires du produit fabriqué. */
export function productFactoryUpgradeCost(level: number, rarity: Rarity) {
  return { coins: Math.round(60 * level * UPGRADE_RARITY_MULT[rarity]), cards: level };
}

/** Rendement d'une usine en points par heure. */
export function factoryYield(baseSec: number, level: number, rarity: Rarity) {
  const perHour = 3600 / factoryInterval(baseSec, level);
  return Math.round(perHour * YIELD_POINTS[rarity] * 10) / 10;
}

export const BOOSTER_MAX = 10;
/** Un nouveau booster toutes les 10 minutes. */
export const BOOSTER_REFILL_MS = 10 * 60_000;
export const CARDS_PER_BOOSTER = 5;

export const STARTING_COINS = 500;
export const AUCTION_DURATIONS_MIN = [10, 60, 360, 1440];
export const MIN_BID_INCREMENT_PCT = 5;

/**
 * Assigne une rareté à chaque élément selon son rang de popularité.
 * Les parts de RARITY_SHARE s'appliquent dans l'ordre Commun → Légende (50 % communs, 3 % légendes).
 */
export function assignRarities<T extends { popularity: number }>(
  items: T[],
  /** "popular-common" : les plus populaires sont communs (ingrédients) ; "popular-rare" : l'inverse (produits) */
  mode: "popular-common" | "popular-rare" = "popular-common",
): Map<T, Rarity> {
  const result = new Map<T, Rarity>();
  const n = items.length;

  if (mode === "popular-common") {
    // Du plus populaire au moins populaire : Commun d'abord, Légende = le reste
    const sorted = [...items].sort((a, b) => b.popularity - a.popularity);
    let cursor = 0;
    RARITIES.forEach((r, i) => {
      const isLast = i === RARITIES.length - 1;
      const count = isLast ? n - cursor : Math.round(n * RARITY_SHARE[r]);
      for (let k = 0; k < count && cursor < n; k++) result.set(sorted[cursor++], r);
    });
    return result;
  }

  // Du plus populaire au moins populaire : Légende d'abord (au moins 1 par rareté dès 5 éléments), Commun = le reste
  const sorted = [...items].sort((a, b) => b.popularity - a.popularity);
  let cursor = 0;
  [...RARITIES].reverse().forEach((r) => {
    const count = r === "COMMON" ? n - cursor : Math.max(n >= RARITIES.length ? 1 : 0, Math.round(n * RARITY_SHARE[r]));
    for (let k = 0; k < count && cursor < n; k++) result.set(sorted[cursor++], r);
  });
  return result;
}

/** État des boosters recalculé à partir du stock stocké et du temps écoulé. */
export function boosterState(stock: number, lastAt: Date, now = new Date()) {
  if (stock >= BOOSTER_MAX) return { available: BOOSTER_MAX, nextInMs: null as number | null, anchor: now };
  const elapsed = now.getTime() - lastAt.getTime();
  const gained = Math.floor(elapsed / BOOSTER_REFILL_MS);
  const available = Math.min(BOOSTER_MAX, stock + gained);
  if (available >= BOOSTER_MAX) return { available, nextInMs: null, anchor: now };
  // Ancre = moment où la dernière recharge a été comptée (on garde le reste de la minute en cours)
  const anchor = new Date(lastAt.getTime() + gained * BOOSTER_REFILL_MS);
  const nextInMs = BOOSTER_REFILL_MS - (elapsed % BOOSTER_REFILL_MS);
  return { available, nextInMs, anchor };
}

export function pickRarity(rand = Math.random, minRarity: Rarity = "COMMON"): Rarity {
  const allowed = RARITIES.slice(RARITIES.indexOf(minRarity));
  const total = allowed.reduce((s, r) => s + DROP_WEIGHT[r], 0);
  let x = rand() * total;
  for (const r of allowed) {
    x -= DROP_WEIGHT[r];
    if (x < 0) return r;
  }
  return allowed[allowed.length - 1];
}

/** Production disponible d'une usine (plafonnée). */
export function factoryReady(intervalSec: number, capacity: number, lastCollectedAt: Date, now = new Date()) {
  const elapsed = Math.max(0, now.getTime() - lastCollectedAt.getTime());
  const produced = Math.floor(elapsed / (intervalSec * 1000));
  const ready = Math.min(capacity, produced);
  const nextInMs = ready >= capacity ? null : intervalSec * 1000 - (elapsed % (intervalSec * 1000));
  return { ready, nextInMs };
}

export function minNextBid(startPrice: number, currentBid: number | null) {
  if (currentBid == null) return startPrice;
  return currentBid + Math.max(1, Math.ceil((currentBid * MIN_BID_INCREMENT_PCT) / 100));
}

/* Offres de la banque (marché) : produits au hasard, renouvelés toutes les heures */
export const BANK_OFFER_COUNT = 5;
export const BANK_PRODUCT_PRICE = 500; // prix de base d'un produit
export const BANK_MAX_DISCOUNT = 80; // réduction tirée au hasard entre 0 et 80 %
export const BANK_ROTATION_MS = 60 * 60_000;
export const bankPrice = (discount: number) => Math.max(1, Math.round((BANK_PRODUCT_PRICE * (100 - discount)) / 100));

/* Demandes au marché */
export const MAX_OPEN_REQUESTS = 3; // demandes ouvertes simultanément par joueur

/* Messagerie et guildes */
export const MESSAGE_MAX_LENGTH = 500;
export const MESSAGE_MIN_INTERVAL_MS = 1000; // anti-spam : un message par seconde au plus
export const CHAT_PAGE_SIZE = 50;
export const GUILD_MAX_MEMBERS = 20;
