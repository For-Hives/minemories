# Stockage S3 — migration du 11 octobre 2026

L’API utilise `@aws-sdk/client-s3` et `@aws-sdk/lib-storage` en version exacte
`3.1149.0`. Le remplacement du client MinIO retire les quatre alertes transitives
du premier audit ; `bun audit` retourne un rapport vide avec le lockfile testé.
La CI contrôle aussi cet audit. Ce résultat décrit ce lockfile à cette date.

## Configuration et compatibilité

Les variables `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY` et
`S3_SECRET_KEY` restent identiques, ainsi que les clés des objets et la base SQLite.
Aucune copie d’objet ou migration SQL n’est nécessaire. Le mode filesystem ne
change pas. Cette migration de SDK ne migre pas les anciens volumes MinIO.

Le client utilise l’endpoint configuré, des URL path-style et des identifiants
explicites ; il ne cherche pas de credentials auprès d’un service de métadonnées
AWS. Le bucket est vérifié une fois ; un 404 permet sa création, tandis qu’un
refus d’accès ou une panne est propagé et autorise une nouvelle tentative ultérieure.
La création transmet la région configurée, sauf `us-east-1`, où le protocole S3
attend un corps vide. Les noms de régions propres à Garage restent utilisables.

Garage 2.4.1 est exercé en intégration réelle. Les autres providers compatibles
S3 ne sont pas déclarés validés par ces tests. Le déploiement réel, son endpoint
HTTPS, ses droits de bucket et ses volumes restent à vérifier séparément.

## Envoi, téléchargement et nettoyage

Le transfert fichier → S3 utilise un stream, des parts de **8 MiB** et un seul
worker. Il ne charge pas la capture entière en mémoire. Les morceaux du mod vers
l’API restent de **4 MiB**, pour un fichier maximal de **450 MiB**. Les téléchargements
HTTP restent des streams privés ou partagés explicitement, avec `private, no-store`.

Le SDK dispose de trois tentatives maximales, d’un délai de connexion de quinze
secondes et d’un délai d’inactivité socket de trente secondes. Un upload échoué
laisse ses parts pour le nettoyage durable SQLite, qui couvre aussi un crash du
processus. L’abandon est effectué avant la suppression de l’objet provisoire.
La liste est paginée avec ses deux marqueurs ; seuls les uploads de la clé exacte
sont abandonnés, sans toucher aux clés qui partagent son préfixe. Une pagination
cyclique, un identifiant absent ou un abandon refusé conserve le job pour retry.

Les checksums S3 optionnels sont configurés sur `WHEN_REQUIRED` : Garage ne
prend pas en charge toutes les extensions CRC du SDK. Les signatures SHA-256
des requêtes et les SHA-256 du protocole reprenable restent contrôlés.
Les options de multipart sont décrites dans le
[README officiel d’Upload](https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-storage/README.md),
et le comportement des checksums dans la
[documentation AWS](https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html).

## Vérification

- Les fixtures HTTP utilisent le vrai SDK : roundtrip d’octets, régions, droits,
  panne d’initialisation, parts signées, refus d’une part et nettoyage paginé.
- Un fichier de 20 MiB aux données distinctes produit des parts de 8/8/4 MiB,
  avec comparaison du SHA-256 de l’ensemble. Une autre source garde sa fin
  indisponible jusqu’à réception de la première part, pour vérifier l’envoi en stream.
- `bun run api:garage` passe les huit scénarios contre Garage réel, dont les
  pannes, le nettoyage et la reprise dans un nouveau processus API sans doublon.
- `bun run build` conserve les seuils de couverture et construit le web et le mod.

Le format GLB et le code Minecraft ne changent pas. La validation en jeu du JAR
distribué et les essais réseau de production restent suivis dans [issue #81](https://github.com/For-Hives/minemories/issues/81) et [issue #83](https://github.com/For-Hives/minemories/issues/83).
