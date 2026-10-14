# Limites des requêtes JSON

Les routes qui reçoivent les informations d’un compte ou d’une capture ont un
plafond propre, appliqué avant leur parseur. Les fichiers GLB suivent leurs
limites binaires habituelles.

| Parcours | Plafond du corps reçu |
| --- | --- |
| Authentification `/api/auth/*` | 16 KiB, soit 16 384 octets |
| RPC `/rpc/*` | 256 KiB, soit 262 144 octets |
| Initialisation `POST /api/mod/uploads` | 256 KiB, soit 262 144 octets |
| Appairage `POST /api/mod/pair` | 2 KiB, inchangé |

Le contrôle compte les octets du flux, même sans `Content-Length` ou avec une
valeur déclarée trop petite. Une taille déclarée supérieure au plafond est
refusée immédiatement. La lecture s’arrête et le flux est annulé au premier
dépassement ; le corps refusé n’est pas transmis au parseur ni conservé dans le
staging d’un upload. Une erreur d’annulation ne transforme pas le refus en
succès.

Pour les trois nouveaux plafonds, la réponse est HTTP 413 avec
`{"error":"request_body_too_large"}`. Un flux illisible reçoit HTTP 400 avec
`{"error":"invalid_request_body"}`, sans détails internes. Un JSON mal formé
qui respecte la taille reste traité par le parseur de la route. Les réponses
conservent les règles CORS de l’API.

Un corps accepté conserve l’URL, la méthode, les cookies, le token et l’origine.
Le header de taille est recalculé et `Transfer-Encoding` retiré avant de remettre
le corps au parseur. Les appels sans corps, notamment la lecture de session,
restent possibles. Les contrôles auth/RPC précèdent leurs gestionnaires ;
l’initialisation exige d’abord un device appairé, puis vérifie la taille avant
toute réservation de fichier.

## Miniatures et fichiers

Le contrat autorise 96 000 caractères pour chacune des deux images `thumbnail`
et `icon`. Le plafond de 256 KiB permet de transmettre les deux images avec
leurs métadonnées et l’enveloppe oRPC. Les tests utilisent deux vrais PNG en
data URI de 95 998 caractères chacun, avec une métadonnée UTF-8, et vérifient
leur conservation après upload et modification via une session authentifiée.
Le PNG de test contient un chunk texte avec CRC valide ; son décodage a aussi
été vérifié avec Pillow.

Les uploads legacy restent limités à 100 MiB. Les uploads reprenables restent
limités à 200 MiB, avec des morceaux de 4 MiB : le nouveau middleware n’est
appliqué ni aux fichiers legacy ni aux morceaux. La validation GLB et le calcul
du SHA-256 des fichiers reprenables restent en streaming.

## Validation et portée

Les tests couvrent la frontière exacte en octets, un caractère UTF-8 réparti
sur deux lectures, une taille absente ou mensongère, l’arrêt de lecture, les
erreurs de flux et la conservation des credentials. Un serveur Bun réel reçoit
des requêtes streamées trop grandes sur les trois parcours et renvoie 413 avec
les headers CORS ; il accepte ensuite un fichier GLB dépassant 256 KiB. Les
tests d’initialisation vérifient aussi l’absence de ligne SQLite et de fichier
staging après refus.

`bun run build`, qui inclut `bun check`, passe avec 72 tests API et 57 tests
web. Le middleware est couvert à 100 % des lignes et fonctions.
`bun run api:garage` passe ses sept scénarios réels HTTP/oRPC et stockage,
y compris panne et reprise dans un nouveau processus. Les quatre tests Garage
ignorés par le runner API ordinaire sont exercés par cette commande dédiée.

Ces plafonds bornent le corps transmis au parseur. Ils ne remplacent pas les
quotas de stockage par compte ni les protections du proxy contre les connexions
lentes ou les requêtes concurrentes, suivis séparément dans [issue #66](https://github.com/For-Hives/minemories/issues/66).
