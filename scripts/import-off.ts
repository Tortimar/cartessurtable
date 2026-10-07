// Récupération et normalisation des produits Open Food Facts.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type RawIngredient = { id?: string; text?: string; is_in_taxonomy?: number };
export type RawProduct = {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  lang?: string; // langue principale de la fiche
  brands?: string;
  image_front_small_url?: string;
  image_front_url?: string;
  unique_scans_n?: number;
  ingredients?: RawIngredient[];
};

export type CleanProduct = {
  code: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  popularity: number;
  ingredients: { id: string; text: string }[];
};

const MIN_INGREDIENTS = 2;
const MAX_INGREDIENTS = 12;
const USER_AGENT = "CartesSurTable/0.1 (jeu de cartes pedagogique)";
const API = process.env.OFF_API_URL ?? "https://world.openfoodfacts.org";

/** L'API de recherche d'Open Food Facts accepte environ 10 requêtes par minute : on en fait au plus une toutes les 7 s. */
export const MIN_GAP_MS = Number(process.env.OFF_MIN_GAP_MS ?? 7000);
const TIMEOUT_MS = Number(process.env.OFF_TIMEOUT_MS ?? 90_000);
// L'API de recherche répond souvent 503 quand elle est surchargée : on insiste longtemps (≈ 10 min par page au pire)
const MAX_ATTEMPTS = Number(process.env.OFF_MAX_ATTEMPTS ?? 8);
const BACKOFF_MS = [15_000, 30_000, 60_000, 90_000, 120_000, 120_000, 120_000].map((ms) => Number(process.env.OFF_BACKOFF_SCALE ?? 1) * ms);
// Chaque page reçue est gardée sur disque : une relance ne redemande que les pages manquantes
const PAGE_CACHE_DIR = join(process.cwd(), "data", "off-pages");
const PRODUCT_CACHE_DIR = join(process.cwd(), "data", "off-products");
const PAGE_CACHE_MS = Number(process.env.OFF_PAGE_CACHE_HOURS ?? 72) * 3_600_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lit « 1,2,3,10-12,60 » → [1, 2, 3, 10, 11, 12, 60] (sans doublon, dans l'ordre). */
export function parsePages(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.push(n);
    } else if (/^\d+$/.test(part)) out.push(Number(part));
  }
  return [...new Set(out.filter((n) => n > 0))];
}

export async function fetchOffPage(page: number, country: string, log: (m: string) => void = () => {}): Promise<RawProduct[]> {
  const cacheFile = join(PAGE_CACHE_DIR, `${country}-${page}.json`);
  if (PAGE_CACHE_MS > 0 && existsSync(cacheFile) && Date.now() - statSync(cacheFile).mtimeMs < PAGE_CACHE_MS) {
    try { return JSON.parse(readFileSync(cacheFile, "utf8")) as RawProduct[]; } catch { /* copie abîmée : on retélécharge */ }
  }
  const list = await downloadOffPage(page, country, log);
  if (PAGE_CACHE_MS > 0) { mkdirSync(PAGE_CACHE_DIR, { recursive: true }); writeFileSync(cacheFile, JSON.stringify(list)); }
  return list;
}

const FIELDS = "code,product_name,product_name_fr,lang,brands,image_front_small_url,image_front_url,unique_scans_n,ingredients";

async function downloadOffPage(page: number, country: string, log: (m: string) => void): Promise<RawProduct[]> {
  const params = new URLSearchParams({ countries_tags_en: country, sort_by: "unique_scans_n", page_size: "100", page: String(page), fields: FIELDS });
  const json = await offGet<{ products?: RawProduct[] }>(`${API}/api/v2/search?${params}`, "search", log);
  return json?.products ?? [];
}

/**
 * Fiche d'un produit par son code-barres (API produit : bien moins chargée que la recherche,
 * environ 100 requêtes par minute autorisées). null si le produit n'existe plus. Gardée sur disque.
 */
export async function fetchOffProduct(code: string, log: (m: string) => void = () => {}): Promise<RawProduct | null> {
  const cacheFile = join(PRODUCT_CACHE_DIR, `${code.replace(/[^0-9A-Za-z_-]/g, "_")}.json`);
  if (PAGE_CACHE_MS > 0 && existsSync(cacheFile) && Date.now() - statSync(cacheFile).mtimeMs < PAGE_CACHE_MS) {
    try { return JSON.parse(readFileSync(cacheFile, "utf8")) as RawProduct | null; } catch { /* copie abîmée */ }
  }
  const json = await offGet<{ status?: number; product?: RawProduct }>(`${API}/api/v2/product/${encodeURIComponent(code)}?fields=${FIELDS}`, "product", log);
  const p = json?.status === 1 && json.product ? { ...json.product, code: json.product.code ?? code } : null;
  if (PAGE_CACHE_MS > 0) { mkdirSync(PRODUCT_CACHE_DIR, { recursive: true }); writeFileSync(cacheFile, JSON.stringify(p)); }
  return p;
}

