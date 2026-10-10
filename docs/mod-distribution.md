# Réglages et distribution du mod

## Parcours joueur

La cible reste Minecraft Java 1.21.1 avec NeoForge 21.1.248. Aucun support Fabric/Quilt/Forge n’est annoncé par le workflow. Le mod s’installe uniquement côté client.

**Mode simple (par défaut)** : ouvrir avec M, prendre le code à six chiffres dans la galerie, connecter le compte, puis utiliser « Capturer et envoyer ». Ce bouton nécessite un compte lié et un monde ouvert. Le service utilisé est indiqué : Minemories ou API personnalisée. « Déconnecter ce compte » retire les identifiants locaux et arrête les envois automatiques ; les captures AFK locales restent actives, sans supprimer les souvenirs en ligne.

**Mode avancé** : saisir une adresse API compatible et un dossier local, enregistrer, exporter localement autour du joueur ou sur une sélection déjà définie par commandes. Un export local ne déclenche aucun envoi. Le rayon des boutons reste de 128 blocs ; utiliser `/minemories export 16` pour un essai plus petit. Chaque capture remplace `capture.glb` et son fichier de métadonnées `capture.json` dans le dossier configuré : copier les deux avant une nouvelle capture si l’on veut conserver l’historique.

Le bouton « API Minemories » remplit l’adresse officielle, mais elle ne change qu’après « Enregistrer ». Les modifications non enregistrées sont abandonnées en quittant le mode avancé. Changer d’API retire le jeton et l’identifiant du compte, puis nécessite un nouveau code provenant de la galerie de cette API. Ne jamais partager `config/minemories.properties`.

Sur une nouvelle installation, l’AFK est actif : 5 minutes d’inactivité, une capture au plus toutes les 4 heures, rayon 32 blocs. Une désactivation explicite existante est conservée. Le mode simple permet de l’activer/désactiver. Le sous-écran avancé « Réglages AFK » règle l’inactivité (1–1440 min), l’intervalle (1–10080 min) et le rayon (2–128 blocs), persistés dans les propriétés. Les captures restent locales sans compte, puis sont envoyées à la galerie du compte lié. Le contrôle utilise le temps réel depuis un événement de rendu NeoForge, qui continue en pause et en arrière-plan ; aucun menu n’est bloquant. Les touches, clics et mouvements du joueur réinitialisent l’inactivité. Les captures progressives restent dans `TASKS.md`.

## Configuration locale

`config/minemories.properties` dans le dossier du profil contient les réglages persistants :

| Clé | Valeur par défaut / règle |
| --- | --- |
| `afkSnapshots` | `true` par défaut ; une désactivation enregistrée reste respectée. |
| `afkIdleMinutes` / `afkIntervalMinutes` / `captureRadius` | `5` / `240` / `32` ; réglages avancés pour les captures AFK et le rayon des captures du menu. |
| `apiUrl` | `https://api.minemories.xenos.lightin.io` ; une valeur existante est conservée. À défaut de valeur enregistrée, `MINEMORIES_API_URL` reste utilisable pour le développement. HTTPS requis, HTTP accepté uniquement pour localhost, 127.0.0.1 ou ::1. Pas d’identifiants, query ni fragment dans l’URL. |
| `exportDirectory` | `~/export` ; chemin absolu ou expansion de `~/`, normalisé avant enregistrement. Le dossier est créé lors d’un export. |
| `deviceToken`, `deviceId` | Créés lors de l’appairage ; retirés lors d’une déconnexion ou d’un changement d’API. |

L’URL officielle a répondu `{"status":"ok"}` à `GET /healthz` le 10 octobre 2026. Ce contrôle ne valide pas un appairage authentifié ni un upload sur le service de production.

## Téléchargement sur le site

`bun run build` exécute les contrôles, construit le JAR du mod, lance `package:mod`, puis construit le web. Le script de packaging exige un seul JAR jouable dans `mod/minemories/neoforge/build/libs` (les sources, dev et javadocs sont exclus), refuse un fichier sans en-tête d’archive JAR et calcule son SHA-256.

Il génère dans `apps/web/public/downloads/` (gitignored) :

- `minemories-neoforge-mc1.21.1.jar` : le JAR complet, avec les classes de `core` intégrées ;
- `minemories-neoforge-mc1.21.1.jar.sha256` : son empreinte ;
- `manifest.json` : version, compatibilité, taille et empreinte.

Vite copie ces fichiers dans `dist/downloads`. La page `/installation` propose le JAR direct seulement si le manifeste correspond à la combinaison prévue, avec un message alternatif si le build n’a pas inclus le téléchargement. Aucun ZIP n’est nécessaire : le joueur dépose le JAR dans `mods` sans extraction ni exécution par double-clic. Le JAR reste expérimental.

