// Transforme les ingrédients d'Open Food Facts en cartes du jeu :
//  - regroupement des variantes (« Sel iodé » → « Sel ») grâce à la taxonomie OFF,
//  - nom en français uniquement,
//  - photo obligatoire : sans photo, on essaie un ingrédient parent illustré, sinon l'ingrédient est écarté.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ancestors, groupOf, type TaxEntry, type Taxonomy } from "./taxonomy";
import { defaultFetcher, wikidataImageFiles, wikipediaThumb, type Fetcher } from "./ingredient-images";

export type Card = { id: string; name: string; imageUrl: string };
export type Resolution = { card: Card | null; reason: string | null };

/** Additifs (E-numbers), minéraux et vitamines : pas des ingrédients de cuisine, sans photo parlante. */
const NOT_A_CARD = /^en:(e\d{3,4}[a-z]*|vitamin|minerals?$|sodium$|calcium$|magnesium$|potassium$|iron$|zinc$)/;

/** Photos déjà cherchées, gardées sur disque : une relance après une panne ne refait pas les recherches. */
const PHOTO_CACHE = join(process.cwd(), "data", "photos.json");

export class CardResolver {
  private photos = new Map<string, string | null>(); // id taxonomie → photo (null = aucune)

  constructor(private tax: Taxonomy, private get: Fetcher = defaultFetcher, private log: (m: string) => void = () => {}) {
    try { if (existsSync(PHOTO_CACHE)) this.photos = new Map(Object.entries(JSON.parse(readFileSync(PHOTO_CACHE, "utf8")))); } catch { /* copie abîmée : ignorée */ }
  }

  private savePhotos() {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(PHOTO_CACHE, JSON.stringify(Object.fromEntries(this.photos)));
  }

  /** Cherche une photo pour chaque entrée : Wikidata (P18) d'abord, puis l'article Wikipédia en français. */
  private async fetchPhotos(entries: TaxEntry[]) {
    const todo = [...new Map(entries.filter((e) => !this.photos.has(e.id)).map((e) => [e.id, e])).values()];
    if (!todo.length) return;
    const viaWikidata = await wikidataImageFiles(todo.map((e) => e.wikidata).filter((q): q is string => !!q), this.get);
    try {
      for (const [k, e] of todo.entries()) {
        let url = e.wikidata ? viaWikidata.get(e.wikidata) ?? null : null;
        if (!url && e.fr) url = await wikipediaThumb(e.fr, "fr", this.get);
        if (!url && e.en) url = await wikipediaThumb(e.en, "en", this.get);
        this.photos.set(e.id, url);
        if (k % 50 === 49) this.savePhotos();
      }
    } finally {
      this.savePhotos(); // ce qui a été trouvé avant une panne est gardé
    }
  }

  /** Résout une liste d'ingrédients OFF. Lève une erreur si Wikidata / Wikipédia ne répondent pas (à relancer). */
  async resolve(rawIds: string[]): Promise<Map<string, Resolution>> {
    const out = new Map<string, Resolution>();
    const groups = new Map<string, TaxEntry>();
    for (const raw of new Set(rawIds)) {
      if (NOT_A_CARD.test(raw)) { out.set(raw, { card: null, reason: "additif" }); continue; }
      const g = groupOf(this.tax, raw);
      if (!g) { out.set(raw, { card: null, reason: this.tax.resolve(raw) ? "sans-nom-francais" : "inconnu" }); continue; }
      groups.set(raw, g);
    }
    // Photos des cartes, puis de leurs parents pour celles qui n'en ont pas
    await this.fetchPhotos([...groups.values()]);
    const missing = [...new Set([...groups.values()].filter((g) => !this.photos.get(g.id)))];
    const chains = new Map(missing.map((g) => [g.id, ancestors(this.tax, g.id, 1).filter((a) => a.fr)]));
    await this.fetchPhotos([...chains.values()].flat());
    for (const [raw, g] of groups) {
      let card: TaxEntry | undefined = g;
      if (!this.photos.get(g.id)) card = chains.get(g.id)?.find((a) => this.photos.get(a.id));
      if (!card) { out.set(raw, { card: null, reason: "sans-photo" }); continue; }
      out.set(raw, { card: { id: card.id, name: card.fr!, imageUrl: this.photos.get(card.id)! }, reason: null });
    }
    const kept = [...out.values()].filter((r) => r.card).length;
    this.log(`  ${out.size} ingrédients → ${new Set([...out.values()].map((r) => r.card?.id).filter(Boolean)).size} cartes (${out.size - kept} écartés)`);
    return out;
  }
}
