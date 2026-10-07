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
- `npm run images:fetch` cherche une photo pour les ingrédients qui n'en ont pas (lancé automatiquement par le seed). Les requêtes sont espacées et réessayées si un site limite le débit ; un ingrédient dont la recherche a échoué n'est pas marqué et sera retenté au lancement suivant. Ajoute `-- --all` pour retenter aussi ceux déjà vérifiés sans photo.
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
- *Banque* : rachat immédiat selon la rareté — **Commun 1, Peu commun 5, Rare 10, Super rare 25, Légende 50** pièces (`BANK_BUYBACK`). Même barème pour les produits, vendables à la banque depuis l'onglet Produits de la collection. Chaque joueur démarre avec 500 pièces. La valeur indicative sert seulement de prix suggéré sur le marché.
- *Prix fixe* : les cartes sont mises sous séquestre à la publication, rendues si l'annonce est retirée.
- *Enchères* : 10 min, 1 h, 6 h ou 24 h. Chaque surenchère doit dépasser l'offre en tête d'au moins 5 %. Les pièces du meilleur enchérisseur sont bloquées et rendues automatiquement s'il est dépassé. Une offre dans la dernière minute prolonge d'une minute (anti-sniping). Les enchères échues sont réglées à la première consultation du marché qui suit.

**Le Chef** — PNJ en haut du marché : chaque jour (minuit, heure de Paris), il demande 5 ingrédients tirés au hasard, les mêmes pour tous les joueurs, et rachète chacun **50 pièces** (`CHEF_*` dans `src/lib/game.ts`). Chaque joueur peut lui livrer une carte de chaque ingrédient par jour. Un clic sur un ingrédient ouvre « Où trouver… ? ». Tables `chef_quests` et `chef_deliveries`, migration 0009 ; les commandes de plus d'une semaine sont effacées.

**Offres de la banque** — en haut du marché, 5 produits tirés au hasard, à 500 pièces avec une réduction aléatoire de 0 à 80 % (`BANK_*` dans `src/lib/game.ts`). Elles sont les mêmes pour tous les joueurs et changent à chaque heure pile (compte à rebours affiché) ; chaque joueur peut acheter chaque offre une fois. Un clic sur une offre ouvre la fiche du produit : les ingrédients utilisés (avec ceux que tu possèdes, chacun ouvrant « Où trouver… ? ») et un bouton d'achat. Les offres sont créées à la première consultation de l'heure (tables `bank_offers` et `bank_purchases`, migration 0006) et celles de plus de 48 h sont effacées.

**Demandes** — onglet « Demandes » du marché (bouton « Faire une demande », ou depuis « Où trouver… ? ») : un joueur indique la carte qu'il cherche, la quantité et le prix par carte ; le total est mis de côté. Les autres joueurs qui ont la carte la vendent directement, en une ou plusieurs fois, et reçoivent aussitôt les pièces ; le demandeur reçoit les cartes. L'auteur peut annuler : le reste non dépensé lui revient. **3 demandes en cours maximum par joueur** (`MAX_OPEN_REQUESTS`). Table `buy_requests`, migration 0007.

**Collection** — un clic sur une carte d'ingrédient ouvre la liste des produits qui l'utilisent, du plus proche d'être fabricable au plus lointain : bouton « Fabriquer » quand tout est réuni, ingrédients manquants cliquables (« Où trouver… ? »), lien vers la fiche complète. Le bouton « Vendre » de la carte reste inchangé.

