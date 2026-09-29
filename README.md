# Minemories

Minemories permet de capturer une zone de Minecraft dans un fichier GLB autonome, de l'ouvrir dans un viewer web et, après appairage explicite, de l'envoyer dans une galerie privée. Le mod est pour l'instant un POC client **Minecraft 1.21.1 / NeoForge 21.1.248**. Fabric, Quilt et Forge ne sont pas encore supportés.

## Structure

| Chemin | Rôle |
| --- | --- |
| `mod/minemories/` | Projet Gradle. `:core` sérialise le GLB sans Minecraft ; `:neoforge` contient le client et les hooks propres au loader. |
| `apps/web/` | Viewer React / Three.js. |
| `apps/api/` | API Bun / Hono, Better Auth, SQLite et stockage objet S3. |
| `apps/api-contract/` | Contrat oRPC partagé entre API et web. |
| `docs/` | Architecture, workflow et état du POC. |

Le dossier `mod/` pourra accueillir d'autres projets Minecraft ; le nom `minemories` reste celui du projet Gradle. Le code Java sous `dev.minemories` et l'identifiant actuel `memorypoc` ne sont pas renommés.

## Démarrage local

Prérequis : Bun 1.4.2, Node.js 22.12+, JDK 21 et Docker Compose. À la racine :

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

Au premier lancement, Gradle télécharge les dépendances du jeu ; les relancements recompilent seulement ce qui a changé. Le dossier de jeu est `mod/minemories/run/`. Pour reproduire une interaction avec le modpack, ajoute les JARs NeoForge 1.21.1 pertinents dans `run/mods/`. Voir [le workflow](docs/development-workflow.md).

## Commandes

| Commande | Effet |
| --- | --- |
| `bun mod:dev` | Démarre le client NeoForge de développement (`runClient`). |
| `bun mod:build` | Construit et vérifie le JAR Gradle dans `mod/minemories/neoforge/build/libs/`. Ce build n'effectue pas de minification. |
| `bun mod:check` | Applique Spotless puis lance les contrôles Gradle (JUnit, JaCoCo, SpotBugs, compilation). Modifie les sources si nécessaire. |
| `bun mod:check:ci` | Même vérification sans modification des fichiers. |
| `bun web:dev` / `bun api:dev` | Démarre les applications séparément. |
| `bun web:check` | Biome, TypeScript et Vitest avec couverture du viewer. |
| `bun api:check` | Biome API et contrat, puis TypeScript API. Aucun test API automatisé pour l'instant. |
| `bun check` / `bun build` | Contrôles de tout le dépôt, puis bundles web et mod pour `build`. |

`bun <script>` est le raccourci Bun pour `bun run <script>`. En CI, `bun check` ne réécrit aucun fichier.

## Stockage et données

`.env.example` contient uniquement des identifiants de **développement local** pour Garage. Change les clés et la configuration avant tout déploiement, et n'expose pas le port S3 sans protection. Les données Garage vivent dans les volumes `garage_meta` et `garage_data` ; `docker compose down` les conserve, `down -v` les efface. Si tu avais des objets dans l'ancien volume `minio_data`, le passage à Garage **ne les transfère pas** : exporte-les et réimporte-les avant de supprimer ce volume.

L'API peut utiliser `STORAGE_DRIVER=filesystem` et `LOCAL_OBJECTS_PATH=./data/objects` pour développer sans Docker. Les exports GLB restent locaux par défaut ; l'envoi au serveur demande un appairage explicite. Voir [l'architecture](docs/architecture.md) et [les loaders](docs/loader-support.md).
