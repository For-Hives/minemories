# Les autres pages du site : archive, audit et chemin vers la charte (30/10/2026)

Ce fichier remplace, pour l'instant, toutes les pages du site sauf la landing (`/`). Il garde leur contenu, dit ce qui est utile ou pas, et propose comment chacune devient une page de la charte graphique (`docs/features/charte-graphique.md`).

Le code des pages n'est pas perdu : il est dans l'historique de `main`, au commit `3894d58` (le dernier avant ce changement). Un tag local `archive/pages-v1-2026-10-30` le désigne aussi, mais il n'est pas poussé : utilise le hash.

```bash
git show 3894d58:apps/web/src/pages/GalleryPage.tsx
git diff 3894d58 HEAD --stat
```

## 1. Ce qui a été retiré, et ce qui reste

Reste : la landing `/` (film, étapes, partage, FAQ, pied de page), la page 404 minimale, le chargement, la charte et le design system.

Retiré : les 28 routes ci-dessous, leur code (`apps/web/src/pages`, composants et bibliothèques du visualiseur 3D et de la galerie), leurs tests et leurs feuilles de style.

Conséquences à connaître avant d'aller plus loin :

- Le jumelage du mod (code à 6 chiffres) se génère dans la galerie, qui n'existe plus : sans galerie web, un joueur ne peut plus lier son mod à son compte, donc plus d'envoi de captures. Le mod continue d'exporter en local (`~/export/capture.glb`).
- Les liens partagés (`/share/:token`, `/public/:id`) ne s'ouvrent plus, alors que l'API continue d'en fabriquer (`urlPath: /share/<token>`).
- Le mod ouvre `https://<site>/gallery` (bouton « galerie » de son interface, `ClientSettings.DEFAULT_SITE_URL + "/gallery"`) : il tombera sur la 404.
- Le retour de paiement (`return_url`, `success_url`) de l'API pointe vers `/gallery`.
- Le consentement aux diagnostics web (opt-in, désactivé par défaut) se retirait depuis la page `/privacy`. `WebObservability` reste monté : un visiteur qui avait accepté continue d'envoyer des erreurs de la landing sans interface pour retirer son accord. À traiter (case dans les options d'accessibilité du pied de page de la landing, ou retrait du composant) avant toute mise en ligne de cette branche.
- L'API (`apps/api`) et le contrat (`packages/api-contract`) ne bougent pas : tout ce qui a été retiré peut être reconstruit sans toucher au serveur.
- Les mentions légales (`/privacy`, `/terms`, `/legal`) sont retirées : il faudra les rétablir avant tout lancement public (voir §5).
- Les boutons de la landing qui pointaient vers ces pages (installer, se connecter, explorer) ont été retirés ou remplacés par des ancres de la landing.

## 2. Inventaire des routes retirées

| Route | Rôle | Accès | Lignes de code (TSX) | Verdict |
|---|---|---|---|---|
| `/decouvrir` | Hub de 4 chemins (open source, nostalgie, partage, classement) | public | 382 (avec les 3 suivantes) | Fusionner dans la landing |
| `/open-source`, `/nostalgie`, `/partager` | 3 pages au même gabarit : titre, chapô, 3 points, histoire, note | public | idem | Supprimer, garder les textes |
| `/explorer`, `/classement` | Galerie publique (modérée) ou démo à données fictives, classement par votes | public | 510 | Reporter : la galerie publique n'est pas ouverte |
| `/concept` | Pourquoi (reste de saison, enfant, serveur fermé) | public | 352 (avec les 2 suivantes) | Fusionner dans la landing |
| `/fonctionnement` | 3 étapes détaillées, commandes, touche M | public | idem | Fusionner avec `/installation` |
| `/faq` | 16 questions | public | idem | Garder 6 à 8 questions sur la landing |
| `/installation` | Guide interactif en 6 étapes, choix du chargeur, prénom, dépannage | public | 929 (page + étapes) | Garder, à refaire |
| `/versions`, `/changelog` | Téléchargements JAR depuis GitHub Releases, notes de version | public | 83 + 93 + 84 | Garder `/versions`, fusionner `/changelog` |
| `/blog`, `/blog/:slug` | Un seul article (« Un premier souvenir ») | public | 123 | Suspendre |
| `/pricing` | Calculateur de budget, paiements non activés | public | 223 | Suspendre |
| `/privacy`, `/terms`, `/legal` | Textes légaux (à compléter) | public | idem | Rétablir avant le lancement |
| `/login`, `/register` | Connexion, inscription, fournisseurs sociaux | public | 241 | Garder, à refaire |
| `/account` | Nom, email, mot de passe, fournisseurs liés | session | 242 | Garder, à simplifier |
| `/gallery` | Galerie privée : captures, stockage, jumelage, partage, corbeille, publication | session | 871 + 103 | Le cœur du produit, à refaire en premier |
| `/viewer` | Visualiseur 3D (fichier local ou capture) avec studio (ciel, météo, heure) | public | 264 + 240 | Le cœur du produit |
| `/share/:token`, `/public/:id` | Visualiseur d'une capture partagée | lien | 183 | Le cœur du partage |
| `/admin`, `/admin/diagnostics`, `/moderation` | Outils d'opérateur : chiffres du service, rôles, diagnostics du mod, file de modération | opérateur | 302 + 256 + 105 | Hors site public, à garder à part |
| `*` | Page 404 | public | dans ContentPages | Gardée (minimale) |

