// Recherche d'une photo pour chaque ingrédient.
// 1. Taxonomie Open Food Facts → identifiant Wikidata → image principale (P18) sur Wikimedia Commons
// 2. À défaut : vignette de l'article Wikipédia (français, puis anglais) portant le nom de l'ingrédient

const UA = "CartesSurTable/0.1 (jeu de cartes pedagogique; contact via GitHub)";
const BATCH = 40;

type Fetcher = (url: string) => Promise<unknown>;

export const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${new URL(url).host}`);
  return res.json();
};

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export function commonsUrl(file: string, width = 400) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, "_"))}?width=${width}`;
}

/** Ingrédient OFF → QID Wikidata. */
async function wikidataIds(ids: string[], get: Fetcher) {
  const out = new Map<string, string>();
  for (const part of chunk(ids, BATCH)) {
    const url = `https://world.openfoodfacts.org/api/v2/taxonomy?tagtype=ingredients&fields=wikidata&tags=${encodeURIComponent(part.join(","))}`;
    const json = (await get(url)) as Record<string, { wikidata?: Record<string, string> } | null> | null;
    for (const id of part) {
      const qid = json?.[id]?.wikidata?.en ?? Object.values(json?.[id]?.wikidata ?? {})[0];
      if (qid && /^Q\d+$/.test(qid)) out.set(id, qid);
    }
  }
  return out;
}

/** QID → nom du fichier Commons de l'image principale. */
async function wikidataImages(qids: string[], get: Fetcher) {
  const out = new Map<string, string>();
  for (const part of chunk([...new Set(qids)], 50)) {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=${part.join("|")}`;
    type Claim = { mainsnak?: { datavalue?: { value?: unknown } } };
    const json = (await get(url)) as { entities?: Record<string, { claims?: Record<string, Claim[]> }> } | null;
    for (const q of part) {
      const v = json?.entities?.[q]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (typeof v === "string") out.set(q, v);
    }
  }
  return out;
}

/** Vignette de l'article Wikipédia correspondant (hors pages d'homonymie). */
async function wikipediaThumb(title: string, lang: "fr" | "en", get: Fetcher): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  try {
    const json = (await get(url)) as { type?: string; thumbnail?: { source?: string }; originalimage?: { source?: string } } | null;
    if (!json || json.type === "disambiguation") return null;
    return json.thumbnail?.source ?? json.originalimage?.source ?? null;
  } catch {
    return null;
  }
}

export async function findIngredientImages(
  ingredients: { id: string; name: string }[],
  get: Fetcher = defaultFetcher,
  log: (m: string) => void = () => {},
) {
  const result = new Map<string, string>();

  try {
    const qids = await wikidataIds(ingredients.map((i) => i.id), get);
    log(`  ${qids.size} ingrédients reliés à Wikidata`);
    const files = await wikidataImages([...qids.values()], get);
    for (const [id, q] of qids) {
      const f = files.get(q);
      if (f) result.set(id, commonsUrl(f));
    }
    log(`  ${result.size} photos trouvées via Wikidata`);
  } catch (e) {
    log(`  Wikidata indisponible (${(e as Error).message}), passage à Wikipédia`);
  }

  let viaWiki = 0;
  for (const ing of ingredients) {
    if (result.has(ing.id)) continue;
    const slug = ing.id.replace(/^[a-z]{2}:/, "").replace(/-/g, " ");
    const img =
      (await wikipediaThumb(ing.name, "fr", get)) ??
      (ing.id.startsWith("fr:") ? null : await wikipediaThumb(slug, "en", get));
    if (img) { result.set(ing.id, img); viaWiki++; }
  }
  log(`  ${viaWiki} photos trouvées via Wikipédia`);
  return result;
}
