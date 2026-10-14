# Audit initial de l’API — 10 octobre 2026

## Périmètre

Revue du code Bun/Hono, des contrats oRPC/zod, de l’authentification, de
l’appairage, des uploads et du stockage. Tests locaux HTTP/oRPC et scan du
`bun.lock` par `bun audit`. Aucun test intrusif sur la production ni audit de
l’infrastructure Coolify, du reverse proxy ou du bucket de production.

Le produit reste privé par défaut : l’appairage autorise les envois du mod ;
un partage nécessite une action du propriétaire. La revue ne change pas ce parcours.

## Corrections réalisées

- Les GLB partagés et leurs métadonnées portent `Cache-Control: private, no-store`.
  Les tests HTTP vérifient l’ouverture puis la révocation du fichier et des métadonnées.
- Les tentatives d’appairage sont comptées par IP du socket Bun. Les headers
  `X-Forwarded-For` et `CF-Connecting-IP` d’un client direct ne réinitialisent plus
  son quota. Un proxy n’est accepté que si son IP exacte est dans `TRUSTED_PROXY_IPS` ;
  seul le dernier élément IP valide de `X-Forwarded-For` est utilisé. Le proxy doit
  ajouter ou remplacer cette dernière adresse, et son accès doit être contrôlé.
- Le limiteur conserve au plus 4096 adresses, nettoyées périodiquement. Une table
  pleine refuse les nouvelles adresses sans évincer les clients déjà limités.
  Chaque adresse garde huit tentatives par minute ; la réponse de dépassement est 429.
  La limite est locale au processus, elle ne protège pas plusieurs réplicas ensemble.
- Le JSON d’appairage est limité à 2048 octets avant parsing. La lecture est arrêtée
  et annulée au dépassement, même sans `Content-Length` ou avec une valeur mensongère.
  Le nom et le code attendus tiennent dans cette limite ; les uploads restent inchangés.
- `source-map-js` passe de 1.2.1 à 1.2.2 dans le lockfile, version compatible avec
  les plages existantes, pour corriger [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

## Contrôles exercés

- Sessions réelles et requêtes oRPC : accès anonyme refusé, isolation entre comptes,
  partage explicite, révocation, corbeille et suppression.
- Appairage : code expirant après cinq minutes, usage unique transactionnel et
  tokens hachés par HMAC ; neuf requêtes réseau depuis le même socket restent
  limitées malgré des headers IP différents.
- Stockage : contrôle des clés filesystem contre la traversée de chemins,
  accès propriétaire, téléchargement en stream, réponse 503 générique en cas de panne.
- Upload : tailles 100 MiB legacy / 200 MiB reprenable, morceaux de 4 MiB, SHA-256,
  isolation par device, rejeu, offsets, expiration et quotas de staging. Un échec
  SQL après stockage legacy retire l’objet provisoire et ne publie pas de souvenir.
- La couverture reste contrôlée par fichier à 90 % des lignes et 80 % des fonctions,
  avec un inventaire des sources couvertes. Les seuils ne sont pas abaissés.

Validation : `bun run build` (incluant `bun check`) passe ; 44 tests API passent
avec les seuils par fichier. `bun run api:garage` passe les six scénarios réels,
dont la panne du stockage et le redémarrage API. La fixture et ses volumes sont
supprimés après le test. Aucun changement de format GLB ou de comportement Minecraft.

## Alertes et suites autonomes

Le scan après correction du 10 octobre conservait quatre alertes modérées dans les dépendances
transitives de `minio@8.0.7` :

| Dépendance | Alerte | Suite |
| --- | --- | --- |
| `decode-uri-component@0.2.2` via `query-string@7.1.3` | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | Mise à jour compatible du SDK ou correctif maintenu. |
| `stream-json@1.9.1` | [GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x), [GHSA-hqr4-qq8f-hg3x](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x), [GHSA-mjw6-4jj6-33hc](https://github.com/advisories/GHSA-mjw6-4jj6-33hc) | Vérifier la compatibilité avant migration vers la version corrigée. |

Correction du 11 octobre : le client MinIO est remplacé par
`@aws-sdk/client-s3` et `@aws-sdk/lib-storage` en version exacte `3.1149.0`.
Cette migration retire les deux chaînes vulnérables du lockfile, sans override
incompatible ni exclusion d’audit. `bun audit` retourne un rapport vide avec ce
lockfile ; la CI exécute désormais aussi ce contrôle.

Les variables S3 et les clés d’objets restent compatibles. Les captures sont
transmises en stream avec des parts de 8 MiB et un seul envoi simultané ; les
jobs durables abandonnent les uploads incomplets, y compris ceux listés sur
plusieurs pages. Les tests couvrent les octets et les signatures des parts,
la pagination, les refus et les régions. Les huit scénarios Garage réels passent,
dont panne et reprise après redémarrage. Voir [la migration S3](storage-s3.md).

Autres observations à traiter, suivies dans [TASKS.md](../AI/TASKS.md) :

- Correction du 11 octobre : la suppression et la purge inscrivent maintenant les
  objets à effacer dans une file SQLite transactionnelle, avec retries et reprise
  après redémarrage. Voir [les suppressions durables](durable-deletions.md). La
  réconciliation historique reste suivie. Le legacy inscrit aussi maintenant une
  intention avant l’écriture ; son nettoyage après crash et panne a été exercé
  avec Garage réel. Voir [le quota et cette validation](account-storage-quota.md).
- Correction du 11 octobre : les ressources GLB sont contrôlées en commun dans
  les deux uploads et dans le viewer avant le parseur Three.js. Les URI externes,
  buffers sans données et JSON de remplacement sont refusés. Voir
  [les règles et les validations](embedded-glb-resources.md). La disposition et
  les valeurs binaires des accessors sont aussi vérifiées avant stockage et
  chargement. Les dimensions, pixels cumulés et coût estimé des textures sont
  également bornés avant publication et chargement ; voir
  [les budgets et leur validation](embedded-glb-resources.md#dimensions-et-budgets-des-textures).
- Correction du 11 octobre : quota GLB par compte de 2 Gio, configurable, incluant
  la corbeille, les uploads réservés et les objets en attente de suppression.
  Réservations transactionnelles entre legacy et reprenable ; libération après
  nettoyage réussi. Voir [le périmètre et la migration](account-storage-quota.md).
- Correction du 11 octobre : les corps auth sont limités à 16 KiB, les RPC et
  l’initialisation d’upload à 256 KiB avant parsing, avec comptage réel des octets.
  Les deux miniatures maximales restent acceptées et les plafonds binaires restent
  inchangés. Voir [les limites et les validations](api-json-limits.md).
- Correction du 11 octobre : secrets explicitement distincts, suppression du repli
  du pepper et contrôle de la configuration de production avant ouverture SQLite.
  Voir [les variables et la migration](api-startup-configuration.md). L’audit de
  l’infrastructure réelle reste suivi séparément.

## Exploitation

Configurer les proxys selon [le guide Coolify](coolify-railpack.md). Sans IP de
proxy déclarée, les joueurs derrière celui-ci partagent sa limite d’appairage.
Les captures d’un mod déjà appairé ne passent pas par ce limiteur.

Relancer `bun audit` régulièrement : le rapport décrit l’état du lockfile à sa
rédaction, pas une garantie permanente. Les contrôles du déploiement, les sauvegardes,
la rotation des secrets et les protections à l’entrée restent à vérifier sur
l’infrastructure réelle.
