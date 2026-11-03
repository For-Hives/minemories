# Plan complet du site Minemories : pages prévues, fonctionnalités, SEO (03/11/2026)

Ce document sert de dossier d'entrée au comité du QG et de cahier des charges pour reconstruire le site. Il rassemble ce qui existait (28 routes retirées de `main` le 30/10/2026, dont une partie a été rétablie le 31/10/2026 : voir §2), ce qui était prévu dans les documents, et ce qu'Andy ajoute le 03/11/2026. Les textes intégraux des anciennes pages sont dans `docs/features/pages-archive-et-audit.md` (annexe A) ; le code est au commit `3894d58`.

```bash
git show 3894d58:apps/web/src/pages/GalleryPage.tsx
```

## 0. Questions posées au comité

1. **SEO.** Critiquer la direction prise (plan SEO du 19/10, `docs/marketing/landing-programme.md` §10 et §11) et dire quelle direction prendre. Andy veut aller plus loin : partir de personas et de vraies recherches humaines, et créer des pages qui répondent à tous ces besoins, pour attirer le plus de monde possible. Cette stratégie est-elle la bonne ? Quelle part est du contenu rédigé, quelle part est produite par le produit lui-même (galerie publique, profils, pages de mondes) ?
2. **Périmètre.** Andy veut reconstruire **toutes** les pages sans perdre aucune fonctionnalité, avec un blog éventuel, des variantes de landing, une galerie publique avec profils, un pricing et une offre physique (impressions 3D, cartes imprimées, cadres). Le comité propose-t-il de tout faire, dans quel ordre, et que supprimer ?
3. **Conflit avec une proposition du comité du 01/11 (tâche #188).** Elle disait : garder seulement la boucle sauvegarde, monde en 3D, lien partagé, et trier les pages avant d'en écrire d'autres. Les tâches #185 et #189 disaient : faire sauvegarder dix joueurs hors de l'entourage avant toute publicité. La demande du 03/11 va dans l'autre sens. À trancher en le disant clairement.
4. **Offre.** Quel pricing, quelle offre physique, et que vérifier avant de vendre (règles commerciales de Mojang, tâche #187).

Les rôles du comité (marketplace, conciergerie) ont été écrits pour My Makeup : pour Minemories, lire « marketplace » comme « galerie publique et catalogue de mondes » et « conciergerie » comme « parcours d'un joueur de l'arrivée au premier souvenir ».

> **Correction du 03/11 (soir)** : la première version de ce document, lue par le comité, disait que `main` ne contenait que la landing. C'était faux : j'avais lu une copie locale de `main` en retard. La galerie, le jumelage, le viewer et le partage sont sur `main` depuis le 31/10. Le comité a donc raisonné sur un blocage qui n'existe plus (« plus personne ne peut obtenir le code de jumelage »).

## 1. Où on en est, en chiffres (source : QG, dossier `minemories`, 03/11/2026)

- Production : `minemories.net` répond 503 (le site n'est pas encore en production, d'après Andy le 01/11). Search Console : 0 clic, 0 impression en octobre. GitHub : 0 étoile ; le 31/10, 0 visiteur et 349 clones par 39 cloneurs (trafic GitHub). Aucune donnée d'usage du site ni du mod (tâche #184).
- `main` contient la landing `/`, une 404 et, rétablies et refondues le 31/10/2026 (commits `6593207` et suivants) : `/login`, `/register`, `/account`, `/gallery` (avec le jumelage), `/viewer` (avec la vue d'un monde), `/share/:token`. Restent archivées : installation, versions, FAQ et pages d'information, blog, pricing, mentions légales, galerie publique (`/explorer`, `/public/:id`), administration, diagnostics, modération. Le mod, l'API et le contrat sont complets.
- Tâche prioritaire d'Andy (#208) : pages à sortir en premier `/`, `/pricing`, `/gallery`, `/login`, `/gallery-public`, avec Polar et Better Auth (#209).
- Décision du 16/10 : paiements désactivés (`POLAR_ENVIRONMENT=off`), tarifs non figés.
- Estimation du marché de `docs/AI/BESOIN.md` (septembre 2026, non revérifiée) : 15 à 35 k€/an à trois ans en l'état. C'est une estimation, pas un chiffre mesuré.

## 2. Plan du site complet

Légende : **[en ligne]** sur `main` ; **[archivé]** code et contenu au commit `3894d58`, absent de `main`;  **[rétabli]** de nouveau sur `main` depuis le 31/10/2026, refondu ; **[prévu]** décrit dans un document, jamais construit ; **[nouveau]** demandé le 03/11/2026.

### 2.1 Public, à indexer

| Route | Contenu | Statut |
|---|---|---|
| `/` | Film d'accueil, étapes, partage, FAQ courte, pied de page | [en ligne] |
| `/en/` (et chaque page sous `/en/…`) | Version anglaise, `hreflang` réciproques | [prévu] (`docs/features/multilingual-web.md`) ; 11 variantes de langue : 8 catalogues complets (fr, en, de, ru, ko, pt-BR, pl, ja), 3 variantes régionales partielles (fr-CA, en-CA, en-GB) |
| `/installation` (aujourd'hui) | Guide interactif : launcher, système, six étapes cochables, dépannage, dix captures Windows réservées | [archivé] |
| `/versions`, `/changelog` | JAR depuis GitHub Releases, SHA-256, notes de version, versions anciennes | [archivé] |
| `/concept` | Pourquoi garder les lieux construits ensemble, ce que n'est pas un souvenir 3D | [archivé] |
| `/fonctionnement` | Capture, jumelage, fichier, partage | [archivé] (recoupe `/installation`) |
| `/faq` | 16 questions | [archivé] |
| `/securite` | Ce que le mod envoie, test réseau, données, éditeur, parents | [prévu] (plan §10) |
| `/histoire` | Page vidéo (le chien sous la pluie), données `VideoObject` | [prévu] |
| `/guides/serveur-qui-ferme`, `/guides/minecraft-to-blender`, `/guides/revoir-un-vieux-monde` | Guides par intention de recherche | [prévu] |
| `/decouvrir`, `/open-source`, `/nostalgie`, `/partager`, `/classement` | Hub de quatre pages au même gabarit, illustrations | [archivé] |
| `/blog`, `/blog/:slug` | Un article (« Un premier souvenir, avec un chemin connu »), schéma `Article` | [archivé] |
| `/pricing` | Calculateur : 2 € le souvenir figé, nuage 6, 5, 4 puis 3 € par an, estimation enregistrée dans le navigateur | [archivé], paiement non activé |
| Boutique physique (impression 3D d'une base, carte imprimée, cadre) | Commande depuis un souvenir : choix de la zone, aperçu, prix, expédition | [nouveau] |
| `/privacy`, `/terms`, `/legal` | Textes légaux courts, à compléter avant la vente (#89) | [archivé] |
| `/explorer`, `/classement` | Galerie publique modérée : recherche littérale, catégories, tri récence ou votes, 24 par page, votes, signalements | [archivé], contrat API complet |
| `/public/:id` | Visualiseur d'un souvenir publié | [archivé] |
| Profil public (`/u/:pseudo` ou équivalent) | Mondes publiés, compteurs, présentation | [nouveau] |
| `sitemap.xml`, `robots.txt` | Générés au build, vides tant que `VITE_INDEXABLE` n'est pas vrai | [en ligne] (prérendu) |

### 2.2 Public, non indexé (campagnes)

| Route | Contenu | Statut |
|---|---|---|
| `/c/fin-de-saison` | Admin de serveur : « Le serveur ferme dimanche. Garde ta base. » | [prévu] |
| `/c/parents` | Parent : ses constructions en 3D, données collectées, suppression | [prévu] |
| `/garder` | Ex-joueur : garder sa base et envoyer le lien au groupe | [prévu] |

Un test de build doit échouer si une page de campagne devient indexable (plan §10).

### 2.3 Compte et espace privé

| Route | Contenu | Statut |
|---|---|---|
| `/login`, `/register` | Email et mot de passe, Google, Discord (si configurés), visite sans compte | [rétabli] |
| `/account` | Pseudo, email, mot de passe (12 caractères au moins), fournisseurs liés | [rétabli] |
| `/gallery` | Jauge de stockage (2 Gio par défaut), liste des captures groupées par monde, renommer, partager (créer, récupérer, révoquer), publier, corbeille 30 jours, suppression définitive, jumelage du mod | [rétabli] |
| `/viewer` | Visualiseur 3D et studio (heure, ciel, nuages, météo, eau, caméra libre), fichier local par glisser-déposer | [rétabli] |
| `/viewer?timelapse=1` (vue d'un monde) | Toutes les captures d'un monde composées chunk par chunk, liste chronologique et curseur | [rétabli] |
| `/share/:token` | Visualiseur d'un lien privé, sans compte, révocable | [rétabli] |
| Aperçu de partage (image 1200×630) | Généré à la création du lien, pour Discord et X | [prévu] |

### 2.4 Opérateur (hors site public)

| Route | Contenu | Statut |
|---|---|---|
| `/admin` | Chiffres du service, recherche de comptes, rôles, journal | [archivé] |
| `/admin/diagnostics` | Diagnostics du mod envoyés avec consentement, regroupés par erreur | [archivé] |
| `/moderation` | File des publications et signalements, décision avec motif | [archivé] |

## 3. Fonctionnalités à ne pas perdre

### 3.1 Mod (côté joueur)

| Fonction | État |
|---|---|
| Export d'une zone en GLB autonome (textures, transparence, lumière, entités figées, joueur) ; rayon 2 à 128 ou sélection par deux coins | en jeu |
| Captures AFK (5 min d'inactivité, une toutes les 4 h, rayon 32), activées par défaut, désactivables | en jeu |
| Profondeur limitée à ce qui a été visité (+5 blocs) | en jeu |
| Historique local des captures, menu M (jumelage, capture manuelle, envoi, AFK, réglages avancés) | en jeu |
| Jumelage par code à 6 chiffres (5 min, usage unique), envoi reprenable (450 Mio max), rien n'est envoyé avant le jumelage | en jeu ; le code se génère dans la galerie rétablie le 31/10 |
| Diagnostics avec consentement (activés par défaut, rien envoyé avant jumelage) | en jeu |
| Chargeurs : NeoForge 21.1.248, Fabric (et Quilt), Forge, Minecraft 1.21.1 | validés |
| Installation sans configuration, interface à icônes (#156) | en cours |

### 3.2 API (compte, stockage, partage)

| Fonction | État |
|---|---|
| Comptes (email, Google, Discord), changement de pseudo, email, mot de passe, sessions | en service côté API |
| Souvenirs : liste, renommage, corbeille 30 jours, restauration, suppression définitive durable | en service |
| Stockage par compte (quota 2 Gio), stockage froid, réconciliation | en service |
| Partage privé par lien (créer, récupérer, révoquer, chiffré) | en service |
| Publication publique : consentement, miniature, modération par une autre personne, votes (un par compte), signalements, limites horaires | en service |
| Évolution d'un monde (captures identifiées par monde et zone, composées chunk par chunk) | en service |
| Facturation Polar (checkout, webhooks, projection) | socle prêt, **désactivé** |
| Administration (rôles, métriques, journal) et diagnostics privés | en service |

### 3.3 Interface web (à reconstruire)

| Fonction | Page |
|---|---|
| Générer le code de jumelage (la liste des appareils jumelés n'était pas dans la galerie : à vérifier) | galerie |
| Parcourir, renommer, regrouper par monde, corbeille, jauge de stockage | galerie |
| Visualiseur : orbite centrée sur le joueur, déplacement libre, ciel et heure, nuages, pluie et neige artistiques, eau, bloom, performance adaptative, mode économie | viewer |
| Vue d'un monde dans le temps : curseur, lecture automatique, anciennes captures masquables | viewer |
| Partager : lien copiable, ouvrir, révoquer, remplacer | viewer et galerie |
| Publier dans la galerie publique et suivre l'état de modération | galerie |
| Catalogue public : recherche, catégorie, tri, vote, signalement | explorer |
| Compte : pseudo, email, mot de passe, fournisseurs liés | compte |
| Compteurs « avec le plugin » : captures, mondes, volume, dernière capture, appareils jumelés | profil, galerie |
| Installation guidée, téléchargements, notes de version | installer |
| Sélecteur de langue (11 langues), réduction des animations, police lisible | partout |

### 3.4 Nouveautés demandées le 03/11/2026

| Fonction | Remarque |
|---|---|
| Profil public avec les mondes publiés, compteurs et présentation | La publication actuelle ne contient aucun champ de profil : modèle de données et vie privée à définir (pseudo public, ni serveur, ni coordonnées, ni seed, voir `docs/features/public-discovery.md`) |
| Interaction avec le plugin depuis le profil (statut du mod, dernier envoi, AFK, compteurs) | Les compteurs existent côté admin seulement ; à exposer par compte |
| Impressions 3D, cartes imprimées, cadres | Rien n'existe : fabrication, partenaire, formats de fichier (STL, GLB vers impression), prix, expédition, droits |
| Blog | Un seul article aujourd'hui |
| Variantes de landing | Plan §10 : un gabarit `LandingTemplate` à trois héros |
| Sitemap complet | Déjà généré au prérendu ; à étendre aux pages dynamiques publiques |

## 4. La direction SEO prise jusqu'ici (faits)

Source : `docs/marketing/landing-programme.md` §10 et §11, 19/10/2026.

- Principe : **aucune page indexée par persona**. Un persona entre par une intention (page indexée unique) ou par un canal (campagne non indexée). Raison donnée : les pages par public seraient exposées à la politique de Google contre les pages satellites.
- Mots-clés tirés de l'**autocomplétion du 19/10, sans volume de recherche** : sept intentions (marque et confiance, export vers Blender, serveur qui ferme, installation, émotion vidéo, vieux monde, sauvegarde générique repoussée).
- Pages prévues : `/installation`, `/securite`, deux guides Blender, `/guides/serveur-qui-ferme`, `/histoire`, `/guides/revoir-un-vieux-monde`.
- Levée du `noindex` par lots **en mars 2027**, après dix prérequis (domaine final, nginx corrigé, `hreflang`, mentions légales, Modrinth, Search Console).
- État technique constaté : nginx de production ne sert pas la conf du dépôt (pas de vraies 404, pas de `X-Robots-Tag`, `/en/` sert du français), sitemap vide, `Disallow: /` volontaire.
- Les sept personas (Léo, Morgan, Jules, Camille, Sarah, Alex, Marc) sont **simulés** par un même modèle : aucune réaction de vraie personne (le plan le dit lui-même).

## 5. Critique de cette direction (à challenger par le comité)

Faits d'abord, avis ensuite.

**Ce qui tient.**
- Ne pas faire une page indexée par persona : c'est juste. Un persona est un public, pas une recherche : personne ne tape « parent de joueur Minecraft ». Plusieurs pages quasi identiques ne changeant que l'accroche sont le cas type de page satellite.
- Entrer par l'intention (ce que la personne tape) est la bonne unité.

**Ce qui ne tient pas, ou pas assez.**
1. **Aucun volume de recherche.** Sept intentions tirées de l'autocomplétion ne disent pas quelles requêtes valent une page. Il faut des volumes (outils de mots-clés, Search Console une fois le site en ligne, Bing) avant de produire des dizaines de pages.
2. **Trop peu de pages, trop tard.** Une levée en mars 2027 pour six pages ne crée aucune présence de recherche. La marque « minemories » n'a aucune suggestion : tout le trafic de découverte est à créer.
3. **La marque est le premier besoin.** Les requêtes « minemories avis / virus / github » mènent à la confiance : sans fiche Modrinth, sans `/securite`, sans mentions, un visiteur qui cherche le nom ne trouve rien de rassurant.
4. **La plus grosse source de pages indexables n'est pas du texte.** Une galerie publique, des profils et des pages de mondes produisent, à chaque publication, une page unique (titre, description, catégorie, miniature, 3D). C'est du contenu généré par les joueurs, avec une valeur propre par page, ce qu'aucune page rédigée en série n'a. Le plan SEO du 19/10 n'en parle pas : il met `/explorer` en `noindex` sous 20 captures publiques, ce qui est prudent mais n'organise pas la suite.
5. **Aucune page « outil ».** Des pages qui résolvent une tâche attirent des recherches d'action : voir un fichier `.glb` Minecraft en ligne, convertir un monde Minecraft en modèle 3D, exporter une zone vers Blender, imprimer une base en 3D. Un visualiseur qui s'ouvre sans compte (mode fichier local, déjà prévu) est ici l'atout.
6. **Le plan ne couvre ni la vente ni l'impression**, alors que les requêtes d'achat (impression 3D de sa base Minecraft, cadre de carte Minecraft) ont une intention commerciale forte.
7. **Le pari de langue est flou.** Le français à la racine et l'anglais sous `/en/` est bon, mais l'anglais domine les requêtes d'outil (le plan le note pour Blender) : l'anglais ne devrait pas arriver après le français.

**Le risque de la stratégie « une page pour chaque besoin ».** Produire en masse des pages rédigées pour couvrir toutes les recherches, surtout avec un modèle de langage, expose à la politique de Google contre le contenu produit à grande échelle pour classer (« scaled content abuse », mars 2024) : à vérifier dans la documentation de Google avant de s'engager. La règle de sécurité : une page n'existe que si elle apporte une réponse, une donnée ou un outil qu'on ne trouve pas ailleurs (capture réelle, test du mod, chiffres mesurés), jamais pour une variante de mot-clé.

**Contraintes de marque.** « Minecraft » après « Minemories » dans les titres, aucune texture Mojang dans les images partagées, disclaimer partout, règles commerciales à vérifier avant de vendre (#187).

## 6. Directions SEO à comparer (à trancher avec le comité)

| Direction | Principe | Pages | Risque |
|---|---|---|---|
| A. Plan du 19/10 | Intentions, six guides, levée en mars 2027 | 6 à 8 | Lent, peu de portée |
| B. Hubs par intention | Un hub par besoin (serveur qui ferme, vieux monde, Blender, impression 3D, parents), 5 à 8 sous-pages chacun, chaque page avec une preuve | 30 à 60 | Effort rédactionnel, contenu mince si pas de preuve |
| C. Contenu produit par les joueurs | Galerie publique, profils, pages de mondes indexables avec consentement, données structurées, images de partage | croît avec l'usage | Modération, vie privée, qualité inégale |
| D. Pages outils | Visualiseur de fichier local, convertisseur, calculateur d'impression | 3 à 6 | Dépend de la qualité de l'outil |
| E. B + C + D, par vagues | Mesurer d'abord (Search Console, Bing, volumes), puis étendre là où des requêtes existent | variable | Demande de la discipline de mesure |

Hypothèse de travail à valider ou rejeter par le comité : **E**, en commençant par la marque, l'installation, `/securite`, la galerie publique et deux pages outils, avec une mesure de chaque page avant d'en écrire d'autres.

## 7. Offre et pricing (état)

- Offre figée dans le code et la documentation : **2 € par souvenir figé**, puis stockage nuage **6, 5, 4, puis 3 € par an** par souvenir, jusqu'à 100 souvenirs et 10 ans dans le calculateur. Paiements désactivés ; aucune règle de quota liée à un abonnement.
- BESOIN.md (septembre) jugeait ce modèle risqué (il attaque l'utilisateur au pire moment de son cycle) et recommandait : timelapse et rétrospective gratuits et viraux, archive permanente payante, cible l'admin de serveur, produit physique (ticket vingt fois supérieur, pic saisonnier).
- Test d'envie d'acheter proposé le 01/11 (#192) : bouton d'impression ou de cadre sur un vrai monde, mesuré par les clics, avant de chercher un imprimeur.
- À vérifier avant de vendre : règles d'usage commercial de Minecraft (#187), compte et conditions Polar (#63), mentions légales (#89), conformité de l'offre.
- À concevoir : gratuit contre payant (nombre de souvenirs, durée de conservation, taille, galerie publique), offre physique (impression 3D d'une base, carte imprimée, cadre), livraison, retours, fabricant.

## 8. Plan de production des pages

### 8.1 Principe de design

- Partir de la charte de `main` (`docs/features/charte-graphique.md`, `docs/features/design-system.md`) : ardoise et cuivre, police du jeu pour les titres et les commandes, voix de lecture sans empattement, composants `mc-*`, quatre durées et trois courbes de mouvement, mouvement réduit respecté.
- Références visuelles à rassembler avant les maquettes : Dribbble, Pinterest, 21st.dev (composants), et des sites de jeu ou d'outils sur navigateur. À relever pour chacune : structure de page, composants, mouvement. Aucun visuel copié ; seulement des principes.
- Une seule voix visuelle pour toutes les pages (aujourd'hui trois systèmes se côtoient dans l'archive).

### 8.2 Ordre proposé (à valider avec le comité)

0. **Déjà fait le 31/10** : connexion, compte, galerie avec jumelage, viewer, vue d'un monde et lien de partage sont rétablis. Reste le retrait du consentement aux diagnostics web (la page de confidentialité n'existe plus) et l'aperçu de partage.
1. **Cœur du produit** (tâche #208) : il reste `/gallery-public`, `/pricing` (sans paiement actif), mentions légales ; le reste est rétabli, à passer dans la charte.
2. **Confiance et acquisition de base** : `/installer`, `/versions`, `/securite`, `/aide`.
3. **Profil et catalogue public** : profils, pages de mondes publiés indexables, aperçus de partage.
4. **Contenu** : guides par intention, blog, variantes de landing non indexées.
5. **Commerce** : boutique physique et paiement, seulement après #187, #63 et #89.

### 8.3 Critères de fin par page

Composants de la charte uniquement ; contenu lisible sans JavaScript ; métadonnées, `canonical`, `hreflang` et `robots` justes ; test d'interaction ; couverture de `src/lib` à 100 % ; contrôle visuel documenté ; ancien contenu repris depuis `pages-archive-et-audit.md`.

## 9. Ce qu'on ne sait pas

- Aucun volume de recherche réel ; aucune réaction de vrais visiteurs (les personas sont simulés).
- Aucune donnée d'usage du site ou du mod ; aucun joueur hors entourage n'a sauvegardé un monde.
- Les règles commerciales de Mojang pour vendre des impressions ou des cadres de mondes joueurs.
- La part du marché prête à payer ; le coût réel d'une impression 3D, d'un cadre et de leur expédition.
- Le comportement de Google sur des pages de mondes générées par des joueurs (indexation, qualité perçue).
- Le temps de reconstruction réel de toutes les pages : l'archive pèse environ 12 000 lignes de TSX et 3 400 de CSS, à refaire dans la charte.
