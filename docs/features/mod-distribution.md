# Réglages et distribution du mod

## Parcours joueur

La cible reste Minecraft Java 1.21.1 avec NeoForge 21.1.248. Aucun support Fabric/Quilt/Forge n’est annoncé par le workflow. Le mod s’installe uniquement côté client.

**Mode simple (par défaut)** : ouvrir avec M, prendre le code à six chiffres dans la galerie, connecter le compte, puis utiliser « Capturer et envoyer ». Ce bouton nécessite un compte lié et un monde ouvert. Le service utilisé est indiqué : Minemories ou API personnalisée. « Déconnecter ce compte » retire les identifiants locaux et arrête les envois automatiques ; les captures AFK locales restent actives, sans supprimer les souvenirs en ligne.

**Mode avancé** : saisir une adresse API compatible et un dossier local, enregistrer, exporter localement autour du joueur ou sur une sélection déjà définie par commandes. Un export local ne déclenche aucun envoi. Le rayon des captures du menu suit le réglage avancé (32 blocs par défaut) ; utiliser `/minemories export 16` pour un essai plus petit. Les captures datées et leurs métadonnées restent dans le sous-dossier `history` du dossier configuré. `capture.glb` et `capture.json` restent des copies du dernier export. **Captures locales**, disponible dans les deux modes, permet de choisir et d’envoyer une capture précédente. Voir [l’historique local](local-capture-history.md).

Le bouton « API Minemories » remplit l’adresse officielle, mais elle ne change qu’après « Enregistrer ». Les modifications non enregistrées sont abandonnées en quittant le mode avancé. Changer d’API retire le jeton et l’identifiant du compte, puis nécessite un nouveau code provenant de la galerie de cette API. Ne jamais partager `config/minemories.properties`.

**Zones suggérées**, dans le mode simple ou via `/minemories suggestions`, classe
les zones de 64 × 64 blocs par temps actif local. La liste reste séparée de la
sélection et des envois ; voir [le score et ses limites](visited-zones.md).

Sur une nouvelle installation, l’AFK est actif : 5 minutes d’inactivité, une capture au plus toutes les 4 heures, rayon 32 blocs. Une désactivation explicite existante est conservée. Le mode simple permet de l’activer/désactiver. Le sous-écran avancé « Réglages AFK » règle l’inactivité (1–1440 min), l’intervalle (1–10080 min) et le rayon (2–128 blocs), persistés dans les propriétés. Les captures restent locales sans compte, puis sont envoyées à la galerie du compte lié. Le contrôle utilise le temps réel depuis un événement de rendu NeoForge, qui continue en pause et en arrière-plan ; aucun menu n’est bloquant. Les touches, clics et mouvements du joueur réinitialisent l’inactivité. Les captures AFK sont préparées progressivement entre les frames, puis écrites sur worker et envoyées à débit limité ; voir [le parcours, ses limites et les mesures](spooling-glb.md). Le retour du joueur suspend la lecture ; les changements de contexte annulent une capture incomplète.

## Configuration locale

`config/minemories.properties` dans le dossier du profil contient les réglages persistants :

| Clé | Valeur par défaut / règle |
| --- | --- |
| `afkSnapshots` | `true` par défaut ; une désactivation enregistrée reste respectée. |
| `captureFullHeight` | `false` ; le mode avancé permet de capturer toute la hauteur de la dimension. |
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

Ces fichiers restent les artefacts de packaging CI du mod ; ils ne sont plus un prérequis du build web. La page `/installation` propose le JAR directement depuis GitHub Releases. Aucun ZIP n’est nécessaire : le joueur dépose le JAR dans `mods` sans extraction ni exécution par double-clic. Le JAR reste expérimental.

Le déploiement web utilise `railpack.web.json` sans Java et ne reconstruit pas le mod. Le build aggregate et la CI produisent les artefacts séparément. En cas de JARs anciens multiples, nettoyer `neoforge/build/libs` avant reconstruction.

## CI et publications

Le workflow **Quality gates** conserve le JAR, l’empreinte et le manifeste comme artefact après un build réussi (14 jours). Un second job télécharge cet artefact et vérifie les octets contre le SHA-256 émis par le build.