Le build web Railpack inclut désormais Java 21 et Node 24 pour construire ce même artefact ; il nécessite donc l’accès aux dépôts Gradle/Maven/Minecraft. Un build web lancé isolément exige d’abord `bun mod:build` et `bun run package:mod` pour inclure le téléchargement. En cas de JARs anciens multiples, nettoyer `neoforge/build/libs` avant reconstruction.

## CI et publications

Le workflow **Quality gates** conserve le JAR, l’empreinte et le manifeste comme artefact après un build réussi (14 jours).

Le workflow manuel **Build and distribute mod** (`.github/workflows/mod-release.yml`) exécute `bun run build` et conserve les fichiers pendant 30 jours. Par défaut, il ne publie rien. Il permet de sélectionner séparément GitHub Releases, Modrinth et CurseForge, avec un canal alpha (défaut), beta ou release.

Pour publier, choisir `main` et confirmer dans l’entrée `tested_in_game` que **la version exacte construite a été validée en jeu**. Le job `publish` utilise l’environnement GitHub `mod-releases`, configurable avec des reviewers si souhaité ; aucune règle d’approbation n’est créée par ce dépôt. Les étapes utilisent la même archive téléchargée depuis le job de build, pas une reconstruction indépendante. GitHub utilise le tag `mod-v<version>` et le commit testé.

Avant la première publication catalogue, une personne responsable des comptes doit :

1. Créer les fiches officielles du projet sur Modrinth et CurseForge et préparer leurs descriptions, licence et illustrations.
2. Ajouter les variables GitHub `MODRINTH_PROJECT_ID` et `CURSEFORGE_PROJECT_ID`.
3. Ajouter les secrets GitHub `MODRINTH_TOKEN` et `CURSEFORGE_TOKEN` avec les droits de publication nécessaires (ne pas les mettre dans le dépôt ou le chat).
4. Valider le JAR exact en jeu et contrôler sa version, puis lancer le workflow avec les plateformes voulues.

Les plateformes manquantes ne bloquent pas un build sans publication. Si une destination sélectionnée manque de projet/token, le job échoue avant tout upload. Aucun projet catalogue ni token n’a été trouvé dans les variables/secrets GitHub lors de cette préparation.

La version du mod est définie dans `mod/minemories/build.gradle`. L’incrémenter pour une nouvelle publication. Ne pas tenter de remplacer une version catalogue existante silencieusement. Les étapes de publication indépendantes peuvent produire un succès partiel : vérifier les plateformes avant une nouvelle tentative, afin d’éviter les doublons.

## Autres launchers

Modrinth et CurseForge sont les destinations de publication retenues. Prism Launcher, ATLauncher et GDLauncher proposent des téléchargements issus de ces catalogues ; il n’est pas nécessaire de leur envoyer un second JAR. Une instance compatible dans un autre launcher peut utiliser le JAR manuel. Ce mécanisme ne constitue pas une validation en jeu de chaque launcher, et aucune publication universelle sur tous les gestionnaires n’est annoncée.

Sources officielles consultées le 10 octobre 2026 : [MC-Publish](https://github.com/Kira-NT/mc-publish), [Modrinth Create a version](https://docs.modrinth.com/api/operations/createversion/), [CurseForge Upload API](https://support.curseforge.com/support/solutions/articles/9000197321-curseforge-upload-api), [Prism](https://prismlauncher.org/wiki/getting-started/download-mods/), [ATLauncher](https://wiki.atlauncher.com/getting-started/downloading-content/), [GDLauncher](https://gdlauncher.com/).

## Validation

Tests de réglages : défaut officiel et overrides, rejet des URLs dangereuses, invalidation des identifiants au changement d’API, conservation du compte au changement de dossier, validation sans mutation partielle, chemins locaux, défaut AFK et permissions privées/écriture atomique.

Tests du packaging : octets et métadonnées reproductibles, exclusion des sources, builds absents/ambigus/corrompus. Tests React : téléchargement et empreinte, erreurs réseau/manifeste, absence de lien cassé et annulation lors d’un changement de page.

La vérification en jeu doit couvrir les modes simple/avancé à différentes échelles GUI, la persistance du dossier, l’export local réel, le changement d’API et le nouvel appairage, les erreurs de connexion, l’envoi en galerie et le retour à l’écran précédent. Tester sur un monde jetable et conserver une copie du profil avant installation.

Validation locale du 10 octobre 2026 : le client de développement NeoForge 21.1.248 a démarré après déclaration des sources de `:core` dans `neoForge.mods.minemories`. Le crash initial `NoClassDefFoundError: dev/minemories/core/GlbScene` est résolu. Les logs montrent un export réel terminé depuis le monde de test (7 369 322 blocs, 291 matériaux). L’utilisateur a validé en jeu la lisibilité des deux modes et la persistance du dossier après fermeture/réouverture. L’appairage/upload de production reste à confirmer. Les deux workflows passent `actionlint` 1.7.12.
