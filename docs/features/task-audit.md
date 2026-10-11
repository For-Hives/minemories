# État des tâches — 11 octobre 2026

Cet audit retire uniquement les critères exercés ; les critères restants restent dans `TASKS.md`.

## Parcours terminés

- AFK par défaut, pause/arrière-plan et réglages simples/avancés : validés par l’utilisateur en client de développement. La validation du JAR distribué reste distincte.
- Sources core/NeoForge et export réel : démarrage et capture validés ; le crash `GlbScene` est corrigé.
- Envoi automatique après appairage : capture AFK envoyée en production ; sans appairage, capture locale uniquement.
- Garage réel : `bun run api:garage` passe six scénarios HTTP/oRPC et stockage, dont une panne réelle du conteneur et une reprise par nouveau processus API, sans doublon et avec contrôle des octets. Fixture Docker jetable, distincte des volumes de développement.
- Ancien volume local `dev_minio_data` : inspection en lecture seule, aucun fichier et aucun bucket de captures trouvé. Pas de migration locale à effectuer. Cette conclusion ne concerne aucun autre déploiement.

- Audit initial API : headers de partage sans cache public, IP du socket et proxys de confiance, limiteur mémoire borné, corps d’appairage limité, correctif source-map-js. Les observations et alertes restantes sont dans [le rapport](api-security-audit.md) et les suites dans `docs/AI/TASKS.md`.

- Suppressions/purges durables : file SQLite transactionnelle, backoff, reprise dans un nouveau processus après panne réelle Garage et refus de réutilisation des clés en attente. Voir [la validation et les limites](durable-deletions.md).

- Délais corrigés : trente jours pour les nouvelles mises en corbeille, anciennes échéances préservées avec trente jours de grâce minimum, compte à rebours issu de l’API et cache d’appairage de soixante jours. Migration persistante, rollback, frontières calendaires, contrat oRPC et restauration dans la galerie testés ; build complet et sept scénarios Garage passent. Voir [la migration](trash-retention.md).

- Démarrage API : secrets explicites et distincts, configuration de production validée avant SQLite, origines normalisées et arrêt des minuteries au signal. Tests unitaires et vrais processus Bun avec configuration invalide/valide, sans secrets réels. L’audit du déploiement reste ouvert. Voir [les contrôles et les conséquences d’un changement de pepper](api-startup-configuration.md).

## Travaux encore ouverts

Les tâches mod/API restantes sont conservées : sélection des zones fréquentées, optimisation GLB, captures horodatées et historique, timelapse, lecture progressive et mesures de performance, autres loaders, observabilité consentie, facturation Polar et stockage hot/cold. Les validations en jeu des coupures/reprises et du JAR exact restent requises. Les tests de galerie restent suivis. La couverture API est maintenant contrôlée par fichier (90 % des lignes, 80 % des fonctions), avec inventaire des sources et test négatif du vrai runner.

La profondeur visitée est implémentée avec tests de persistance/isolation et captures réelles importées dans Blender ; sa validation comparative surface/grotte reste suivie tant que le scénario n’est pas documenté complètement. Les faces de coupe terre/pierre sont implémentées, avec tests des limites et des plans, et rendus Blender de surface et de profondeur. La scène de contrôle eau/verre/feuilles/escalier exportée en pause confirme les faces d’eau sur la coupe et les matériaux MASK/BLEND, avec un rendu Blender inspecté. La tâche #8 est terminée.

## Actions humaines et périmètre

- Issue #5 : créer/configurer les projets et identifiants de distribution Modrinth/CurseForge. La CI est préparée, la publication reste désactivée par défaut.
- Issue #6 : redéployer le front et confirmer l’ouverture authentifiée de la galerie en production.
- Logo et direction artistique : conservés mais exclus du travail demandé sur le mod/API.
