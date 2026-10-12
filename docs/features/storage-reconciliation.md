# Réconciliation du stockage historique

`bun run api:reconcile` prépare un inventaire des objets complets, uploads
multipart abandonnés et anciens jobs de suppression. Il lit leurs métadonnées
sur le stockage configuré de l’API : Garage/S3 ou filesystem. Les fichiers GLB
restent sur leur stockage pendant cette préparation.

La commande utilise la même `.env` et le même répertoire de travail que l’API.
`DATABASE_PATH` doit désigner une base existante, déjà migrée par la version
courante de l’API. Les erreurs de chemin empêchent toute création de SQLite.

## Préparer et revoir le plan

Depuis la racine du dépôt :

```sh
bun run api:reconcile --plan /chemin-prive/inventaire.json
```

Le fichier JSON est créé en mode **0600**, avec une version, sa date, la cible
SQLite, l’identité du stockage et les observations de chaque clé. Le terminal
affiche seulement les compteurs. Une création refuse d’écraser un fichier existant.
Garder le plan dans un dossier privé, car il contient des identifiants de compte
et des clés d’objet.

Les budgets sont **50 000 enregistrements examinés** (objets, uploads et jobs
cumulés) et **32 MiB** par plan. Pour un inventaire plus grand, préparer un plan
par propriétaire :

```sh
bun run api:reconcile --plan /chemin-prive/proprietaire.json --prefix identifiant-du-compte/
```

Les listings S3 sont paginés ; les multipart conservent les deux marqueurs.
Une erreur, une pagination cyclique ou des doublons interrompent l’inventaire.
Le filesystem refuse les liens symboliques et les chemins sortant de son volume.

| Proposition | Traitement |
| --- | --- |
| `protected` | Un souvenir ou un upload incomplet référence encore la clé, même si sa session est expirée. Un job contradictoire est conservé pour revue. |
| `review` | La clé, le propriétaire ou les données du job sont ambigus ou incohérents. |
| `recent` | L’objet ou au moins un multipart de cette clé a moins de 24 heures. |
| `queue` | Un orphelin ancien, avec une clé générée `propriétaire/UUID.glb` et un propriétaire connu, est proposé pour la file durable. |
| `repair` | Un ancien job peut récupérer son propriétaire ou sa taille manquante, ou le nettoyage de ses multipart. |
| `unchanged` / `gone` | Les données connues sont déjà complètes, ou l’objet a disparu. |

Les propriétaires sont reconnus depuis les comptes, appareils, souvenirs ou
sessions enregistrés dans SQLite. La taille récupérée vient de l’objet complet.
Quand il ne reste que des parts multipart, la taille du GLB initial est
irrécupérable : le plan conserve `null` et l’indique dans sa raison. L’absence
d’objet et de multipart permet de récupérer une taille nulle.

## Appliquer hors ligne

Arrêter le processus API et revoir les propositions du plan avant application :

```sh
bun run api:reconcile --plan /chemin-prive/inventaire.json --apply --api-stopped --backup /chemin-prive/avant-reconciliation.sqlite
```

`--api-stopped` atteste cet arrêt ; le déploiement cible un seul processus API.
L’application vérifie le chemin SQLite et l’identité du stockage, puis crée une
sauvegarde SQLite complète en mode **0600**, sous un nouveau nom. Cette sauvegarde
couvre les métadonnées ; la conservation des GLB dépend du stockage objet.

Chaque candidat approuvé passe une nouvelle inspection. L’ETag, la taille, la
date de modification à la précision HTTP et les uploads multipart sont comparés
aux observations du plan. Garage fournit des millisecondes dans LIST mais des
secondes dans le header `Last-Modified` ; la comparaison respecte cette précision.
Le fingerprint filesystem inclut aussi l’inode et la date précise du fichier.

Les références et jobs SQLite sont ensuite relus dans une transaction
`IMMEDIATE`. Les éléments changés sont ignorés ; une proposition protégée, récente
ou à revoir garde son exclusion. Le rejeu du même plan ne réinscrit pas ses jobs.
Une erreur de mutation annule toute la transaction.

Les nouvelles intentions utilisent `discard_upload=1`. Les réparations complètent
uniquement les champs oubliés et conservent les tentatives, échéances et dates
initiales. Le nettoyage physique est effectué par la
[file durable](durable-deletions.md) au redémarrage de l’API, avec son backoff
et sa protection des captures encore référencées. Revoir les cas ambigus avant
de reprendre la maintenance. Une erreur de sauvegarde ou d’inspection empêche
l’application ; vérifier une copie avant de l’utiliser pour une restauration.

## Portée et vérification

L’inventaire concerne la version courante des objets et leurs multipart. Les
anciennes versions d’un bucket versionné suivent la politique du provider.
Les anciens volumes MinIO doivent être ciblés explicitement dans leur configuration.

Tests : validation et taille du plan, UTF-8 invalide et JSON tronqué, fichiers
privés, DB absente, sauvegarde restaurable, références apparues après inventaire,
objet modifié, rejeu, rollback du second changement et conservation des retries.
Le scénario Garage réel conserve une capture active, complète un ancien job,
supprime les orphelins de sa fixture et abandonne leurs multipart. Les pannes et
reprises des uploads et suppressions restent vérifiées par les autres scénarios.
Aucune donnée de production n’est utilisée par ces tests.
