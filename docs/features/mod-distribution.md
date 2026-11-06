# Réglages et distribution du mod

## Parcours joueur

La cible reste Minecraft Java 1.21.1. La matrice de release contient NeoForge 21.1.248, Fabric Loader 0.19.5 avec Fabric API 0.116.17+1.21.1, et Forge 52.1.19. Quilt 0.30.1 utilise le JAR Fabric ; voir les [essais et leurs limites](loader-support.md). Le mod s’installe uniquement côté client.

**Mode simple (par défaut)** : ouvrir avec M, prendre le code à six chiffres dans la galerie, connecter le compte, puis utiliser « Capturer et envoyer ». Ce bouton nécessite un compte lié et un monde ouvert. Le service utilisé est indiqué : Minemories ou API personnalisée. « Déconnecter ce compte » retire les identifiants locaux et arrête les envois automatiques ; les captures AFK locales restent actives, sans supprimer les souvenirs en ligne.

**Mode avancé** : saisir une adresse API compatible et un dossier local, enregistrer, exporter localement autour du joueur ou sur une sélection déjà définie par commandes. Un export local ne déclenche aucun envoi. Le rayon des captures du menu suit le réglage avancé (32 blocs par défaut) ; utiliser `/minemories export 16` pour un essai plus petit. Les captures datées et leurs métadonnées restent dans le sous-dossier `history` du dossier configuré. `capture.glb` et `capture.json` restent des copies du dernier export. **Captures locales**, disponible dans les deux modes, permet de choisir et d’envoyer une capture précédente. Voir [l’historique local](local-capture-history.md).

Le bouton « API Minemories » remplit l’adresse officielle, mais elle ne change qu’après « Enregistrer ». Les modifications non enregistrées sont abandonnées en quittant le mode avancé. Changer d’API retire le jeton et l’identifiant du compte, puis nécessite un nouveau code provenant de la galerie de cette API. Ne jamais partager `config/minemories.properties`.

**Zones suggérées**, dans le mode simple ou via `/minemories suggestions`, classe
les zones de 64 × 64 blocs par temps actif local. La liste reste séparée de la
sélection et des envois ; voir [le score et ses limites](visited-zones.md).

Sur une nouvelle installation, l’AFK est actif : 5 minutes d’inactivité, une capture au plus toutes les 4 heures, rayon 32 blocs. Une désactivation explicite existante est conservée. Le mode simple permet de l’activer/désactiver. Le sous-écran avancé « Réglages AFK » règle l’inactivité (1–1440 min), l’intervalle (1–10080 min) et le rayon (2–128 blocs), persistés dans les propriétés. Les captures restent locales sans compte, puis sont envoyées à la galerie du compte lié. Le contrôle utilise le temps réel depuis les hooks de frame de chaque adaptateur, qui continue en pause et en arrière-plan ; aucun menu n’est bloquant. Les touches, clics et mouvements du joueur réinitialisent l’inactivité. Les captures AFK sont préparées progressivement entre les frames, puis écrites sur worker et envoyées à débit limité ; voir [le parcours, ses limites et les mesures](spooling-glb.md). Le retour du joueur suspend la lecture ; les changements de contexte annulent une capture incomplète.

## Configuration locale

`config/minemories.properties` dans le dossier du profil contient les réglages persistants :

| Clé | Valeur par défaut / règle |
| --- | --- |
| `afkSnapshots` | `true` par défaut ; une désactivation enregistrée reste respectée. |
| `captureFullHeight` | `false` ; le mode avancé permet de capturer toute la hauteur de la dimension. |
| `afkIdleMinutes` / `afkIntervalMinutes` / `captureRadius` | `5` / `240` / `32` ; réglages avancés pour les captures AFK et le rayon des captures du menu. |
| `apiUrl` | `https://api.minemories.net` ; une valeur existante est conservée. À défaut de valeur enregistrée, `MINEMORIES_API_URL` reste utilisable pour le développement. HTTPS requis, HTTP accepté uniquement pour localhost, 127.0.0.1 ou ::1. Pas d’identifiants, query ni fragment dans l’URL. |
| `exportDirectory` | `~/export` ; chemin absolu ou expansion de `~/`, normalisé avant enregistrement. Le dossier est créé lors d’un export. |
| `deviceToken`, `deviceId` | Créés lors de l’appairage ; retirés lors d’une déconnexion ou d’un changement d’API. |

L’URL officielle a répondu `{"status":"ok"}` à `GET /healthz` le 10 octobre 2026. Ce contrôle ne valide pas un appairage authentifié ni un upload sur le service de production.

## Téléchargement sur le site

Le front ne compile pas Java et ne contient aucun JAR. La page `/installation` choisit une version de Minecraft puis un loader parmi les cibles activées, lit l'index public de l'API (`/downloads/index.json`) et propose le JAR de la dernière version de cette cible, servi par `/downloads/<cible>/latest` avec son SHA-256. Aucun ZIP n'est nécessaire : le joueur dépose le JAR dans `mods`, sans extraction ni exécution par double-clic. Le JAR reste expérimental (préversions `-beta.N`).

Les JAR sont construits sur le VPS par `bun mod release`, rangés dans le stockage S3 (3 versions par cible) puis servis par l'API ; le détail est dans [le flux de release](automatic-releases.md). Le déploiement web utilise `railpack.web.json` sans Java.

## CI et publications

Le workflow **Quality gates** vérifie seulement que le mod compile et passe ses contrôles (racine 1.21.1 et une cellule par cible activée) ; il ne produit, ne conserve et ne publie aucun JAR. Les publications Modrinth et CurseForge sont faites par `bun mod publish` (ou par la fin de `bun mod release`) avec `mod/catalogs.json` et les jetons `MODRINTH_TOKEN` / `CURSEFORGE_TOKEN` du VPS, sans reconstruire les archives stockées. Elles restent désactivées tant que les projets ne sont pas créés ; la procédure est dans [automatic-releases.md](automatic-releases.md).