Taille totale retirée : environ 12 000 lignes de TSX, 3 400 lignes de CSS propres aux pages (hors `theme.css`), 8 langues de textes.

## 3. Fiches : ce que chaque page contenait

### Parcours d'information

**`/concept`** : « Les constructions restent, même quand la saison se termine ». Trois blocs : le problème (un serveur qui ferme, des modpacks introuvables), la promesse (un souvenir 3D qu'on ouvre dans un navigateur, sans Minecraft), la limite (un instantané qu'on regarde, pas une sauvegarde). Pour qui : admin de serveur en fin de saison, parent avec son enfant, joueur occasionnel, créateur de modpack. Texte intégral en annexe.

**`/fonctionnement`** : trois étapes (installer et ouvrir le monde, choisir une petite zone et capturer, retrouver le fichier), plus les commandes (`/minemories export 16`, sélection par deux coins), la touche M, la profondeur souterraine limitée, les faces fermées « terre/pierre ». Doublonne en grande partie `/installation`.

**`/faq`** : 16 questions. Sauvegarde ou pas, compte et mod requis pour voir, build vanilla, compatibilité des mods, serveur, partage et enfant, envois automatiques (AFK), retrouver une ancienne capture, serveur fermé ou ZIP, partie manquante, échec de jumelage, timelapse, impression 3D, abonnement. La landing en reprend 4.

**`/installation`** : guide interactif. Choix du chargeur (NeoForge, Fabric, Forge), prénom facultatif, option « réduire les animations », six étapes cochables avec barre de progression, cinq cas de dépannage (installateur NeoForge, dossier mods, touche M, plantage au démarrage, capture vide), captures d'écran Windows. C'est la page la plus travaillée et la plus utile du site.

**`/versions` et `/changelog`** : liste des JAR depuis l'API GitHub Releases (cache, repli en cas de limite de débit), somme SHA-256 à vérifier, notes de version, « Charger les versions plus anciennes ». Les deux routes affichent le même composant, l'une centrée sur le téléchargement, l'autre sur les notes.

**`/decouvrir`, `/open-source`, `/nostalgie`, `/partager`, `/classement`** : quatre pages « marketing » au même gabarit (accent de couleur, trois points, histoire, note) autour d'illustrations : un curseur qui montre trois étapes d'une construction, une démo de favoris et de votes stockés en local. Textes intégraux en annexe.

**`/blog`** : un seul article, daté du 14/10/2026, « Un premier souvenir, avec un chemin connu ». Repris en annexe.

**`/pricing`** : « Gardez vos mondes. Préparez l'avenir. » Calculateur (1 à 100 instantanés, 1 à 10 ans, nuage en option) : 2 € par instantané à la création, puis nuage à 6, 5, 4 puis 3 € par an. Estimation enregistrée dans le navigateur. Aucun paiement n'est actif, ce qui est écrit sur la page.

**`/privacy`, `/terms`, `/legal`** : trois textes courts et honnêtes, avec des réserves (« informations à compléter avant le lancement commercial »). Annexe.

### Parcours produit

