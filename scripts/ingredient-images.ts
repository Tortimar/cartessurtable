// Recherche d'une photo pour chaque ingrédient.
// 1. Taxonomie Open Food Facts → identifiant Wikidata → image principale (P18) sur Wikimedia Commons
// 2. À défaut : vignette de l'article Wikipédia (français, puis anglais) portant le nom de l'ingrédient
//
// Les sites interrogés limitent le nombre de requêtes : on espace les appels, on réessaie en cas de refus
// temporaire (429, 5xx, coupure réseau) et on distingue « pas de photo » de « recherche échouée » :
// seuls les ingrédients réellement vérifiés sont marqués, les autres seront retentés au prochain lancement.

const UA = "CartesSurTable/0.1 (jeu de cartes pedagogique; https://github.com)";
const BATCH = 40;
const GAP_MS = Number(process.env.IMG_MIN_GAP_MS ?? 250); // pause minimale entre deux requêtes vers le même site
const RETRIES = Number(process.env.IMG_RETRIES ?? 6);
// Adresses modifiables pour les tests
const WIKIDATA_API = process.env.WIKIDATA_API_URL ?? "https://www.wikidata.org/w/api.php";
const WIKIPEDIA_API = process.env.WIKIPEDIA_API_URL ?? "https://{lang}.wikipedia.org/api/rest_v1/page/summary/";

export class LookupError extends Error {}

type Fetcher = (url: string) => Promise<unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lastCall = new Map<string, number>();

export const defaultFetcher: Fetcher = async (url) => {
  const host = new URL(url).host;
  let lastErr = "";
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const wait = (lastCall.get(host) ?? 0) + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall.set(host, Date.now());
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return null;
      if (res.ok) return await res.json();
      lastErr = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break; // erreur définitive
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 120) * 1000 : Math.min(3000 * 2 ** attempt, 60_000));
    } catch (e) {
      lastErr = (e as Error).message;
      await sleep(Math.min(3000 * 2 ** attempt, 60_000));
    }
  }
  throw new LookupError(`${lastErr} sur ${host}`);
};

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export function commonsUrl(file: string, width = 400) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, "_"))}?width=${width}`;
}

/** Vignette de l'article Wikipédia correspondant (hors pages d'homonymie). Lève LookupError si le site ne répond pas. */
export async function wikipediaThumb(title: string, lang: "fr" | "en", get: Fetcher): Promise<string | null> {
  const url = `${WIKIPEDIA_API.replace("{lang}", lang)}${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const json = (await get(url)) as { type?: string; thumbnail?: { source?: string }; originalimage?: { source?: string } } | null;
  if (!json || json.type === "disambiguation") return null;
  return json.thumbnail?.source ?? json.originalimage?.source ?? null;
}

/**
 * Renvoie les photos trouvées et la liste des ingrédients dont la recherche a échoué
 * (site injoignable ou limite atteinte) : ceux-là ne doivent pas être marqués comme vérifiés.
 */
export async function findIngredientImages(
  ingredients: { id: string; name: string }[],
  get: Fetcher = defaultFetcher,
  log: (m: string) => void = () => {},
) {
  const found = new Map<string, string>();
  const failed = new Set<string>();
  const errors = new Map<string, number>();
  const note = (e: unknown) => { const m = (e as Error).message; errors.set(m, (errors.get(m) ?? 0) + 1); };

  // 1. Identifiants Wikidata, par lots ; un lot en échec n'empêche pas les autres
  const qids = new Map<string, string>();
  const noTaxonomy = new Set<string>();
  for (const part of chunk(ingredients.map((i) => i.id), BATCH)) {
    try {
      const url = `https://world.openfoodfacts.org/api/v2/taxonomy?tagtype=ingredients&fields=wikidata&tags=${encodeURIComponent(part.join(","))}`;
      const json = (await get(url)) as Record<string, { wikidata?: Record<string, string> } | null> | null;
      for (const id of part) {
        const qid = json?.[id]?.wikidata?.en ?? Object.values(json?.[id]?.wikidata ?? {})[0];
        if (qid && /^Q\d+$/.test(qid)) qids.set(id, qid);
      }
    } catch (e) {
      note(e);
      part.forEach((id) => noTaxonomy.add(id)); // on passera par Wikipédia, mais on réessaiera Wikidata la prochaine fois
    }
  }
  log(`  ${qids.size} ingrédients reliés à Wikidata`);

  // 2. Image principale de chaque élément Wikidata
  const files = new Map<string, string>();
  const qidFailed = new Set<string>();
  for (const part of chunk([...new Set(qids.values())], 50)) {
    try {
      const url = `${WIKIDATA_API}?action=wbgetentities&props=claims&format=json&ids=${part.join("|")}`;
      type Claim = { mainsnak?: { datavalue?: { value?: unknown } } };
      const json = (await get(url)) as { entities?: Record<string, { claims?: Record<string, Claim[]> }> } | null;
      for (const q of part) {
        const v = json?.entities?.[q]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
        if (typeof v === "string") files.set(q, v);
      }
    } catch (e) {
      note(e);
      part.forEach((q) => qidFailed.add(q));
    }
  }
  for (const [id, q] of qids) {
    const f = files.get(q);
    if (f) found.set(id, commonsUrl(f));
  }
  log(`  ${found.size} photos trouvées via Wikidata`);

  // 3. Wikipédia pour les autres
  let viaWiki = 0;
  for (const ing of ingredients) {
    if (found.has(ing.id)) continue;
    const slug = ing.id.replace(/^[a-z]{2}:/, "").replace(/-/g, " ");
    try {
      const img =
        (await wikipediaThumb(ing.name, "fr", get)) ??
        (ing.id.startsWith("fr:") ? null : await wikipediaThumb(slug, "en", get));
      if (img) { found.set(ing.id, img); viaWiki++; continue; }
    } catch (e) {
      note(e);
      failed.add(ing.id);
      continue;
    }
    // Pas de photo : vérification complète seulement si les étapes Wikidata ont répondu
    const q = qids.get(ing.id);
    if (noTaxonomy.has(ing.id) || (q && qidFailed.has(q))) failed.add(ing.id);
  }
  log(`  ${viaWiki} photos trouvées via Wikipédia`);
  if (errors.size) log(`  Requêtes en échec : ${[...errors].map(([m, n]) => `${m} (×${n})`).join(", ")}`);
  if (failed.size) log(`  ${failed.size} ingrédients n'ont pas pu être vérifiés : ils seront retentés au prochain « npm run images:fetch ».`);
  return { found, failed };
}

/** Image principale (P18) de chaque élément Wikidata, par lots de 50. Lève LookupError si Wikidata ne répond pas. */
export async function wikidataImageFiles(qids: string[], get: Fetcher = defaultFetcher) {
  const out = new Map<string, string>();
  for (const part of chunk([...new Set(qids)], 50)) {
    type Claim = { mainsnak?: { datavalue?: { value?: unknown } } };
    const json = (await get(`${WIKIDATA_API}?action=wbgetentities&props=claims&format=json&ids=${part.join("|")}`)) as { entities?: Record<string, { claims?: Record<string, Claim[]> }> } | null;
    for (const q of part) {
      const v = json?.entities?.[q]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (typeof v === "string") out.set(q, commonsUrl(v));
    }
  }
  return out;
}
export type { Fetcher };