Avant une publication catalogue :

1. Créer les fiches officielles sur Modrinth et CurseForge et préparer descriptions, licence et illustrations.
2. Renseigner `projectId` et `enabled` dans `mod/catalogs.json`, puis les jetons dans l'environnement du VPS.
3. Valider en jeu le JAR de chaque cible sélectionnée, puis essayer `bun mod publish --dry-run`.

## Autres launchers

Modrinth et CurseForge sont les destinations de publication retenues. Prism Launcher, ATLauncher et GDLauncher proposent des téléchargements issus de ces catalogues ; il n’est pas nécessaire de leur envoyer un second JAR. Une instance compatible dans un autre launcher peut utiliser le JAR manuel. Ce mécanisme ne constitue pas une validation en jeu de chaque launcher, et aucune publication universelle sur tous les gestionnaires n’est annoncée.

Sources officielles consultées le 10 octobre 2026 : [Modrinth Create a version](https://docs.modrinth.com/api/operations/createversion/), [CurseForge Upload API](https://support.curseforge.com/support/solutions/articles/9000197321-curseforge-upload-api), [Prism](https://prismlauncher.org/wiki/getting-started/download-mods/), [ATLauncher](https://wiki.atlauncher.com/getting-started/downloading-content/), [GDLauncher](https://gdlauncher.com/).

## Validation

Tests de réglages : défaut officiel et overrides, rejet des URLs dangereuses, invalidation des identifiants au changement d’API, conservation du compte au changement de dossier, validation sans mutation partielle, chemins locaux, défaut AFK et permissions privées/écriture atomique.

Tests du stockage et de l'outil `bun mod` : `node --test scripts/mod/*.test.mjs scripts/mod/*/*.test.mjs`. Tests React : téléchargement et empreinte, erreurs réseau/manifeste, absence de lien cassé et annulation lors d’un changement de page.

La vérification en jeu doit couvrir les modes simple/avancé à différentes échelles GUI, la persistance du dossier, l’export local réel, le changement d’API et le nouvel appairage, les erreurs de connexion, l’envoi en galerie et le retour à l’écran précédent. Tester sur un monde jetable et conserver une copie du profil avant installation.

Validation locale du 10 octobre 2026 : le client de développement NeoForge 21.1.248 a démarré après déclaration des sources de `:core` dans `neoForge.mods.minemories`. Le crash initial `NoClassDefFoundError: dev/minemories/core/GlbScene` est résolu. Les logs montrent un export réel terminé depuis le monde de test (7 369 322 blocs, 291 matériaux). L’utilisateur a validé en jeu la lisibilité des deux modes et la persistance du dossier après fermeture/réouverture. Un test AFK réglé temporairement à 1 min / 1 min / rayon 8 a produit plusieurs captures avec `paused=true`, puis des envois réussis sur l’API de production. L’utilisateur confirme le test ; les réglages locaux ont été remis à 5 / 240 / 32. La validation porte sur le client de développement ; le JAR publié doit encore être testé séparément. Les deux workflows passent `actionlint` 1.7.12.


## Profondeur des captures

Par défaut, les captures autour du joueur, manuelles ou AFK, coupent le sous-sol cinq blocs sous la profondeur la plus basse visitée dans les chunks concernés. À la première capture, le terrain de surface sert aussi de référence pour éviter une capture vide si le joueur vole. Les passages en profondeur étendent ensuite les captures de cette zone. Le suivi fonctionne aussi lorsque les captures AFK sont désactivées.

Cet historique est local, séparé par monde/serveur, dimension et joueur. Il est enregistré dans `config/minemories/exploration/` toutes les dix secondes, avant une capture et au changement de monde. Il conserve au maximum 100 000 chunks par historique ; les plus anciens peuvent être évincés. Les visites antérieures à cette version ne sont pas récupérées. Le seuil est commun à la zone capturée : des cavités non visitées au-dessus de cette profondeur peuvent encore apparaître. Ce n’est pas une reconstruction des seuls blocs vus par le joueur.

La validation comparative complète (surface/grotte/retour/autre zone, dimensions,
redémarrage et autre joueur) est documentée dans
[Validation de la profondeur visitée](exploration-depth-validation.md).

Le bouton **Profondeur** des réglages avancés permet de revenir à toute la hauteur de la dimension. Une sélection explicite conserve toujours ses deux coins. Le suivi ne modifie aucun bloc du monde et ne charge aucun chunk absent. Les côtés et le dessous de la coupe reçoivent une section esthétique : terre dans les trois blocs sous la surface, puis pierre. Les ouvertures de grottes rencontrant le bord sont fermées à ce plan, sans remplir la grotte à l’intérieur. Les fluides au-dessus du fond d’un lac gardent leur surface et leurs faces de coupe transparentes, même si l’eau continue hors de la capture ; les fluides souterrains peuvent rencontrer la section de pierre. Les blocs transparents et non cubiques gardent leur modèle. Aucune paroi n’est ajoutée au-dessus du terrain et aucun bloc du monde n’est modifié.

## Historique des versions

Les pages `/versions` et `/changelog` présentent l'historique des JAR stockés (trois versions par cible) avec accès depuis le tutoriel. Voir [les sources, états et limites](release-history.md). Le téléchargement par défaut reste NeoForge 1.21.1 ; les autres téléchargements utilisent les cibles activées dans `mod/targets.json` : voir la [matrice des loaders](loader-support.md) et ses validations.