**`/login`, `/register`** : écran à deux colonnes (formulaire, illustration d'un village sur une île avec « Le jeu se termine. L'histoire continue. »), connexion sociale, option « visiter sans compte » (ouvrir un fichier local ou la galerie publique).

**`/account`** : nom affiché, email, mot de passe (12 caractères minimum), fournisseurs liés, avec des messages d'erreur précis.

**`/gallery`** : la page centrale. Jauge de stockage (utilisé, réservé, suppression en cours), liste de captures avec renommage de la zone, regroupement par monde, ouverture dans le visualiseur, partage par lien (créer, révoquer), publication dans la galerie publique (avec modération), corbeille de 30 jours, suppression définitive, jumelage du mod par code à 6 chiffres (5 minutes, usage unique), état vide « Le premier souvenir reste à venir ».

**`/viewer`** : visualiseur Three.js plein écran (« Dépose ton monde ici »). Studio : heure du jour, ciel, nuages, météo, eau, caméra libre. Mode chronologie (« Ton monde à travers le temps ») : captures datées d'un même lieu avec un curseur.

**`/share/:token` et `/public/:id`** : le même visualiseur sans interface de compte, avec l'invitation « Garde tes propres mondes ».

### Parcours opérateur

**`/admin`** : chiffres du service (comptes, captures, volume, appareils jumelés, objets archivés), recherche de comptes, promotion et retrait du rôle administrateur, journal des 50 derniers changements.

**`/admin/diagnostics`** : diagnostics du mod envoyés avec consentement, groupés par erreur, filtres par version du mod et de l'API. Réservé aux identifiants de `DIAGNOSTICS_OPERATOR_IDS`.

**`/moderation`** : file des publications et des signalements, décision avec motif, interdiction de décider sur sa propre publication.

## 4. Audit : ce qui est utile, ce qui ne l'est pas

### Ce qui est utile

1. **Le visualiseur, la galerie et le partage** : c'est le produit. Rien d'autre sur le site ne justifie la visite.
2. **L'installation et les versions** : la seule raison de venir pour la première fois. Le dépannage est un vrai avantage.
3. **La FAQ, en version courte** : les réponses sur la vie privée (privé par défaut, aucun envoi avant jumelage, lien révocable) sont ce qui rassure un parent ou un admin.
4. **Les textes légaux** : obligatoires dès que le site est public.
5. **L'administration et les diagnostics** : utiles aux opérateurs, mais ne sont pas des pages de site.

### Ce qui ne l'est pas, ou pas encore

1. **Trois pages d'information qui disent la même chose** : `/concept`, `/fonctionnement`, `/installation` et la FAQ se recoupent sur le jumelage, la touche M, les envois automatiques, la profondeur et le partage. Un visiteur lit trois fois la même explication.
2. **Quatre pages « découvrir »** : `/open-source`, `/nostalgie`, `/partager`, `/classement` ont le même squelette et peu de contenu propre. Les phrases fortes (« Tu te souviens de notre première maison ? ») sont meilleures dans la landing, où elles ont le film derrière elles.
3. **Un blog d'un article** : un blog vide ne marque pas le sérieux, il marque l'inachevé.
4. **Une page de prix sans paiement** : un calculateur qui dit « paiements non activés » crée une attente sans la satisfaire. Les tarifs ne sont pas figés non plus.
5. **Une galerie publique et un classement sans contenu** : la démo à données fictives (« Notre première maison », 24 cœurs) fait un faux de communauté.
6. **Un changelog à part** : l'information est déjà dans chaque version.
7. **Des outils d'opérateur dans le même site** : pas de place dans une charte publique ; ils ont besoin d'un autre cadre (tableau, densité), pas d'une page marketing.

### Les problèmes de fond

1. **Trois systèmes visuels côte à côte.** La landing suit la charte du jeu (police pixel, ardoise, cuivre, panneaux biseautés). Les pages installation, compte, administration et authentification utilisent le kit `mm-*` (`theme.css`, `album.css`, `auth.css`, 3 400 lignes) avec des polices et des ombres sans rapport. Les pages d'information sont en Tailwind brut (`max-w-3xl`, `underline`). Passer d'une page à l'autre change de site.
2. **Le passage landing vers application est brutal.** Le visiteur sort d'un film plein écran pour tomber sur une page blanche d'application, avec un autre bandeau, un autre pied de page, une autre langue visuelle.
3. **Des routes qui répètent la landing.** Le sélecteur de langue et la navigation existaient deux fois (une version dans la landing, une dans `SiteLayout`).
4. **Une promesse plus grande que le produit.** Le site parle d'une galerie publique, d'un classement, de timelapse, de prix et d'un blog, alors que le produit livre : capturer, envoyer, regarder, partager par lien.
5. **Des textes qui avouent un chantier** (« informations à compléter », « démo, données fictives », « en préparation »). Honnêtes, mais ils tirent la perception vers le brouillon quand ils sont partout.
6. **Du code qui coûte** : 12 000 lignes de pages à maintenir sous des seuils de couverture, pour des pages que peu de gens visitent.

