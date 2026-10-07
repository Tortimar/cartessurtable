// Taxonomie des ingrédients d'Open Food Facts (fichier texte du dépôt officiel, licence ODbL).
// Sert à regrouper les variantes (« Sel iodé » → « Sel ») et à donner un nom français à chaque carte.
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const URL = process.env.OFF_TAXONOMY_URL ?? "https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/taxonomies/food/ingredients.txt";
const CACHE = join(process.cwd(), "data", "off-ingredients.txt");
const MAX_AGE_MS = 7 * 86_400_000;

export type TaxEntry = {
  id: string; // identifiant canonique, ex. « en:iodised-salt »
  fr: string | null; // nom français, ex. « Sel iodé »
  en: string | null; // nom anglais (recherche de photo sur Wikipédia en anglais)
  parents: string[]; // identifiants canoniques des parents
  wikidata: string | null; // QID Wikidata, ex. « Q11254 »
};
export type Taxonomy = { entries: Map<string, TaxEntry>; resolve: (id: string) => TaxEntry | undefined };

/** Identifiant à la manière d'OFF : minuscules, sans accents, mots reliés par des tirets. */
export function tagId(lang: string, name: string) {
  const s = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${lang}:${s}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Lit le fichier texte de la taxonomie (blocs séparés par une ligne vide). */
export function parseTaxonomy(text: string): Taxonomy {
  const entries = new Map<string, TaxEntry>();
  const synonyms = new Map<string, string>(); // n'importe quel nom normalisé → id canonique
  const pending: { entry: TaxEntry; parents: string[] }[] = [];

  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    if (!lines.length || /^(synonyms|stopwords):/.test(lines[0])) continue;
    const parents: string[] = [];
    let id: string | null = null;
    let fr: string | null = null;
    let en: string | null = null;
    let universal: string | null = null;
    let ciqualFr: string | null = null;
    let wikidata: string | null = null;
    const names: { lang: string; name: string }[] = [];
    for (const line of lines) {
      let m = line.match(/^<\s*([a-z]{2,3}):\s*(.+)$/);
      if (m) { parents.push(tagId(m[1], m[2])); continue; }
      m = line.match(/^wikidata:en:\s*(Q\d+)/);
      if (m) { wikidata = m[1]; continue; }
      m = line.match(/^ciqual_food_name:fr:\s*(.+)$/);
      if (m) { ciqualFr = m[1].split(",")[0].trim(); continue; }
      m = line.match(/^([a-z]{2,3}):\s*(.+)$/); // nom dans une langue (les propriétés ont deux « : »)
      if (m && !/^[a-z_]+:[a-z]{2,3}:/.test(line)) {
        const list = m[2].split(",").map((s) => s.trim()).filter(Boolean);
        if (!list.length) continue;
        if (!id) id = tagId(m[1], list[0]);
        if (m[1] === "fr" && !fr) fr = capitalize(list[0]);
        if (m[1] === "en" && !en) en = list[0];
        if (m[1] === "xx" && !universal) universal = capitalize(list[0]);
        for (const n of list) names.push({ lang: m[1], name: n });
      }
    }
    if (!id) continue;
    // Nom français : ligne « fr: », sinon nom universel « xx: », sinon nom de la table Ciqual (ANSES)
    const entry: TaxEntry = { id, fr: fr ?? universal ?? (ciqualFr ? capitalize(ciqualFr) : null), en, parents: [], wikidata };
    entries.set(id, entry);
    for (const n of names) if (!synonyms.has(tagId(n.lang, n.name))) synonyms.set(tagId(n.lang, n.name), id);
    pending.push({ entry, parents });
  }
  // Les parents sont cités par un de leurs noms : on les ramène à l'identifiant canonique
  for (const { entry, parents } of pending) entry.parents = parents.map((p) => synonyms.get(p) ?? p).filter((p) => entries.has(p) && p !== entry.id);
  const resolve = (id: string) => entries.get(id) ?? entries.get(synonyms.get(id) ?? "");
  return { entries, resolve };
}

