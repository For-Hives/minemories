# État des tâches — 14 octobre 2026

Cet audit conserve les preuves des critères exercés. Le 14 octobre 2026, les 36 lignes de `docs/AI/TASKS.md` ont été transférées chacune dans une issue GitHub : 33 nouvelles issues et actualisation des issues #5, #6 et #7. Le fichier est désormais vide ; le suivi des travaux ouverts se fait uniquement dans [GitHub Issues](https://github.com/For-Hives/minemories/issues). Une fonction implémentée reste ouverte si des critères ou validations manquent.

Les 38 issues du dépôt, ouvertes ou fermées, utilisent les labels existants. Les 36 tâches transférées sont réparties entre 18 `autonomous` et 18 `needs-human`, avec les domaines `mod`, `api`, `front` et `ideas` selon leur portée. L’issue #4 conserve son dashboard de dépendances et l’issue #8 reste fermée. Les preuves et critères de chaque ligne originale figurent dans le corps de son issue ; aucun second backlog local n’est maintenu.

## Parcours terminés

- AFK par défaut, pause/arrière-plan et réglages simples/avancés : validés par l’utilisateur en client de développement. La validation du JAR distribué reste distincte.
- Sources core/NeoForge et export réel : démarrage et capture validés ; le crash `GlbScene` est corrigé.
- Envoi automatique après appairage : capture AFK envoyée en production ; sans appairage, capture locale uniquement.
- Garage réel : `bun run api:garage` passe huit scénarios HTTP/oRPC et stockage, dont une panne réelle du conteneur, une reprise par nouveau processus API et un crash après upload legacy multipart, sans doublon et avec contrôle des octets. Fixture Docker jetable, distincte des volumes de développement.
- Ancien volume local `dev_minio_data` : inspection en lecture seule, aucun fichier et aucun bucket de captures trouvé. Pas de migration locale à effectuer. Cette conclusion ne concerne aucun autre déploiement.

