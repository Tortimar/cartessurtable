// Récupération et normalisation des produits Open Food Facts.

export type RawIngredient = { id?: string; text?: string; is_in_taxonomy?: number };
export type RawProduct = {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
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
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [10_000, 30_000, 60_000, 90_000].map((ms) => Number(process.env.OFF_BACKOFF_SCALE ?? 1) * ms);

let lastRequestAt = 0;
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
  const params = new URLSearchParams({
    countries_tags_en: country,
    sort_by: "unique_scans_n",
    page_size: "100",
    page: String(page),
    fields: "code,product_name,product_name_fr,brands,image_front_small_url,image_front_url,unique_scans_n,ingredients",
  });
  const url = `${API}/api/v2/search?${params}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Respecte le rythme maximal de l'API, même entre deux tentatives
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let retryAfterMs: number | null = null;
    let reason: string;
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: ctrl.signal });
      if (res.ok) {
        const json = (await res.json()) as { products?: RawProduct[] };
        return json.products ?? [];
      }
      reason = `HTTP ${res.status}`;
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after"));
        retryAfterMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 65_000 * Number(process.env.OFF_BACKOFF_SCALE ?? 1);
        reason = "trop de requêtes (limite de l'API atteinte)";
      } else if (res.status < 500 && res.status !== 408) {
        throw new Error(reason); // erreur définitive (400, 404…) : inutile de réessayer
      }
    } catch (e) {
      if ((e as Error).message.startsWith("HTTP 4")) throw e;
      reason = (e as Error).name === "AbortError" ? `pas de réponse après ${Math.round(TIMEOUT_MS / 1000)} s` : (e as Error).message;
    } finally {
      clearTimeout(timer);
      lastRequestAt = Date.now(); // l'écart minimal court à partir de la fin de la requête précédente
    }
    if (attempt === MAX_ATTEMPTS) throw new Error(`${reason} (${MAX_ATTEMPTS} tentatives)`);
    const pause = retryAfterMs ?? BACKOFF_MS[attempt - 1];
    log(`    ${reason} — nouvelle tentative dans ${Math.round(pause / 1000)} s (${attempt + 1}/${MAX_ATTEMPTS})`);
    await sleep(pause);
  }
  return [];
}

function cleanText(t: string) {
  const s = t.replace(/[_*]/g, "").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function prettifyId(id: string) {
  return cleanText(id.replace(/^[a-z]{2}:/, "").replace(/-/g, " "));
}

export function normalizeProduct(p: RawProduct): CleanProduct | null {
  const name = (p.product_name_fr || p.product_name || "").trim();
  if (!p.code || !name || !p.ingredients?.length) return null;
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
