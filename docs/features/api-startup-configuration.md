# Configuration vérifiée au démarrage de l’API

En production, l’API vérifie sa configuration avant d’ouvrir SQLite, de migrer les tables ou
d’écouter des requêtes. Railpack démarre explicitement avec `NODE_ENV=production`.
En développement, utiliser `bun api:dev` avec les variables de `.env.example`
remplacées par ses propres secrets.

Dans tous les environnements, `BETTER_AUTH_SECRET` et `PAIRING_PEPPER` sont
obligatoires, distincts et longs d’au moins trente-deux caractères après retrait
des espaces en début et fin.
Les valeurs `replace-with-…` de l’exemple sont refusées. Aucun secret n’est généré
ou remplacé au démarrage ; les erreurs nomment la variable, sans en recopier la
valeur. `PAIRING_PEPPER` ne retombe plus sur le secret d’authentification.

En production, les contrôles supplémentaires sont les suivants :

- `BETTER_AUTH_URL` et chaque origine de `WEB_ORIGIN` sont des URL HTTPS explicites,
  sans identifiants, query ni fragment. Les origines ne contiennent aucun chemin.
  Elles sont normalisées pour CORS et Better Auth, notamment la casse, le port
  HTTPS par défaut et le slash final. Aucun wildcard implicite n’est ajouté.
- `API_PORT` est un entier de 1 à 65535, avec 3001 comme valeur par défaut.
- `DATABASE_PATH` et `UPLOADS_PATH` sont explicites et absolus. L’exploitant doit
  monter leurs volumes persistants : le contrôle d’un chemin ne prouve pas que
  l’hébergeur conserve son contenu après redéploiement.
- Le driver est `s3` par défaut ou explicitement `filesystem`. En S3, l’endpoint
  HTTP/HTTPS sans chemin, les deux identifiants, le bucket et la région sont
  obligatoires ; les identifiants de la fixture Garage locale sont refusés.
  HTTP reste accepté pour Garage sur le réseau interne du déploiement.
  En filesystem, `LOCAL_OBJECTS_PATH` doit être explicite, absolu et persistant.
- Les adresses de `TRUSTED_PROXY_IPS`, si présentes, sont des IPv4/IPv6 exactes.
  Cela ne vérifie pas à distance que le proxy est correctement configuré.

Avant de redéployer, renseigner ces variables selon
[le guide Coolify](coolify-railpack.md). Garder les secrets existants lorsqu’ils
répondent aux contrôles : les changer invalide les sessions ou les appareils
appairés. Si une ancienne installation utilisait le repli du pepper sur le secret
d’authentification, définir un pepper distinct impose un nouvel appairage des
mods. Les captures locales et les souvenirs déjà stockés sont conservés.

Le démarrage configuré et le refus des configurations invalides sont exercés
dans de vrais processus Bun, avec une base temporaire et sans accès aux données
ou secrets de production. Le contrôle de santé est `GET /healthz`. Le processus
ferme aussi ses minuteries de maintenance lors de SIGINT/SIGTERM, attend l’arrêt
du serveur, puis ferme SQLite ; le test vérifie sa terminaison normale.

Ces validations ne constituent pas un audit de l’infrastructure en production.
L’accès direct au port API, les droits du bucket, les sauvegardes, les montages
persistants et la rotation des secrets restent suivis dans [issue #66](https://github.com/For-Hives/minemories/issues/66).