**Fabrication** — consomme 1 carte de chaque ingrédient du produit, par exemplaire. Un clic sur un produit ouvre son sous-menu : recette (ingrédients possédés / manquants), quantité à fabriquer. Un clic sur un ingrédient de la recette ouvre « Où trouver… ? » : les annonces du marché (achat direct, du moins cher au plus cher), les enchères en cours (lien vers l'onglet Enchères) et les amis qui possèdent la carte, avec un bouton qui ouvre une proposition d'échange où la carte est déjà demandée. Animation : les cartes ingrédients rejoignent le centre une à une, puis la carte produit apparaît, avec son.

**Usines**
- *Construction* : coûte 3 produits contenant l'ingrédient voulu. **Une seule usine par ingrédient** (et une seule usine de produits par produit) : les ingrédients déjà équipés disparaissent de la liste, et le serveur refuse un doublon même en cas de double clic. Pour produire plus, on améliore l'usine existante. La liste est triée par progression (3/3, puis 2/3, puis 1/3 ; à égalité, la plus rentable). Un clic sur une ligne ouvre son sous-menu : les produits éligibles que tu possèdes, à choisir exactement (ou « Remplir automatiquement »), puis les produits contenant l'ingrédient, du plus proche d'être fabricable au plus lointain, avec un bouton « Fabriquer » quand tout est réuni et les ingrédients manquants cliquables (« Où trouver… ? »). Animation : les cartes produits fusionnent, puis la carte usine apparaît, avec son.
- *Indicateurs* : en haut de la page, « usines d'ingrédients construites / ingrédients du jeu » et « usines de produits / produits du jeu », avec une barre de progression (rappelés à côté des titres de section).
- *Nouvelle usine* : un seul menu en bas de la page, avec deux onglets — « Ingrédient » (construction avec 3 produits) et « Produit (fusion) ». Une pastille verte sur chaque onglet indique combien d'usines sont constructibles tout de suite.
- *Tout récolter* : un bouton en haut de « Mes usines » récolte d'un coup toutes les usines prêtes (ingrédients et produits), en une seule transaction.
- *Production* : selon la rareté de l'ingrédient (5 min → 12 h au niveau 1), stock plafonné. La progression du cycle en cours est conservée à la récolte.
- *Niveaux* (1 à 10) : chaque niveau accélère la production de 25 % et ajoute 6 places de stock (niveau 10 : ×3,25 et 78 places). Passer du niveau N à N+1 coûte `40 × N × multiplicateur de rareté` pièces (×1 à ×4) et `2 × N` cartes de l'ingrédient produit. La production prête est récoltée automatiquement au moment de l'amélioration.
- *Rendement* : chaque carte produite vaut des points selon sa rareté (Commun 1, Peu commun 4, Rare 20, Super rare 100, Légende 360). Le rendement d'une usine = cartes par heure × points ; au niveau 1 : 12, 16, 20, 25 et 30 pts/h selon la rareté, donc une usine rare reste plus rentable malgré sa lenteur. Le **score de rendement** du joueur est la somme de ses usines.

**Usines de produits** — une usine pour chaque ingrédient d'un produit peuvent fusionner en une usine qui fabrique directement ce produit. Le sous-menu de fusion laisse choisir quelle usine sacrifier pour chaque ingrédient (par défaut la moins rentable). Leur production en attente est récoltée avant la démolition. La nouvelle usine rapporte **+50 %** de rendement par rapport aux usines fusionnées (`PRODUCT_FACTORY_BONUS`) : sa cadence est calculée pour cela à partir de leurs niveaux. Elle s'améliore jusqu'au niveau 10 (pièces + exemplaires du produit) et compte dans le score et le classement.

**Toutes les cartes** — page `/cartes` : le catalogue complet des ingrédients et des produits, avec recherche (nom ou marque), filtres par rareté et par possession (possédées / manquantes), tri (rareté, popularité, nom) et compteur de cartes découvertes. Les cartes manquantes sont grisées. Chaque carte ouvre une fiche : pour un ingrédient, sa popularité, sa valeur, les offres du marché et la liste des produits qui l'utilisent ; pour un produit, sa recette avec tes quantités et un raccourci pour le fabriquer. On navigue d'une fiche à l'autre (ingrédient → produit → ingrédient).

**Classement** — page `/classement` : tous les joueurs triés par score de rendement (les ex æquo partagent la même place), podium des trois premiers, ta position et l'écart avec le joueur juste devant. Onglet « Entre amis » pour ne comparer qu'avec tes amis.

**Amis** — page `/amis` : recherche de joueurs par pseudo, demandes d'amis à accepter ou refuser (pastille dans le menu quand une demande attend), demandes envoyées annulables, liste d'amis avec leur score. Si deux joueurs se demandent mutuellement, l'amitié est acceptée automatiquement.

**Messages** — page `/messages` : chat général (tous les joueurs), chat de guilde et messages privés entre amis (uniquement entre amis). Les nouveaux messages arrivent tout seuls (vérification toutes les 3 s tant que la page est ouverte), « Messages précédents » charge l'historique par 50, Entrée envoie (Maj+Entrée pour aller à la ligne). 500 caractères maximum, un message par seconde au plus. Une pastille dans le menu compte les messages privés et de guilde non lus ; bouton « Écrire » sur chaque ami. Tables `messages` et `chat_reads`.

**Guildes** — page `/guildes` (onglet à côté de Amis) : fonder une guilde (nom unique, blason de 2 à 4 caractères affiché `[TAG]` à côté du pseudo dans les chats), la rejoindre librement (20 membres maximum, une seule guilde par joueur), la quitter. Le chef modifie la description et peut exclure ; s'il part, le plus ancien membre prend la tête ; le dernier qui part dissout la guilde et son chat. Classement des guildes par somme des rendements de leurs membres. Les arrivées, départs et changements de chef sont annoncés dans le chat de guilde. Tables `guilds` et `guild_members`, migration 0008.

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

## Mise en ligne (Render + Turso)

Le jeu n'a aucune tâche de fond (boosters, usines et enchères sont calculés à la consultation) : il fonctionne très bien sur l'offre gratuite de Render, qui met le site en veille après 15 min sans visite (premier chargement ensuite ≈ 1 min). Le disque de Render gratuit est effacé à chaque redémarrage : la base est donc hébergée chez **Turso** (SQLite en ligne, offre gratuite), sans changer le code.

1. **Base Turso** — sur turso.tech, créer une base (région Francfort ou Paris), puis récupérer son URL (`libsql://….turso.io`) et créer un jeton d'accès.
2. **Remplir la base** depuis le PC, dans l'invite de commandes (cmd), dans le dossier du projet. Les variables ne valent que pour cette fenêtre ; ailleurs, le jeu local continue d'utiliser `unboxipe.db`. Pas de guillemets ni d'espace autour du `=` :
   ```bat
   set DATABASE_URL=libsql://ma-base.turso.io
   set DATABASE_AUTH_TOKEN=le-jeton
   npm run setup
   ```
   (Équivalent PowerShell : `$env:DATABASE_URL="..."`, puis `npm.cmd run setup` si PowerShell refuse d'exécuter `npm`.)
3. **Code sur GitHub** — dépôt privé, par exemple avec GitHub Desktop. `.gitignore` exclut déjà `.env`, la base locale, `node_modules` et `.next`.
4. **Render** — New → Blueprint → choisir le dépôt : `render.yaml` crée le service (build `npm install && npm run build`, démarrage `npm start`, Node 22, `SESSION_SECRET` généré). Saisir `DATABASE_URL` et `DATABASE_AUTH_TOKEN` quand Render les demande.
5. Chaque `git push` redéploie automatiquement. Les migrations s'appliquent seules au démarrage.

Le compte de test (`give-all`) et les autres scripts fonctionnent aussi sur la base en ligne avec les deux variables ci-dessus.

## Pistes d'évolution

- Popularité mesurée sur le site lui-même (consultations des cartes) en complément des scans OFF.
- Vente de produits sur le marché.