- Audit initial API : headers de partage sans cache public, IP du socket et proxys de confiance, limiteur mémoire borné, corps d’appairage limité, correctif source-map-js. Les observations et alertes restantes sont dans [le rapport](api-security-audit.md) et les suites dans [issue #66](https://github.com/For-Hives/minemories/issues/66) et [issue #65](https://github.com/For-Hives/minemories/issues/65).

- Suppressions/purges durables : file SQLite transactionnelle, backoff, reprise dans un nouveau processus après panne réelle Garage et refus de réutilisation des clés en attente. Voir [la validation et les limites](durable-deletions.md).

- Délais corrigés : trente jours pour les nouvelles mises en corbeille, anciennes échéances préservées avec trente jours de grâce minimum, compte à rebours issu de l’API et cache d’appairage de soixante jours. Migration persistante, rollback, frontières calendaires, contrat oRPC et restauration dans la galerie testés ; build complet et sept scénarios Garage passent. Voir [la migration](trash-retention.md).

- Démarrage API : secrets explicites et distincts, configuration de production validée avant SQLite, origines normalisées et arrêt des minuteries au signal. Tests unitaires et vrais processus Bun avec configuration invalide/valide, sans secrets réels. L’audit du déploiement reste ouvert. Voir [les contrôles et les conséquences d’un changement de pepper](api-startup-configuration.md).

- Ressources GLB embarquées : validation commune aux uploads legacy/reprenable et au viewer, URI externes refusées, prévention du remplacement de JSON et des buffers absents, limites conservées. Tests HTTP, parseur Three.js réel, interactions local/galerie, capture Minecraft de 10 MiB acceptée et rendu Blender inspecté avec ses 55 textures PNG. Build complet et sept scénarios Garage passent. Voir [la politique et les limites](embedded-glb-resources.md).

- Corps JSON auth/RPC/initialisation : limites distinctes avant parsing, arrêt des flux trop grands même sans taille fiable, conservation des cookies et tokens, deux miniatures proches du maximum acceptées, et plafonds binaires préservés. Tests sur serveur Bun réel et sessions oRPC ; le nouveau middleware est couvert à 100 % des lignes et fonctions. Voir [les plafonds et leur portée](api-json-limits.md).

- Quota GLB par compte : 2 Gio configurables, captures et corbeille, réservations des deux uploads, objets à effacer ; concurrence, rejeu, panne et libération après nettoyage testés. Legacy durable avant écriture et publication atomique ; crash après upload multipart de 9 MiB, panne Garage et nettoyage par nouveaux processus exercés. Build complet et huit scénarios Garage passent. Voir [le quota et les limites historiques](account-storage-quota.md). L’exécution de la réconciliation en production reste suivie.

- Résumé de stockage privé : contrat oRPC et statut device exposent l’espace disponible, le total, les réservations et les effacements en attente. La galerie explique la libération d’espace et la conservation du GLB local ; chargement, panne, rafraîchissement et réponses tardives testés. Sessions réelles et Garage exercés. Dans Minecraft, le compteur des deux modes et l’écran de détails ont été validés par le développeur ; la fixture locale permet les envois jusqu’à 200 MiB. Voir [les champs et le parcours](account-storage-quota.md#consulter-lespace).

- Réconciliation historique : inventaire privé par clé et upload multipart, plan borné et ciblable par préfixe, revue puis application après arrêt de l’API et sauvegarde SQLite. Les claims existants sont réparés uniquement avec des valeurs connues ; les objets protégés restent conservés et les cas ambigus nécessitent une revue. La file durable exécute ensuite les suppressions. Neuf scénarios Garage passent ; aucune exécution en production n’est déduite de cette validation locale. Voir [la commande et le parcours](storage-reconciliation.md).

- Historique local : captures datées distinctes, migration du dernier export existant, copies de compatibilité `capture.glb`/`capture.json`, pagination et envoi de la capture sélectionnée avec ses propres métadonnées. Tests de collision, panne d’écriture, JSON borné/illisible, chemins, réponse tardive et envoi pendant un nouvel export. Minecraft 1.21.1 / NeoForge 21.1.248 exercé sur une copie isolée : six captures réelles lors du premier essai, persistance après redémarrage, puis import d’une ancienne capture de 57 016 octets et cinq nouvelles captures de terrain de 61 300 octets. Les accès simple/avancé, pages de quatre puis deux entrées, retour, envoi des anciens octets/métadonnées vers une API HTTP de test et refus sans appairage ont été vérifiés ; les écrans ont été inspectés visuellement. Cela ne prouve pas l’envoi de production ni le JAR distribué. Voir [l’historique et ses limites](local-capture-history.md).

- Refus des captures vides : contrôle des vrais chunks reçus, absence de publication sans géométrie, conservation du dernier GLB/JSON/référence et messages d’aide dans les deux modes. Tests core/historique et scénario Minecraft 1.21.1 / NeoForge 21.1.248 isolé : chunk absent, sélection d’air, absence d’upload et de profondeur provisoire, puis exports d’eau seule BLEND et de terrain chargé. Les messages ont été inspectés visuellement. Le buffer NORMAL est aussi testé pour les coordonnées finies extrêmes, après correction des soustractions en float. Voir [le scénario et ses limites](local-capture-history.md#vérification-du-refus-des-captures-vides).

Les entités, lits et coffres standards sont maintenant capturés avec leur pose
et leurs vraies textures. Le JAR beta a été chargé seul dans Minecraft
1.21.1 / NeoForge 21.1.248 : animaux, mobs équipés, joueur, lit et coffres
simple/double fermés puis ouverts ; capture d'un animal seul et AFK en menu
pause. Les rendus Blender et les contrôles API/viewer passent. Les renderers
particuliers des modpacks restent à exercer. Voir [la validation](frozen-entities.md).


- Préversion GitHub `0.1.0-beta` publiée après fusion de la PR #56 et succès CI. Le téléchargement réel depuis le guide public a la même empreinte que le JAR testé en jeu ; profils CurseForge compatibles mis à jour avec sauvegarde. Voir [la distribution](mod-distribution.md).

## Travaux encore ouverts


Le writer core `SpoolingGlbScene` prépare la mémoire bornée : géométrie/textures/JSON sur disque, cache de fichiers ouverts borné et publication atomique, avec refus des dépassements, interruptions et fichiers remplacés. Les tests vérifient l’équivalence binaire avec `GlbScene`, y compris les normales extrêmes ; un vrai processus à heap limitée à 32 Mio produit un GLB de 91 201 408 octets. Les fixtures legacy/spoolées sont identiques et leurs rendus Blender ont été inspectés. La PR #58 raccorde la capture AFK progressive : copie par frames, file/worker bornés, suspension, annulations, débit d’envoi et dates de capture. Le JAR final est exercé dans Minecraft, avec API loopback réelle et rendus Blender ; voir [les preuves et les mesures](spooling-glb.md). L’issue #84 suit ce raccordement ; l’issue #79 est terminée avec les [mesures par phase et leur corpus](afk-performance.md) ; les matériels/renderers de modpacks particuliers restent dans #91. La beta GitHub déjà publiée reste distincte de ce JAR de développement.

Les diagnostics privés consentis sont implémentés : consentement explicite lié à l’API/appareil/jeton, permis révocable, traces et étapes bornées, corrélation capture/upload, limites persistantes, rétention et consultation/groupement CLI en lecture seule. Les tests HTTP/Java couvrent les refus, changements d’identité, retries et réponses tardives ; deux lancements Minecraft isolés avec API loopback réelle ont exercé appairage, NON/OUI, upload, panne, persistance, retrait/effacement et déconnexion. Les rapports privés ont été contrôlés. Leur déploiement et validation de production restent suivis dans [issue #82](https://github.com/For-Hives/minemories/issues/82) ; voir [le parcours et les limites](consented-diagnostics.md).

Les tâches mod/API restantes sont suivies dans leurs issues GitHub : sélection des zones fréquentées, optimisation GLB, timelapse, lecture progressive et mesures de performance, autres loaders, observabilité consentie, facturation Polar et stockage hot/cold. Les validations en jeu des coupures/reprises de production et des autres parcours du JAR restent suivies. Les tests de galerie restent suivis. La couverture API est maintenant contrôlée par fichier (90 % des lignes, 80 % des fonctions), avec inventaire des sources et test négatif du vrai runner.

La profondeur visitée est implémentée avec tests de persistance/isolation et captures réelles importées dans Blender ; le parcours comparatif complet surface/grotte/retour/autre zone, dimension, monde, joueur et redémarrage est désormais [documenté](exploration-depth-validation.md), avec AFK désactivé, pleine hauteur et sélection explicite vérifiés. Les faces de coupe terre/pierre sont implémentées, avec tests des limites et des plans, et rendus Blender de surface et de profondeur. La scène de contrôle eau/verre/feuilles/escalier exportée en pause confirme les faces d’eau sur la coupe et les matériaux MASK/BLEND, avec un rendu Blender inspecté. La tâche #8 est terminée.

## Actions humaines et périmètre

- Issue #5 : créer/configurer les projets et identifiants de distribution Modrinth/CurseForge. La CI est préparée, la publication reste désactivée par défaut.
- Issue #6 : contrôler/redéployer le front et confirmer l’ouverture authentifiée de la galerie. Les sujets auparavant regroupés sont séparés : infrastructure API [issue #66](https://github.com/For-Hives/minemories/issues/66), réconciliation [issue #65](https://github.com/For-Hives/minemories/issues/65), routage Nginx [issue #67](https://github.com/For-Hives/minemories/issues/67) et diagnostics [issue #82](https://github.com/For-Hives/minemories/issues/82).
- Logo et direction artistique : [issue #76](https://github.com/For-Hives/minemories/issues/76) ; maquettes du mod : [issue #62](https://github.com/For-Hives/minemories/issues/62). Ces travaux restent exclus de l’implémentation mod/API prioritaire.