const lastRequestAt = { search: 0, product: 0 };
const GAP = { search: MIN_GAP_MS, product: Number(process.env.OFF_PRODUCT_GAP_MS ?? 700) };

/** Requête vers OFF avec rythme minimal, délai maximal et nouvelles tentatives (429, 5xx, coupure). 404 → null. */
async function offGet<T>(url: string, kind: "search" | "product", log: (m: string) => void): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Respecte le rythme maximal de l'API, même entre deux tentatives
    const wait = lastRequestAt[kind] + GAP[kind] - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt[kind] = Date.now();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let retryAfterMs: number | null = null;
    let reason: string;
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: ctrl.signal });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) return null;
      reason = res.status >= 500 ? `HTTP ${res.status} (Open Food Facts surchargé)` : `HTTP ${res.status}`;
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after"));
        retryAfterMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 65_000 * Number(process.env.OFF_BACKOFF_SCALE ?? 1);
        reason = "trop de requêtes (limite de l'API atteinte)";
      } else if (res.status < 500 && res.status !== 408) {
        throw new Error(reason); // erreur définitive (400…) : inutile de réessayer
      }
    } catch (e) {
      if ((e as Error).message.startsWith("HTTP 4")) throw e;
      reason = (e as Error).name === "AbortError" ? `pas de réponse après ${Math.round(TIMEOUT_MS / 1000)} s` : (e as Error).message;
    } finally {
      clearTimeout(timer);
      lastRequestAt[kind] = Date.now(); // l'écart minimal court à partir de la fin de la requête précédente
    }
    if (attempt === MAX_ATTEMPTS) throw new Error(`${reason} (${MAX_ATTEMPTS} tentatives)`);
    const pause = retryAfterMs ?? BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
    log(`    ${reason} — nouvelle tentative dans ${Math.round(pause / 1000)} s (${attempt + 1}/${MAX_ATTEMPTS})`);
    await sleep(pause);
  }
  return null;
}

function cleanText(t: string) {
  const s = t.replace(/[_*]/g, "").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function prettifyId(id: string) {
  return cleanText(id.replace(/^[a-z]{2}:/, "").replace(/-/g, " "));
}

/**
 * Garde les produits exploitables. Avec `strict` (import réel) : nom en français obligatoire
 * (champ français, ou fiche rédigée en français) et photo du produit obligatoire.
 */
export function normalizeProduct(p: RawProduct, strict = false): CleanProduct | null {
  const name = (strict ? p.product_name_fr || (p.lang === "fr" ? p.product_name : "") : p.product_name_fr || p.product_name || "")?.trim() ?? "";
  if (!p.code || !name || !p.ingredients?.length) return null;
  if (strict && !(p.image_front_small_url || p.image_front_url)) return null;
  const seen = new Map<string, string>();
  for (const ing of p.ingredients) {
    // Ingrédients de premier niveau reconnus par la taxonomie OFF uniquement
    if (!ing.id || ing.is_in_taxonomy === 0) continue;
    if (!/^[a-z]{2}:[a-z0-9-]+$/.test(ing.id)) continue;
    if (!seen.has(ing.id)) seen.set(ing.id, ing.text ? cleanText(ing.text) : prettifyId(ing.id));
  }
  if (seen.size < MIN_INGREDIENTS || seen.size > MAX_INGREDIENTS) return null;
  return {
    code: p.code,
    name: name.slice(0, 120),
    brand: p.brands?.split(",")[0]?.trim() || null,
    imageUrl: p.image_front_small_url || p.image_front_url || null,
    popularity: p.unique_scans_n ?? 0,
    ingredients: [...seen].map(([id, text]) => ({ id, text })),
  };
}

/** Choisit pour chaque ingrédient le libellé le plus fréquent parmi les produits. */
export function ingredientNames(products: CleanProduct[]) {
  const counts = new Map<string, Map<string, number>>();
  for (const p of products)
    for (const ing of p.ingredients) {
      const m = counts.get(ing.id) ?? new Map<string, number>();
      m.set(ing.text, (m.get(ing.text) ?? 0) + 1);
      counts.set(ing.id, m);
    }
  const names = new Map<string, string>();
  for (const [id, m] of counts) names.set(id, [...m].sort((a, b) => b[1] - a[1])[0][0]);
  return names;
}

export const RECIPE_MIN = MIN_INGREDIENTS;
export const RECIPE_MAX = MAX_INGREDIENTS;
