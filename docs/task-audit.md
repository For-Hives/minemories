# État des tâches — 10 octobre 2026

Cet audit retire uniquement les critères exercés ; les critères restants restent dans `TASKS.md`.

## Parcours terminés

- AFK par défaut, pause/arrière-plan et réglages simples/avancés : validés par l’utilisateur en client de développement. La validation du JAR distribué reste distincte.
- Sources core/NeoForge et export réel : démarrage et capture validés ; le crash `GlbScene` est corrigé.
- Envoi automatique après appairage : capture AFK envoyée en production ; sans appairage, capture locale uniquement.
- Garage réel : `bun run api:garage` passe six scénarios HTTP/oRPC et stockage, dont une panne réelle du conteneur et une reprise par nouveau processus API, sans doublon et avec contrôle des octets. Fixture Docker jetable, distincte des volumes de développement.
- Ancien volume local `dev_minio_data` : inspection en lecture seule, aucun fichier et aucun bucket de captures trouvé. Pas de migration locale à effectuer. Cette conclusion ne concerne aucun autre déploiement.

## Travaux encore ouverts

Les tâches mod/API restantes sont conservées : sélection des zones fréquentées, optimisation GLB, captures horodatées et historique, timelapse, lecture progressive et mesures de performance, autres loaders, observabilité consentie, facturation Polar et stockage hot/cold. Les validations en jeu des coupures/reprises et du JAR exact restent requises. Les tests de galerie et le seuil de couverture API restent également suivis.

La profondeur visitée est implémentée avec tests de persistance/isolation et captures réelles importées dans Blender ; sa validation comparative surface/grotte reste suivie tant que le scénario n’est pas documenté complètement. Les faces de coupe terre/pierre sont suivies dans l’issue #8.

## Actions humaines et périmètre

- Issue #5 : créer/configurer les projets et identifiants de distribution Modrinth/CurseForge. La CI est préparée, la publication reste désactivée par défaut.
- Issue #6 : redéployer le front et confirmer l’ouverture authentifiée de la galerie en production.
- Logo et direction artistique : conservés mais exclus du travail demandé sur le mod/API.