## 5. Plan pour tout adapter à la charte

### Principe

Une seule voix visuelle, celle de la charte : police du jeu pour les titres et commandes, voix de lecture sans empattement pour les textes (variables `--ds-rd-*`), ardoise et cuivre, panneaux biseautés, quatre durées et trois courbes de mouvement. Chaque page est un assemblage des composants existants : `.mc-section`, `.mc-step`, `.mc-tip` (panneau), `.mc-btn`, `.mc-faq`, `.mc-select`, plus quelques composants à créer (liste ci-dessous).

### Plan de site proposé (de 27 routes à 8)

| Page | Reprend | Forme |
|---|---|---|
| `/` | Landing + concept + FAQ courte + sections « open source » et « nostalgie » en ancres | Le film et ses sections, déjà faits |
| `/installer` | `/installation`, `/fonctionnement`, `/versions`, `/changelog` | Une page à ancres : choisir son chargeur, télécharger, six étapes, dépannage, notes de version repliables |
| `/connexion` | `/login`, `/register` | Un seul panneau centré avec bascule, sur fond de décor du film (image fixe) |
| `/galerie` | `/gallery`, `/account` (en panneau latéral), jumelage, corbeille, stockage | Grille de cartes « interface Minecraft » ; le jumelage en carte d'accueil |
| `/souvenir/:id` | `/viewer`, `/share/:token`, `/public/:id` | Plein écran, une barre d'outils du jeu, studio en panneau repliable |
| `/aide` | `/faq` complète | Liste de `.mc-faq` avec recherche |
| `/mentions` | `/privacy`, `/terms`, `/legal` | Une page, trois ancres, voix de lecture |
| `/admin/*` | `/admin`, diagnostics, modération | Hors charte publique : même ardoise et mêmes tokens, densité de tableau, protégé |

Suspendus (à réintroduire seulement quand ils ont du contenu réel) : blog, prix, galerie publique et classement.

### Composants à créer

1. **Champ de formulaire** de la charte : libellé, entrée biseautée, erreur sous le champ, focus cuivre (connexion, compte, jumelage).
2. **Carte de souvenir** : vignette, nom de la zone, date, actions (ouvrir, partager, corbeille) avec la fenêtre de confirmation du jeu.
3. **Jauge de stockage** : barre d'inventaire (cases pleines et vides) plutôt qu'une barre de progression web.
4. **Barre d'outils du visualiseur** : une hotbar (9 cases) pour les modes de caméra, l'heure, la météo, le partage.
5. **Tableau d'opérateur** : lignes denses, en-tête fixe, pour l'administration.
6. **Toast** : message bref « interface du jeu » (déjà esquissé dans `.mm-toast`).

### Mouvement (déjà posé, à réutiliser)

Dépliants de la FAQ, sélecteur de langue et menu mobile (sections 9 et 10 de `charter.css`). À ajouter pour les pages produit : entrée des cartes de la galerie avec décalage, ouverture et fermeture des fenêtres de confirmation, état « envoi en cours » de la jauge, transitions du visualiseur au partage sans coupure.

### Ordre de reconstruction

1. `/installer` : première page utile pour un visiteur, tout le contenu existe déjà.
2. `/connexion`, puis `/galerie` avec le jumelage : sans eux, le mod ne peut plus envoyer ses captures.
3. `/souvenir/:id` (visualiseur et partage) : le moteur 3D est intact sur le tag.
4. `/mentions`, avant le lancement public.
5. `/aide`, puis l'administration.

### Décisions que ce document ne tranche pas

