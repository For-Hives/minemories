# Minemories

Minemories permet de capturer une zone de Minecraft dans un fichier GLB autonome, de l'ouvrir dans un viewer web et, après appairage explicite, de l'envoyer dans une galerie privée. Le mod est pour l'instant un POC client **Minecraft 1.21.1 / NeoForge 21.1.248**. Fabric, Quilt et Forge ne sont pas encore supportés.

## Structure

| Chemin | Rôle |
| --- | --- |
| `mod/minemories/` | Projet Gradle. `:core` sérialise le GLB sans Minecraft ; `:neoforge` contient le client et les hooks propres au loader. |
| `apps/web/` | Viewer React / Three.js. |
| `apps/api/` | API Bun / Hono, Better Auth, SQLite et stockage objet S3. |
| `packages/api-contract/` | Contrat oRPC partagé entre API et web ; ce dossier est une bibliothèque, pas une application. |
| `docs/` | Architecture, workflow et état du POC. |

Le contrat oRPC décrit les procédures `pairing` et `memories` utilisées par le web. Les routes HTTP du mod sont définies dans `apps/api/src/index.ts` et restent distinctes.

Le dossier `mod/` pourra accueillir d'autres projets Minecraft ; le nom `minemories` reste celui du projet Gradle. Le mod utilise désormais l'identifiant `minemories`, la commande `/minemories` et le nom de classe `Minemories`.

## Démarrage local

Prérequis : Bun 1.4.3, Node.js 22.12+, JDK 21 et Docker Compose. À la racine :

```sh
bun install --frozen-lockfile
cp .env.example .env
# Remplacer BETTER_AUTH_SECRET et PAIRING_PEPPER par deux secrets distincts de 32 caractères minimum.
docker compose up -d
bun api:dev
bun web:dev
```

L'API écoute sur `localhost:3001`, le web sur `localhost:5173`. Compose lance Garage en mono-nœud sur `127.0.0.1:3900` pour le développement. Le profil Minecraft du mod est indépendant du profil CurseForge :

```sh
bun mod:dev
```

Au premier lancement, Gradle télécharge les dépendances du jeu ; les relancements recompilent seulement ce qui a changé. Le dossier de jeu est `mod/minemories/run/`. Pour reproduire une interaction avec le modpack, ajoute les JARs NeoForge 1.21.1 pertinents dans `run/mods/`. Voir [le workflow](docs/concepts/development-workflow.md).

## Interface du mod

Dans un monde, ouvre le menu pause puis clique sur **Minemories** ; le bouton existe aussi dans les options. La touche **M**, modifiable dans les contrôles, ouvre le menu même si un modpack utilise un menu de pause personnalisé. Le mode simple propose l’appairage avec le code à six chiffres de la galerie, **Capturer et envoyer**, l’activation/désactivation de l’AFK et **Captures locales** pour retrouver un ancien souvenir. Une fois lié, **Déconnecter ce compte** remplace le champ de code.

Les captures AFK sont actives par défaut après **5 minutes d’inactivité**, au plus une fois toutes les **4 heures**, même en pause ou en arrière-plan. Sans compte lié, elles restent locales ; après appairage, elles sont envoyées dans la galerie privée. Le mode avancé permet de régler délai, fréquence, rayon (**32 blocs par défaut**, 2–128 réglables), dossier local et API. Il propose aussi l’export local ou de la sélection définie par commandes, sans envoi. La profondeur suit les visites locales ; la capture sur toute la hauteur est un réglage avancé. Les commandes conservent leur rayon par défaut de 128 blocs et capturent uniquement les chunks chargés.

Chaque export conserve un GLB et ses métadonnées dans un dossier daté sous `~/export/history/` par défaut. `capture.glb` et `capture.json` restent des copies du dernier export. **Captures locales** permet de parcourir et d’envoyer les captures conservées ; prévoir de l’espace et des sauvegardes, aucune suppression locale automatique n’est effectuée. Voir [l’historique local](docs/features/local-capture-history.md). Les erreurs restent dans le log Minecraft et fermer le menu ramène à l’écran précédent.

