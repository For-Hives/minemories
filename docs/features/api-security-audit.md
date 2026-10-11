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

Le scan après correction conserve quatre alertes modérées dans les dépendances
transitives de `minio@8.0.7` :

| Dépendance | Alerte | Suite |
| --- | --- | --- |
| `decode-uri-component@0.2.2` via `query-string@7.1.3` | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | Mise à jour compatible du SDK ou correctif maintenu. |
| `stream-json@1.9.1` | [GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x), [GHSA-hqr4-qq8f-hg3x](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x), [GHSA-mjw6-4jj6-33hc](https://github.com/advisories/GHSA-mjw6-4jj6-33hc) | Vérifier la compatibilité avant migration vers la version corrigée. |

Minemories utilise le SDK pour les objets/multipart ; son code n’appelle pas les
notifications de bucket ni le parsing `query-string`. Cela limite les parcours
identifiés ici, sans retirer les alertes du scan. Les correctifs proposés hors
plage changent de version majeure ; aucun override incompatible ni exclusion
silencieuse n’est ajouté. Toute évolution S3 doit conserver les tests de bytes,
multipart, panne et reprise contre Garage réel.

Autres observations à traiter, suivies dans [TASKS.md](../AI/TASKS.md) :

- Correction du 11 octobre : la suppression et la purge inscrivent maintenant les
  objets à effacer dans une file SQLite transactionnelle, avec retries et reprise
  après redémarrage. Voir [les suppressions durables](durable-deletions.md). La
  réconciliation historique et le nettoyage des uploads legacy restent suivis.
- La validation GLB vérifie le conteneur et son JSON, mais ne garantit pas encore
  l’absence d’URI externes de buffers/images. Le viewer Three.js parse ces documents :
  imposer les ressources embarquées et tester le refus des références externes.
- Le quota de staging ne borne pas le stockage total des captures finalisées par
  compte. Définir et appliquer cette limite avant une ouverture publique.
- Les routes JSON auth/RPC héritent du plafond legacy de 100 MiB du serveur.
  L’initialisation d’upload utilise déjà la lecture bornée à 4 MiB des morceaux.
  Ajouter des limites JSON adaptées à ces trois parcours, sans réduire les limites
  binaires ni rejeter les miniatures valides.
- Deux secrets distincts sont documentés, mais le pepper d’appairage peut encore
  retomber sur le secret d’auth. Rendre les vérifications de configuration explicites
  avant déploiement public, avec tests de démarrage et sans valeurs locales par défaut.

## Exploitation

Configurer les proxys selon [le guide Coolify](coolify-railpack.md). Sans IP de
proxy déclarée, les joueurs derrière celui-ci partagent sa limite d’appairage.
Les captures d’un mod déjà appairé ne passent pas par ce limiteur.

Relancer `bun audit` régulièrement : le rapport décrit l’état du lockfile à sa
rédaction, pas une garantie permanente. Les contrôles du déploiement, les sauvegardes,
la rotation des secrets et les protections à l’entrée restent à vérifier sur
l’infrastructure réelle.