/** Télécharge la taxonomie (copie locale gardée une semaine dans data/). */
export async function loadTaxonomy(log: (m: string) => void = () => {}): Promise<Taxonomy> {
  const fresh = existsSync(CACHE) && Date.now() - statSync(CACHE).mtimeMs < MAX_AGE_MS;
  if (!fresh) {
    log("Téléchargement de la taxonomie des ingrédients Open Food Facts…");
    try {
      const res = await fetch(URL, { headers: { "User-Agent": "CartesSurTable/0.1" }, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      mkdirSync(join(process.cwd(), "data"), { recursive: true });
      writeFileSync(CACHE, text);
    } catch (e) {
      if (!existsSync(CACHE)) throw new Error(`Taxonomie introuvable (${(e as Error).message}) : vérifie la connexion internet.`);
      log(`  Téléchargement impossible (${(e as Error).message}), utilisation de la copie locale.`);
    }
  }
  return parseTaxonomy(readFileSync(CACHE, "utf8"));
}

const PREP = new Set(["de", "d", "du", "des", "a", "au", "aux", "en"]);
const STOP = new Set([...PREP, "la", "le", "l", "les", "et"]);
const singular = (w: string) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w);
const tokens = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const words = (s: string) => tokens(s).filter((w) => !STOP.has(w)).map(singular);

/**
 * Regroupement « intermédiaire » : on remonte vers un parent tant que le nom français du parent
 * est une version plus courte du nom de l'enfant, avec le même mot principal, et que les mots
 * retirés sont des précisions (« iodé », « écrémé », « complète ») et non un complément :
 *   « Sel iodé » → « Sel », « Lait écrémé » → « Lait », « Farine complète de blé » → « Farine de blé »,
 *   mais « Farine de riz », « Lait de chèvre », « Lait en poudre » restent des cartes à part,
 *   et « Farine de blé » ne remonte pas vers « Blé ».
 */
export function isVariantOf(child: string, parent: string) {
  const c = words(child), p = words(parent);
  if (!c.length || !p.length || p.length >= c.length) return false;
  if (c[0] !== p[0]) return false;
  const kept = new Set(p);
  const set = new Set(c);
  if (!p.every((w) => set.has(w))) return false;
  const t = tokens(child);
  for (let i = 1; i < t.length; i++) {
    if (STOP.has(t[i]) || kept.has(singular(t[i]))) continue;
    let j = i - 1;
    while (j > 0 && ["la", "le", "l", "les"].includes(t[j])) j--; // « fruit de la passion »
    if (PREP.has(t[j])) return false;
  }
  return true;
}

/** Ancêtres d'un ingrédient, du plus proche au plus lointain. */
export function ancestors(tax: Taxonomy, id: string, max = 6): TaxEntry[] {
  const out: TaxEntry[] = [];
  let level = [id];
  const seen = new Set([id]);
  for (let d = 0; d < max && level.length; d++) {
    const next: string[] = [];
    for (const l of level)
      for (const p of tax.entries.get(l)?.parents ?? [])
        if (!seen.has(p)) { seen.add(p); const e = tax.entries.get(p); if (e) { out.push(e); next.push(p); } }
    level = next;
  }
  return out;
}

/** Familles regroupées entièrement sous une seule carte (« Arôme naturel de vanille » → « Arôme »). */
const FAMILIES = ["en:flavouring"];

/** Carte (ingrédient générique) correspondant à un ingrédient d'Open Food Facts, ou null s'il est écarté. */
export function groupOf(tax: Taxonomy, id: string): TaxEntry | null {
  let cur = tax.resolve(id);
  if (!cur || !cur.fr) return null; // non reconnu par OFF, ou sans nom français : écarté
  for (const f of FAMILIES) if (cur.id === f || ancestors(tax, cur.id).some((a) => a.id === f)) return tax.entries.get(f) ?? cur;
  for (let guard = 0; guard < 10; guard++) {
    const from: TaxEntry = cur;
    const next = from.parents.map((p) => tax.entries.get(p)).find((p): p is TaxEntry => !!p?.fr && isVariantOf(from.fr!, p.fr));
    if (!next) break;
    cur = next;
  }
  return cur;
}