- Garder `/pricing` en réserve ou le supprimer tant que les paiements n'existent pas.
- Si la galerie publique et le classement ouvrent un jour (la modération est déjà codée côté API).
- Quelle langue par défaut pour le site (le français aujourd'hui, avec 8 langues de catalogues).
- Le nom des routes : français (`/installation`) ou anglais (`/install`).

## Annexe A : textes des pages retirées

Les textes sont donnés en anglais, langue source des catalogues (le français est la langue affichée par défaut). Ils ont été extraits du code ; les fragments courts sont des morceaux de phrases autour de balises `<code>`.

### Pages à gabarit (`content/discovery.ts`)

| Route | Libellé | Titre | Chapô |
|---|---|---|---|
| `/open-source` | Code we can share | A memory that does not depend on a black box. | A mod, a GLB file and a public repository. See how it works, suggest an idea and keep a copy at home. |
| `/nostalgie` | The places that matter | Remember our first house? | The crooked roof. The shared chest. That path we took every evening. Keep a place, and everything it brings back. |
| `/partager` | A gallery to share | Invite people back, even if they no longer play. | No need to launch Minecraft to show a build. A 3D memory, a link you choose to share, and others can explore it. |
| `/classement` | Builds to discover | Small worlds deserve their moment too. | A cabin can tell as much as a megabase. Discover voluntarily published memories and the places visitors love. |

Points et notes :

- `/open-source` : Source you can inspect, An open 3D format, Files that stay yours. Note : The ambition is open source. The repository is public, but a redistribution license still needs to be chosen; visibility alone does not grant those rights.
- `/nostalgie` : Revisit in your browser, Keep several moments, Pass on a memory. Note : A 3D memory keeps captured shapes and textures. It does not preserve the entire game or replace your Minecraft backup.
- `/partager` : A gallery that starts private, A link accessible without an account, Sharing you can revoke. Note : The demo explorer uses illustrations. No private captures are published there. The community public gallery is in preparation.
- `/classement` : Discover by theme, Favorite a place, Try the ranking. Note : Memories stay private without an explicit submission; publications and votes can be withdrawn.

Souvenirs de démonstration : « Our first house » (With friends, 24 cœurs), « The riverside village » (Builds, 42), « The winding garden » (Exploration, 31).

### Blog : « A first memory, with a familiar path » (14/10/2026)

Minemories captures blocks in a loaded Minecraft area and creates a GLB containing its shapes and textures. Revisit the place in your browser. A capture does not replace a world backup and cannot resume your game.

The tested combination is Minecraft Java 1.21.1 and NeoForge 21.1.248. In a test world, wait for terrain to load and use /minemories export 16. A 16-block radius lets you check the result before capturing a large base.

By default, capture.glb is in the export folder of your user directory. Pair the mod with your account to send captures to your private gallery. AFK captures are enabled by default and upload automatically after pairing; you can disable them in the M menu.

### Textes légaux

**Your memories, your choices (privacy).**
Preferences on this device : The tutorial stores your choices and optional name in your browser; you can clear them. Your language preference, demo favorites/votes and estimates you choose to save are also stored on this device.
Optional web diagnostics : Web diagnostics are off by default. If this deployment configures Sentry, you can allow them and withdraw consent on this page for this device. Only fixed error categories and public editorial page routes are transmitted, without raw messages, account details, captures, codes or private URLs. Sign-in, gallery, viewer and sharing pages are excluded. The receiving server sees the connection IP address; its region and retention must be documented before activating the service.
Account and gallery : Sign-in uses a session cookie. Uploaded captures and their metadata belong to your account; the gallery is private by default. Avatars may load from an external service. After pairing, AFK captures can upload automatically.
Links and deletion : A shared link can be forwarded and gives access without an account. Revocation stops future access, not copies already made. Trash retains captures for 30 days; permanent deletion frees space once processed.

**Using Minemories (terms).**
An experimental version : Keep your Minecraft backups and local files. Compatibility with every modpack, permanent availability and lifetime online storage are not guaranteed.
Capture and share : Respect server rules and the rights of people whose builds or information appear in your captures. Check the contents before creating a shared link.

**About this service (legal).**
Independent project : Minemories is an independent, unofficial project, not endorsed by Mojang or Microsoft. Source code and mod releases are available in the public For-Hives/minemories repository.
Information to complete : Publisher and hosting details and the personal-data contact still need to be completed before commercial launch.

### Tarifs (`content/pricing.ts`)

Création : 2 € par instantané. Nuage : 6 € la première année, 5 € la deuxième, 4 € la troisième, 3 € ensuite, par instantané et par an. Calculateur limité à 100 instantanés et 10 ans.

### Pages d'information et guide d'installation (texte extrait du code)

Ce qui suit est extrait automatiquement des fichiers `InfoPages.tsx`, `InstallationPage.tsx` et `InstallationSteps.tsx`.

#### /concept

- A base built with friends, a castle with your child, a first village: these are memories too. When the server closes, finding the right versions and all the mods to revisit them can be difficult.
- Minemories turns an area of Minecraft into a 3D memory you can open in your browser. Once captured, you can revisit it without starting Minecraft or reinstalling the modpack.
- A memory to explore, a backup to keep
- The capture is a three-dimensional snapshot of a place at a moment in time. You can look around, but cannot resume the game, break blocks or recover your inventory. Keep a world backup too if you want to keep playing: the 3D memory does not replace it.
- For you and the people you play with
- At the end of a season, an admin can capture the group's places before closing the server. A parent can keep a build made with their child. An occasional player can revisit their house, and a modpack creator can keep a record of their modded builds.
- What you can do today
- Create my first memory, step by step

#### /fonctionnement

- From Minecraft world to 3D memory
- 1. Install and open the world
- on your computer, then open your world or join your server using its usual compatible profile. The server must still be accessible to capture its builds.
- 2. Choose a small area and capture it
- For your first attempt, stand near the build and type
- By default, underground capture is limited to the depth visited in this area, with at least five blocks of margin below the visited position. Entering a cave extends future captures of that area. Tracking starts with this mod version and stays on your computer. Cavities above this limit may still appear. Advanced mode can capture the full height; an explicit selection keeps the height of its two corners.
- For a precise area, stand at the first corner and enter
- , then at the opposite corner with
- clears the selection.
- The M key opens the Minemories menu. In simple mode, enter your gallery code, then click “Capture and upload”. The button becomes available when your account is connected and a world is open. If M is already assigned, change its shortcut in Minecraft controls.
- The sides and bottom of the capture are closed with a dirt/stone appearance, like an extracted piece of world. These faces are added to the 3D memory: no blocks are changed in Minecraft.
- 3. Find the file on your computer
- The result is a file named
- under your user directory (
- ) by default, not in the world folder. In advanced mode, you can choose another folder and click “Export locally” without connecting an account. Here GLB means a 3D file containing shapes and textures. With the current mod version, every dated capture and its information are also kept in the subfolder
- points to the latest export. In the M menu, “Local captures” lets you choose and upload an older memory. Keep your own backups: the history takes up space on your computer.
- 4. Upload to your gallery, if you choose
- Create your account
- Generate a pairing code in the gallery. Pairing links this Minecraft installation to your Minemories account.
- In Minecraft chat, enter
- replacing CODE with the six digits. The code expires after five minutes and can only be used once. Never type your password in Minecraft.
- to upload the capture, then check that it appears in the gallery. The mod accepts files up to 450 MiB (about 472 MB). If the limit is exceeded, capture a smaller area.
- AFK captures are enabled by default: after 5 minutes of inactivity, at most once every 4 hours, even in the pause menu or while Minecraft is in the background. Without a connected account, they stay in your local folder. With a connected account, they also upload to your private gallery. You can disable them in simple mode; advanced mode lets you adjust the delays and capture radius (32 blocks by default). A previously saved disable preference is preserved.
- Use your own API (advanced)
- by default. In “Advanced mode”, you can enter the HTTPS address of a compatible self-hosted Minemories API and an absolute path for the local folder, then click “Save”. HTTP is accepted only for an API on localhost. Changing API disconnects the account: generate a new code in the gallery belonging to that API. The “Minemories API” button restores the official address; save to apply it.
- 5. Share only what you choose
- Before sharing, check the capture and its associated information: coordinates, server or world name, and single-player world seed may be recorded. Avoid places or text containing personal information and ask the other builders for permission.
- Is this a backup of my world?
- No. It is a static 3D model of an area loaded in the game. It cannot resume your game. Keep your Minecraft backup separately.
- Do I need an account or mod to view a memory?
- A shared link opens without an account or mod. You need a Minemories account to upload to your private gallery.
- Can I keep a vanilla build?
- Yes, if you can open a copy of the Java 1.21.1 world with NeoForge 21.1.248 and Minemories. Vanilla means without mods: the profile used for capturing must still load the mod. Bedrock and consoles are not supported.
- Is it compatible with every mod?
- This is not guaranteed. Validated Java 1.21.1 targets are detailed on the Mod versions page: NeoForge, Fabric, Forge and Quilt using the Fabric JAR. Blocks with custom rendering may be incomplete. Try a small capture and inspect it before capturing your whole base.
- Do I need to install anything on the server?
- Minemories is a client mod on the player's computer, not a server plugin. Ask the admin for permission, keep the profile expected by the server and capture only permitted, loaded areas.
- Who can see my child's memories?
- The gallery is private by default. A link created with Share gives access to anyone who has it, and they can forward it. Check the memory and its information with your child before sharing. Revoking the link stops future access through it, not copies already made.
- Does the mod upload everything automatically?
- AFK captures are enabled by default after 5 minutes of inactivity, at most once every 4 hours, even while paused or in the background. Without a linked account they stay local; with one they upload to your private gallery. Simple mode can disable them; advanced mode adjusts delay, frequency and radius (32 blocks by default). A saved disable preference is preserved. Disconnecting the account stops uploads but keeps local captures. Export locally does not upload anything.
- How can I find an older capture?
- Not directly today. You must be able to reopen the world in a compatible environment to capture it. ZIP world imports and automatic recovery of old modpacks are not available.
- Why is part of the build missing?
- The mod captures an area and the elements loaded by the client. Move closer, check your selection's corners and height, reduce the area and try again. Some modded rendering may not be reproduced.
- The code does not work or uploading fails: what should I do?
- Is there timelapse, 3D printing or a subscription?

#### /faq

- Frequently asked questions
- New here? Start with
- installation guide
- All the steps to capture, upload and share
- Minemories is an independent, unofficial project, neither approved by nor associated with Mojang or Microsoft.

#### /installation (étapes et dépannage)

- Install NeoForge
- Download the mod
- Place the file
- Minecraft Launcher
- Another launcher
- ~/Library/Application Support/minecraft-minemories
- Select the text above to copy it.
- Minecraft Java Edition on a computer
- This guide covers NeoForge, which lets the game load the mod. Other validated versions are listed under
- To discover Minemories, start in a
- new test world
- I want to use my usual world or server
- Copy the world and profile before making changes. A profile (or instance) groups the game, its mods and settings. Keep all mods required by your world or server. Do not change its version or loader for this tutorial: if it does not already use Java 1.21.1 and NeoForge 21.1.248, ask its administrator for help.
- Minemories installs on your computer, not on the server. Check the server rules before capturing.
- In Minecraft Launcher, open
- Installations → New installation
- , choose version
- and launch it once. Close the game and launcher.
- Java 21 (Temurin, official site)
- if you do not have it. Choose your system, JDK 21 and your computer's architecture: x64 for Intel/AMD, aarch64 for Apple Silicon. The Java bundled with Minecraft is not always available to open an installer.
- the NeoForge 21.1.248 installer
- file with Java, select
- , then confirm. Wait for the success message.
- Reopen Minecraft Launcher. Under
- , enable display of
- versions if necessary. Edit the NeoForge installation created using
- … → Edit → More options
- Game Directory
- , choose a new folder dedicated to Minemories using
- Copy the suggested game folder
- Paste %APPDATA% into File Explorer's address bar, then create the .minecraft-minemories folder.
- The ~ symbol means your user directory. Create the suggested folder in your file manager, then select it in the launcher.
- this NeoForge installation
- once, then close Minecraft. This creates the folder
- Official Java and NeoForge guide
- In Prism Launcher, ATLauncher, GDLauncher or MultiMC, create a
- instance and add loader
- For an existing world, copy its compatible instance and keep its mods. If your launcher does not offer these exact versions, do not choose a random alternative: use the Minecraft Launcher walkthrough or ask for help.
- Launch this instance once, then close the game. This walkthrough still needs in-game validation.
- , choose Minecraft, then
- Create Custom Profile
- Name it Minemories, choose
- Launch the profile once, then close the game. If the copied profile is locked, allow editing in its options.
- and sign in to your Minecraft account.
- Create an instance running
- Launch this instance once, then close the game.
- This local-file walkthrough still needs in-game validation.
- Official Modrinth App help
- In Minecraft Launcher → Installations, find the NeoForge profile configured in step 2 and click its
- In CurseForge, open the
- menu of the Minemories profile, then
- In Modrinth App, open the Minemories instance folder using its
- In your launcher, open the
- instance folder
- of your chosen NeoForge 21.1.248 instance. Use that instance's folder button or menu.
- Close Minecraft completely
- before copying the file.
- Open the subfolder
- , copy the Minemories JAR into
- NeoForge profile folder
- The file stays a
- : do not extract it, run it or put it in
- Restart Minecraft from
- In the game menu, open
- Create a small test world, wait for terrain to load, then press
- Can you see the Minemories menu? The installation is recognized.
- The next step also checks that capturing works.
- If M opens something else, go to
- Options → Controls → Key Binds → Minemories
- and choose an unused key. You can also find the Minemories button in the pause menu or options.
- For your first attempt, approach a small build and wait for terrain to load. Open chat with
- , paste this command, then press Enter:
- /minemories export 16
- Copy the first capture command
- Wait for the export completion message. The number 16 means a radius of 16 blocks: this small capture lets you check the result before capturing a large area.
- Open the folder below
- by pasting this path into File Explorer's address bar
- using your file manager (~ means your user directory)
- Copy the first memory folder
- Find the memory in my private gallery
- Create your account
- Generate the six-digit pairing code. In Minecraft, press M, enter the code and connect your account. The code expires after five minutes: generate another if needed.
- Capture and upload
- in the M menu. Wait for confirmation, then check that the capture appears in the gallery.
- AFK captures are enabled by default after 5 minutes of inactivity, at most once every 4 hours. Once your account is linked, they upload automatically to your private gallery. You can disable them in M. Without a linked account, they stay on your computer.
- The export folder can be changed in the mod's advanced settings.
- Learn more about captures and sharing
- Your computer. Your journey.
- The steps adapt to your choices. You can change them at any time.
- You launch Minecraft with…
- Your first name (optional)
- For a guide that feels a little more yours
- Reduce animations
- If a step gets stuck
- The NeoForge installer will not open
- You need Java 21 to open the installer. On Windows, try right-click → Open with → Java. If it is missing, install Temurin 21 using the link in step 2. On macOS or Linux, follow
- the official NeoForge guide
- to run the installer. Do not change security settings at random.
- I cannot find the mods folder or the mod does not appear
- if it is missing. Check that the file ends in .jar, not .jar.zip, then fully close the game and restart the NeoForge 21.1.248 profile. Worlds belong in saves; the mod belongs in mods.
- M opens another menu, or the command is unknown
- Change the Minemories key in Options → Controls → Key Binds. An unknown command often means the mod is not loaded: check its entry in Mods, the versions and the profile folder.
- Minecraft crashes at startup
- Check Minecraft 1.21.1, NeoForge 21.1.248 and that Minemories is not duplicated. Remove the Minemories JAR to return to the previous profile. Ask for help with the error message and versions used; do not delete your world.
- The capture is empty, incomplete or uploading fails
- Wait for terrain to load, move closer to the build and try again with radius 16. Some modded blocks are not reproduced faithfully. If uploading fails, keep capture.glb and view it locally. Check your connection, generate another code if five minutes have passed and retry; the mod upload limit is 450 MiB.
- Your first memory starts here
- Install the Minemories mod
- One small file.
- A new way to keep your worlds.
- We will take this one step at a time. No coding required: choose your computer, follow the guide and keep your first memory in 3D.
- Start installing
- Minecraft Java 1.21.1 · NeoForge 21.1.248 · Experimental mod
- Just here to view a shared memory? Open its link: there is nothing to install.
- Step-by-step guide
- From download to first memory.
- / 6 steps checked
- Installation progress
- Installation steps
- My memory opens in 3D
- Check a step when you have completed it. You can also move freely between steps.
- Your first memory is here.
- If the capture opens correctly, you have completed this first trial. Keep a world backup too: a 3D memory cannot resume your game.
- Explore captures, the gallery and sharing →
- Your first name, choices and progress stay in this browser on this device. You can close this page and return.
- Start again and clear my choices
- install-caption install-final-note
- Manual Windows guide without JavaScript
- Download the mod from