Pour tester rapidement le parcours local, lance `bun api:dev`, `bun web:dev` et `bun mod:dev`, règle l’API du mod sur `http://localhost:3001` dans le mode avancé, crée un monde de test, capture, crée le code dans le web, puis lie le mod et envoie le fichier. Le fichier `mod/minemories/run/config/minemories.properties` conserve le jeton local.

## Commandes

| Commande | Effet |
| --- | --- |
| `bun mod:dev` | Démarre le client NeoForge de développement (`runClient`). |
| `bun mod:build` | Construit et vérifie le JAR Gradle dans `mod/minemories/neoforge/build/libs/`. Ce build n'effectue pas de minification. |
| `bun mod:check` | Applique Spotless puis lance les contrôles Gradle (JUnit, JaCoCo, SpotBugs, compilation). Modifie les sources si nécessaire. |
| `bun mod:check:ci` | Même vérification sans modification des fichiers. |
| `bun web:dev` / `bun api:dev` | Démarre les applications séparément. |
| `bun web:check` | Biome, TypeScript et Vitest avec couverture de 100 % des utilitaires du viewer ; tests du contrat oRPC partagé. |
| `bun api:check` | Biome API et contrat, TypeScript API, puis tests Bun isolés avec rapport de couverture (GLB, routes HTTP, appairage et stockage fichier). |
| `bun check` / `bun run build` | Contrôles de tout le dépôt, puis JAR du mod, fichiers de téléchargement et bundle web. |

`bun <script>` est le raccourci Bun pour `bun run <script>`, sauf pour les commandes natives comme `build` : utilise `bun run build` pour le script du dépôt. En CI, `bun check` ne réécrit aucun fichier.

`bun format` applique la configuration Biome 2.5.15 à onglets, largeur 120 et points-virgules facultatifs. Pour Java, `bun mod:check` applique Spotless et lance JUnit, JaCoCo et SpotBugs ; `bun mod:check:ci` vérifie sans modifier. Les tests de `:core` vérifient aussi le conteneur GLB avec des entrées invalides et des coordonnées extrêmes. Les essais du menu et le rendu GLB en jeu restent nécessaires avant d'annoncer le support d'un loader.

## Stockage et données

`.env.example` contient uniquement des identifiants de **développement local** pour Garage. Change les clés et la configuration avant tout déploiement, et n'expose pas le port S3 sans protection. Les données Garage vivent dans les volumes `garage_meta` et `garage_data` ; `docker compose down` les conserve, `down -v` les efface. Si tu avais des objets dans l'ancien volume `minio_data`, le passage à Garage **ne les transfère pas** : exporte-les et réimporte-les avant de supprimer ce volume.

L'API peut utiliser `STORAGE_DRIVER=filesystem` et `LOCAL_OBJECTS_PATH=./data/objects` pour développer sans Docker. Les exports GLB restent locaux par défaut ; l'envoi au serveur demande un appairage explicite. Le jeton d'appairage est enregistré dans `config/minemories.properties`. Voir [l'architecture](docs/concepts/architecture.md) et [les loaders](docs/features/loader-support.md).

Les captures du mod peuvent être envoyées en morceaux de 4 MiB, jusqu’à 200 MiB, avec reprise après interruption. Voir [le protocole et les contraintes de déploiement](docs/features/resumable-uploads.md).

## Installation et distribution du mod

Le mod utilise l’API `https://api.minemories.xenos.lightin.io` par défaut. Le menu M démarre en mode simple : code de galerie, connexion et capture/envoi manuel. Le mode avancé permet de choisir le dossier local, une API personnalisée compatible et les délais, la fréquence et la taille des captures AFK (actives par défaut). Une préférence AFK déjà enregistrée est conservée. Un changement d’API retire les identifiants du compte précédent.

`bun run build` intègre le JAR installable et son empreinte SHA-256 dans le site. La page `/installation` propose le téléchargement direct : déposer le JAR dans `mods`, sans extraction de ZIP. Pour développer le web séparément, construire le mod puis lancer `bun run package:mod` avant `bun web:dev` ou `bun web:build`.

Le workflow manuel **Build and distribute mod** produit un artefact par défaut ; les publications GitHub Releases, Modrinth et CurseForge sont optionnelles. Voir [la distribution et les réglages](docs/features/mod-distribution.md) pour la configuration des projets/secrets et les vérifications en jeu.