Le workflow **Automatic mod releases** (`.github/workflows/automatic-release.yml`) démarre après le succès de Quality gates sur le dernier commit poussé dans `main`. Release-it et Conventional Changelog calculent une version bêta, puis la matrice de `config/mod-targets.json` construit et teste chaque cible activée. Toutes doivent réussir avant publication. La version est synchronisée dans les packages Bun, le lockfile et Gradle ; le changelog, le commit de version et le tag `mod-v<version>` sont générés automatiquement. La release GitHub contient les JAR vérifiés, leurs SHA-256 et les manifestes. Le front continue à télécharger ces fichiers depuis GitHub, sans compiler Java.

Les releases automatiques sont des **préversions** : les tests CI ne valent pas validation en jeu du JAR exact. NeoForge est la seule cible activée actuellement ; Fabric, Forge et Quilt ont des entrées désactivées jusqu’à leur portage et leur validation. Voir [le fonctionnement et la reprise](automatic-releases.md).

Le workflow manuel **Distribute a validated mod release** (`.github/workflows/mod-release.yml`) sert uniquement aux catalogues. Choisir `main`, renseigner le tag GitHub existant et confirmer `tested_in_game` pour les JAR exacts de cette release. Il les télécharge, vérifie leur digest GitHub, leur manifeste et leur empreinte, puis publie sur les plateformes sélectionnées **sans reconstruire** les archives.

Avant une publication catalogue :

1. Créer les fiches officielles sur Modrinth et CurseForge et préparer descriptions, licence et illustrations.
2. Ajouter les variables GitHub `MODRINTH_PROJECT_ID` et `CURSEFORGE_PROJECT_ID`.
3. Ajouter les secrets GitHub `MODRINTH_TOKEN` et `CURSEFORGE_TOKEN` avec les droits nécessaires.
4. Valider en jeu le JAR de chaque cible sélectionnée, puis lancer le workflow manuel sur son tag. L’environnement `mod-releases` existant est conservé pour les catalogues ; les releases GitHub automatiques ne demandent aucune approbation manuelle.

## Autres launchers

Modrinth et CurseForge sont les destinations de publication retenues. Prism Launcher, ATLauncher et GDLauncher proposent des téléchargements issus de ces catalogues ; il n’est pas nécessaire de leur envoyer un second JAR. Une instance compatible dans un autre launcher peut utiliser le JAR manuel. Ce mécanisme ne constitue pas une validation en jeu de chaque launcher, et aucune publication universelle sur tous les gestionnaires n’est annoncée.

