# Cartes sur Table

Jeu de collection en ligne : on ouvre des boosters d'**ingrédients** issus d'[Open Food Facts](https://world.openfoodfacts.org), on les échange sur un marché (prix fixe ou enchères), on **fabrique** les vrais produits OFF quand on a tous leurs ingrédients, puis on sacrifie des produits pour bâtir des **usines** qui génèrent des ingrédients en continu.

Le fichier de base reste `unboxipe.db` (nom d'origine du projet) pour ne pas perdre les données existantes.

Stack : **Next.js 15** (App Router, routes API) · **Drizzle ORM** · **SQLite via libSQL** (fichier local, ou Turso en production) · sessions JWT signées en cookie httpOnly.

## Démarrage

Prérequis : [Node.js](https://nodejs.org) 18.18 ou plus récent (version LTS conseillée).

```bash
npm install                 # obligatoire en premier : installe Next, Drizzle, tsx…
cp .env.example .env        # Windows : copy .env.example .env — puis changer SESSION_SECRET
npm run setup               # crée les tables + importe les produits Open Food Facts
npm run dev                 # http://localhost:3000
```

- `npm run db:migrate` crée ou met à jour les tables à partir des fichiers SQL du dossier `drizzle/`. Le serveur (`npm run dev` / `npm start`) l'applique aussi automatiquement au démarrage (`src/instrumentation.ts`).
- `npm run db:seed` importe depuis l'API OFF les pages listées dans `OFF_SEED_PAGES` (par défaut `1-10,20,30,60,120`, soit jusqu'à 1 400 produits ; 100 produits par page, triés par nombre de scans). Relançable à volonté : les produits sont mis à jour, pas dupliqués.
  - L'API de recherche OFF limite à environ 10 requêtes par minute : l'import fait **une page toutes les 7 s** (≈ 2 min pour 14 pages), attend jusqu'à 90 s une réponse, et réessaie 5 fois (pauses de 10 s à 90 s, ou le délai demandé par l'API si elle signale trop de requêtes).
  - Chaque page est **enregistrée dès sa réception** : un arrêt ou une panne en cours de route ne fait rien perdre.
  - À la fin, un bilan liste les pages en échec et la commande pour ne relancer qu'elles : `npm run db:seed -- --pages=30,60`.
- `npm run db:seed:offline` charge un petit jeu de 25 produits de démonstration (`scripts/sample-products.json`), utile sans connexion. Si l'API OFF est injoignable, le seed normal bascule automatiquement dessus.
- `npm run rarity:recompute` recalcule toutes les raretés (après un import supplémentaire, par exemple).
- `npm run images:fetch` cherche une photo pour les ingrédients qui n'en ont pas (lancé automatiquement par le seed). Ajoute `-- --all` pour retenter ceux restés sans photo.
- `npm run give-all -- <pseudo> [quantité]` **(test)** ajoute 1 exemplaire (ou la quantité indiquée) de chaque ingrédient au compte. Le compte doit déjà exister.
- Après une modification de `src/db/schema.ts` : `npm run db:generate` puis `npm run db:migrate`.

Si une commande affiche « n'est pas reconnu en tant que commande interne », c'est que `npm install` n'a pas été lancé dans ce dossier, ou qu'il a échoué.

## Règles du jeu

Toutes les constantes d'équilibrage sont dans `src/lib/game.ts`.

**Habillage** — ambiance « table de cuisine » : fond en bois de noyer éclairé par une suspension, nappe vichy rouge et crème (bandeau du menu, dos des cartes, scellé des boosters, page de connexion), sachet de booster en papier kraft, pièces affichées sur une étiquette de prix, et une illustration au trait par page (sac de courses, bocaux, étal de marché, marmite, ferme, livre de recettes, toque, couverts, panier). Couleurs : tomate, miel, basilic, farine. Polices Fredoka (titres) et Nunito Sans (texte). Tout est dans `src/app/globals.css` (section « Habillage ») et `src/components/decor.tsx`.

**Boosters** — ouverture animée (le paquet tremble, se déchire, les cartes sont distribuées face cachée) avec effets sonores générés dans le navigateur (bouton 🔊 pour couper). 10 en stock maximum, +1 toutes les 10 minutes (`BOOSTER_REFILL_MS`). Un booster = 5 cartes, la dernière est au moins « peu commune ». La recharge est calculée à la volée à partir de l'horodatage du dernier ajustement : pas de tâche planifiée nécessaire.

**Rareté** — fondée sur la popularité Open Food Facts (`unique_scans_n`). La popularité d'un ingrédient est la somme des scans des produits qui le contiennent. On classe tout par popularité décroissante :

| Rareté | Part du catalogue | Chance par carte | Valeur indicative | Usine : 1 carte toutes les |
|---|---|---|---|---|
| Commun | 50 % les plus scannés | 60 % | 5 | 5 min |
| Peu commun | 25 % suivants | 25 % | 15 | 15 min |
| Rare | 15 % | 10 % | 50 | 1 h |
| Super rare | 7 % | 4 % | 150 | 4 h |
| Légende | 3 % les moins scannés | 1 % | 500 | 12 h |

Les produits reçoivent eux aussi une rareté, mais dans l'autre sens : les 3 % de produits **les plus scannés** sont Légende, puis Super rare (7 %), Rare (15 %), Peu commun (25 %), et les 50 % les moins scannés sont Communs. Après un changement de ces règles, `npm run rarity:recompute` met à jour une base existante.

**Photos** — pour chaque ingrédient : identifiant Wikidata via la taxonomie Open Food Facts, puis image principale sur Wikimedia Commons ; à défaut, vignette de l'article Wikipédia (FR puis EN). Sans photo, la carte affiche l'initiale sur fond coloré.

**Ingrédients** — identifiants normalisés de la taxonomie OFF (`en:sugar`, `en:wheat-flour`…), ingrédients de premier niveau uniquement. Seuls les produits de 2 à 12 ingrédients reconnus sont importés, pour rester fabricables.

**Marché**
- *Banque* : rachat immédiat à **1 pièce par carte**, quelle que soit la rareté (`BANK_BUYBACK_PRICE`). Chaque joueur démarre avec 500 pièces. La valeur indicative sert seulement de prix suggéré sur le marché.
- *Prix fixe* : les cartes sont mises sous séquestre à la publication, rendues si l'annonce est retirée.
- *Enchères* : 10 min, 1 h, 6 h ou 24 h. Chaque surenchère doit dépasser l'offre en tête d'au moins 5 %. Les pièces du meilleur enchérisseur sont bloquées et rendues automatiquement s'il est dépassé. Une offre dans la dernière minute prolonge d'une minute (anti-sniping). Les enchères échues sont réglées à la première consultation du marché qui suit.

**Fabrication** — consomme 1 carte de chaque ingrédient du produit, par exemplaire. Un clic sur un produit ouvre son sous-menu : recette (ingrédients possédés / manquants), quantité à fabriquer. Animation : les cartes ingrédients rejoignent le centre une à une, puis la carte produit apparaît, avec son.

**Usines**
- *Construction* : coûte 3 produits contenant l'ingrédient voulu. Le sous-menu de construction laisse choisir exactement quels produits sacrifier (ou « Remplir automatiquement »). Animation : les cartes produits fusionnent, puis la carte usine apparaît, avec son.
- *Production* : selon la rareté de l'ingrédient (5 min → 12 h au niveau 1), stock plafonné. La progression du cycle en cours est conservée à la récolte.
- *Niveaux* (1 à 10) : chaque niveau accélère la production de 25 % et ajoute 6 places de stock (niveau 10 : ×3,25 et 78 places). Passer du niveau N à N+1 coûte `40 × N × multiplicateur de rareté` pièces (×1 à ×4) et `2 × N` cartes de l'ingrédient produit. La production prête est récoltée automatiquement au moment de l'amélioration.
- *Rendement* : chaque carte produite vaut des points selon sa rareté (Commun 1, Peu commun 4, Rare 20, Super rare 100, Légende 360). Le rendement d'une usine = cartes par heure × points ; au niveau 1 : 12, 16, 20, 25 et 30 pts/h selon la rareté, donc une usine rare reste plus rentable malgré sa lenteur. Le **score de rendement** du joueur est la somme de ses usines.

**Usines de produits** — une usine pour chaque ingrédient d'un produit peuvent fusionner en une usine qui fabrique directement ce produit. Le sous-menu de fusion laisse choisir quelle usine sacrifier pour chaque ingrédient (par défaut la moins rentable). Leur production en attente est récoltée avant la démolition. La nouvelle usine rapporte **+50 %** de rendement par rapport aux usines fusionnées (`PRODUCT_FACTORY_BONUS`) : sa cadence est calculée pour cela à partir de leurs niveaux. Elle s'améliore jusqu'au niveau 10 (pièces + exemplaires du produit) et compte dans le score et le classement.

**Toutes les cartes** — page `/cartes` : le catalogue complet des ingrédients et des produits, avec recherche (nom ou marque), filtres par rareté et par possession (possédées / manquantes), tri (rareté, popularité, nom) et compteur de cartes découvertes. Les cartes manquantes sont grisées. Chaque carte ouvre une fiche : pour un ingrédient, sa popularité, sa valeur, les offres du marché et la liste des produits qui l'utilisent ; pour un produit, sa recette avec tes quantités et un raccourci pour le fabriquer. On navigue d'une fiche à l'autre (ingrédient → produit → ingrédient).

**Classement** — page `/classement` : tous les joueurs triés par score de rendement (les ex æquo partagent la même place), podium des trois premiers, ta position et l'écart avec le joueur juste devant. Onglet « Entre amis » pour ne comparer qu'avec tes amis.

**Amis** — page `/amis` : recherche de joueurs par pseudo, demandes d'amis à accepter ou refuser (pastille dans le menu quand une demande attend), demandes envoyées annulables, liste d'amis avec leur score. Si deux joueurs se demandent mutuellement, l'amitié est acceptée automatiquement.

**Échanges** — page `/echanges` (onglet à côté de Amis, ou bouton « Échanger » sur un ami) : propose à un ami de donner des ingrédients, des produits et/ou des pièces contre d'autres. Ce que tu offres est **mis sous séquestre** dès l'envoi et te revient si l'ami refuse ou si tu annules ; l'acceptation fait l'échange en une seule transaction (impossible de dupliquer ou perdre une carte, même en cliquant deux fois). L'ami doit posséder ce qui est demandé au moment d'accepter. On ne peut échanger qu'entre amis, et seul l'inventaire d'un ami est visible (pas ses pièces). Une pastille signale les propositions reçues.

## Architecture

```
scripts/            import OFF, seed, migrations, calcul des raretés
drizzle/            migrations SQL générées depuis le schéma
src/db/schema.ts    tables Drizzle
src/lib/game.ts     règles et constantes (partagé client/serveur)
src/lib/services.ts logique métier (transactions)
src/lib/inventory.ts ajouts/retraits de cartes, produits, pièces
src/lib/social.ts   amis et classement
src/lib/catalog.ts  catalogue et fiches des cartes
src/lib/trades.ts   échanges entre amis
src/app/api/…       routes JSON
src/app/(game)/…    pages : boosters, collection, marché, produits, usines
```

Chaque opération qui touche à des cartes ou des pièces s'exécute dans une transaction, avec des mises à jour conditionnelles (`quantity >= n`, `coins >= x`, verrou optimiste sur le stock de boosters et l'offre en tête) : impossible de dépenser deux fois le même booster ou la même pièce, même avec des requêtes simultanées.

## Production

- Définir un `SESSION_SECRET` aléatoire de 32 caractères ou plus.
- Le fichier SQLite convient à un serveur unique (VPS, Railway, Fly avec volume). Pour un hébergement serverless (Vercel), utiliser une base [Turso](https://turso.tech) : `DATABASE_URL=libsql://…` et `DATABASE_AUTH_TOKEN=…`, sans changer le code.
- `npm run build && npm start`.

## Pistes d'évolution

- Popularité mesurée sur le site lui-même (consultations des cartes) en complément des scans OFF.
- Échange direct entre joueurs, vente de produits sur le marché.
- Niveaux d'usine (capacité, cadence) payables en pièces.
