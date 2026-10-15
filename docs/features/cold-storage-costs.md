# Coût et choix des classes froides

Vérification documentaire du 16 octobre 2026. Prix publics en USD hors taxes, remises et variations futures ; aucune dépense ni infrastructure créée. La région AWS ci-dessous est un exemple chiffré, pas la région supposée du déploiement.

## Politique retenue

Garage et filesystem gardent l’archivage désactivé. R2 utilise exclusivement `STANDARD_IA`, accessible immédiatement ; AWS accepte `STANDARD_IA`, Glacier Flexible Retrieval (`GLACIER`) ou Deep Archive (`DEEP_ARCHIVE`). Les uploads hot et les restaurations permanentes utilisent explicitement `STANDARD`, même si le bucket a une autre classe par défaut. L’inactivité de 90 jours est la valeur initiale, configurable entre 60 et 90 ; elle ne remplace pas la durée minimale facturée après transition.

Le worker gère les transitions lui-même. Ne pas ajouter de règle Lifecycle qui déplace ou expire ses objets, ses générations ou les miniatures. Garder le bucket privé, sans versioning AWS et sans rétention empêchant les suppressions. Une lecture partagée/public compte comme ouverture réelle ; une demande de restauration seule ne compte pas.

## R2

| Poste | Standard | Infrequent Access |
| --- | ---: | ---: |
| Stockage / GB-mois | 0,015 $ | 0,010 $ |
| Opérations A / million | 4,50 $ | 9,00 $ |
| Opérations B / million | 0,36 $ | 0,90 $ |
| Récupération / GB | 0 | 0,010 $ |
| Durée minimale | aucune | 30 jours |

Récupération facturée aussi lors d’une copie IA → Standard ; sortie Internet gratuite. A inclut les copies, B les HEAD. Les unités sont arrondies au supérieur : million d’opérations, GB-mois, GB récupéré. La franchise concerne uniquement Standard. Suppression gratuite, mais conservation minimale facturée même si l’objet disparaît avant terme. [Tarifs officiels R2](https://developers.cloudflare.com/r2/pricing/).

Exemple calculé : 1 000 GB pendant un mois économisent 5 $ de stockage brut. Un premier lot de copies IA peut coûter 9 $ avec l’arrondi ; une restauration de 100 GB ajoute 1 $ de récupération. Ainsi, IA ne garantit aucune économie pour une petite galerie. [Classes et accès R2](https://developers.cloudflare.com/r2/buckets/storage-classes/).

## AWS : exemple Paris eu-west-3

| Classe | Stockage / GB-mois | Copie entrante / 1 000 | Récupération Standard / GB | Requêtes de restauration / 1 000 |
| --- | ---: | ---: | ---: | ---: |
| Standard, premiers 50 TB | 0,024 $ | 0,0053 $ | — | — |
| Standard-IA | 0,0131 $ | 0,0100 $ | 0,0100 $ | — |
| Glacier Flexible Retrieval | 0,00405 $ | 0,0318 $ | 0,0105 $ | 0,0530 $ |
| Deep Archive | 0,0018 $ | 0,0600 $ | 0,0210 $ | 0,1060 $ |

Sources machine officielles : [catalogue S3 Paris](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/eu-west-3/index.json), publication `2026-10-15T17:35:40Z`, et [catalogue Deep Archive Paris](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3GlacierDeepArchive/current/eu-west-3/index.json), publication `2026-09-11T12:45:07Z`. Les taux de copie correspondent à `CopyObject`, ceux de restauration à la classe Standard utilisée par ce worker. HEAD/GET Standard : 0,00042 $/1 000 ; IA : 0,001 $/1 000.

IA facture au moins 128 KB et 30 jours ; Flexible au moins 90 jours ; Deep au moins 180 jours. Glacier ajoute 40 KB de métadonnées par objet, dont 8 KB au tarif Standard. Une suppression précoce n’annule pas le minimum. Compter aussi la copie restaurée temporaire, les HEAD répétés, le retour permanent en Standard et les éventuels transferts réseau ; les blocs dédupliqués ont chacun leurs frais. [Tarification AWS et minima](https://aws.amazon.com/s3/pricing/).

IA est immédiatement lisible. Le mode Standard de restauration dure typiquement 3–5 heures pour Flexible et 12 heures pour Deep, avant notre copie et notre polling. Ce sont des délais documentés, pas des mesures du déploiement. [Délais AWS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/restoring-objects-retrieval-options.html).

## Évaluer avant activation

Calculer par mois : stockage hot + cold + générations en nettoyage + minimums restants + copies + HEAD/GET + GB récupérés + requêtes RestoreObject + stockage temporaire + transferts. Utiliser le nombre d’objets physiques et de transitions, pas uniquement le nombre de souvenirs. Les réponses perdues/réessais et copies abandonnées ont aussi un coût ; notre collecte attend 24 h pour les générations incertaines.

Le plan d’éligibilité permet de chiffrer les octets et objets candidats sans lancer de copie. Choisir IA pour une réouverture interactive ; réserver les archives à délai long aux utilisateurs acceptant cette attente. Refaire le calcul dans la région et le compte retenus avant activation. L’intégration du vrai SDK est testée sur HTTP isolé et Garage réel pour le parcours existant ; aucune restauration sur compte AWS/R2 ni facture réelle n’est revendiquée. La mise en service relève de l’audit de production #66.