Sources officielles consultées le 10 octobre 2026 : [MC-Publish](https://github.com/Kira-NT/mc-publish), [Modrinth Create a version](https://docs.modrinth.com/api/operations/createversion/), [CurseForge Upload API](https://support.curseforge.com/support/solutions/articles/9000197321-curseforge-upload-api), [Prism](https://prismlauncher.org/wiki/getting-started/download-mods/), [ATLauncher](https://wiki.atlauncher.com/getting-started/downloading-content/), [GDLauncher](https://gdlauncher.com/).

## Validation

Tests de réglages : défaut officiel et overrides, rejet des URLs dangereuses, invalidation des identifiants au changement d’API, conservation du compte au changement de dossier, validation sans mutation partielle, chemins locaux, défaut AFK et permissions privées/écriture atomique.

Tests du packaging et du téléchargement CI : octets et métadonnées reproductibles, exclusion des sources, builds absents/ambigus/corrompus, fichiers modifiés/tronqués/manquants et refus d’une empreinte remplacée dans l’artefact. Tests React : téléchargement et empreinte, erreurs réseau/manifeste, absence de lien cassé et annulation lors d’un changement de page.

La vérification en jeu doit couvrir les modes simple/avancé à différentes échelles GUI, la persistance du dossier, l’export local réel, le changement d’API et le nouvel appairage, les erreurs de connexion, l’envoi en galerie et le retour à l’écran précédent. Tester sur un monde jetable et conserver une copie du profil avant installation.

Validation locale du 10 octobre 2026 : le client de développement NeoForge 21.1.248 a démarré après déclaration des sources de `:core` dans `neoForge.mods.minemories`. Le crash initial `NoClassDefFoundError: dev/minemories/core/GlbScene` est résolu. Les logs montrent un export réel terminé depuis le monde de test (7 369 322 blocs, 291 matériaux). L’utilisateur a validé en jeu la lisibilité des deux modes et la persistance du dossier après fermeture/réouverture. Un test AFK réglé temporairement à 1 min / 1 min / rayon 8 a produit plusieurs captures avec `paused=true`, puis des envois réussis sur l’API de production. L’utilisateur confirme le test ; les réglages locaux ont été remis à 5 / 240 / 32. La validation porte sur le client de développement ; le JAR publié doit encore être testé séparément. Les deux workflows passent `actionlint` 1.7.12.


## Profondeur des captures

Par défaut, les captures autour du joueur, manuelles ou AFK, coupent le sous-sol deux blocs sous la profondeur la plus basse visitée dans les chunks concernés. À la première capture, le terrain de surface sert aussi de référence pour éviter une capture vide si le joueur vole. Les passages en profondeur étendent ensuite les captures de cette zone. Le suivi fonctionne aussi lorsque les captures AFK sont désactivées.

Cet historique est local, séparé par monde/serveur, dimension et joueur. Il est enregistré dans `config/minemories/exploration/` toutes les dix secondes, avant une capture et au changement de monde. Il conserve au maximum 100 000 chunks par historique ; les plus anciens peuvent être évincés. Les visites antérieures à cette version ne sont pas récupérées. Le seuil est commun à la zone capturée : des cavités non visitées au-dessus de cette profondeur peuvent encore apparaître. Ce n’est pas une reconstruction des seuls blocs vus par le joueur.

La validation comparative complète (surface/grotte/retour/autre zone, dimensions,
redémarrage et autre joueur) est documentée dans
[Validation de la profondeur visitée](exploration-depth-validation.md).

Le bouton **Profondeur** des réglages avancés permet de revenir à toute la hauteur de la dimension. Une sélection explicite conserve toujours ses deux coins. Le suivi ne modifie aucun bloc du monde et ne charge aucun chunk absent. Les côtés et le dessous de la coupe reçoivent une section esthétique : terre dans les trois blocs sous la surface, puis pierre. Les ouvertures de grottes rencontrant le bord sont fermées à ce plan, sans remplir la grotte à l’intérieur. Les fluides au-dessus du fond d’un lac gardent leur surface et leurs faces de coupe transparentes, même si l’eau continue hors de la capture ; les fluides souterrains peuvent rencontrer la section de pierre. Les blocs transparents et non cubiques gardent leur modèle. Aucune paroi n’est ajoutée au-dessus du terrain et aucun bloc du monde n’est modifié.

## Distribution depuis le dépôt public

Le front ne compile plus Java au déploiement. `/installation` choisit la release publiée la plus récente parmi les trente dernières releases de `For-Hives/minemories`, avec tag `mod-v<version>` et asset `minemories-neoforge-mc1.21.1.jar`. Les brouillons, tags non conformes, assets étrangers et builds pour d’autres versions sont exclus. Les préversions restent marquées expérimentales. Le JAR est téléchargé directement depuis GitHub ; le digest SHA-256 de GitHub est affiché lorsqu’il existe, ainsi que le fichier d’empreinte lorsqu’il est publié. Le workflow ajoute le manifeste de compatibilité et l’empreinte à la release.

La [préversion `0.1.0-beta`](https://github.com/For-Hives/minemories/releases/tag/mod-v0.1.0-beta) a été publiée le 14 octobre 2026 depuis le commit `5c14000a541db812ce6ccc0734d95b645a7c87a5` (PR #56). Elle contient le JAR exact testé dans Minecraft/Blender, le manifeste et l’empreinte. Publication avec `gh release create --prerelease` après les deux jobs CI réussis sur le commit de la PR, sans reconstruction de l’archive testée. Le workflow dédié reste disponible pour les publications suivantes et les catalogues.

La page publique `https://minemories.xenos.lightin.io/installation/` affiche la beta et ses instructions ; son lien a réellement téléchargé un JAR de 181 754 octets dont le SHA-256 est `249fa27d83b00a78beef6bca300a94b60a8e1297c2948ffde6e645c61cd70b20`, identique au fichier exercé en jeu et aux assets GitHub. La copie installée dans les profils CurseForge locaux `mc breval` et `All the Mons - ATMons` possède la même empreinte, avec sauvegarde de l’ancienne version. Cela ne valide pas le rendu de chaque mod d’ATMons ni la publication sur le catalogue CurseForge. Voir [les modèles et la validation](frozen-entities.md).

Les anciens fichiers `public/downloads` décrivent le packaging CI local ; ils restent indépendants du déploiement front Coolify. Aucun ZIP n'est requis.
