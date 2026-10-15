# Diagnostics privés et consentis

L’aide au diagnostic reste facultative. Le mod n’envoie aucun rapport tant que l’utilisateur n’a pas activé cette option et appairé son installation. Les souvenirs et leur envoi fonctionnent sans cette option. Chaque API dispose de ses propres autorisations ; changer d’API ou d’appareil demande une nouvelle activation.

Dans Minecraft : **M → Diagnostics** (également disponible en mode avancé), puis **Diagnostics : OUI** après avoir lu les explications. Le réglage `diagnosticsConsent=false` par défaut est conservé dans `config/minemories.properties`. Son empreinte `diagnosticsIdentity` lie l’accord à l’API, l’appareil et le jeton : remplacer les identifiants dans ce fichier ne transfère pas l’accord à un autre compte. L’appairage, la déconnexion et le changement d’API retirent l’accord ; modifier seulement le dossier local le conserve. Le serveur doit confirmer un premier permis pour cette identité avant toute collecte. Cette autorisation confirmée est conservée avec la file assainie : à la relance, le même compte ayant toujours son accord peut conserver une erreur même si l’API est temporairement hors ligne. Tout envoi exige de nouveau un permis serveur courant. Chaque activation explicite crée un `diagnosticsEpoch` : une ancienne file ne peut pas revenir après un retrait suivi d’un nouvel accord.

Le client conserve au plus huit opérations avec huit étapes chacune, et une seule corrélation de dernière capture pour son envoi immédiat. Les autres fichiers reçoivent une nouvelle corrélation d’envoi. Les rapports assainis en attente sont conservés dans `config/minemories-diagnostics.properties`, sans URL, jeton ni journal brut : au plus huit rapports pendant sept jours, fichier borné à 128 Kio et permissions propriétaire lorsque le système les prend en charge. L’écriture utilise un fichier temporaire et un renommage atomique lorsque disponible. Une file modifiée est reconstruite champ par champ avant tout envoi ; les données libres et rapports invalides/expirés ne sont jamais retransmis.

Un seul rapport est en vol. Les réponses 200/201 retirent l’entrée ; un refus 401/403 arrête la collecte et purge la file. Les pannes et 5xx sont réessayés au rythme du battement d’une seconde du client, avec au moins trente secondes d’attente ; `Retry-After` est borné entre trente secondes et une heure. Le budget persistant limite les tentatives à cinq par heure. Le même UUID est conservé pour permettre l’idempotence serveur. Les réponses permanentes 400/409/413/422 retirent les rapports invalides ; exception de compatibilité : un rapport de crash refusé en 400 est conservé avec cinq minutes d’attente pour permettre le déploiement de la nouvelle API. Le premier accord jamais confirmé n’autorise aucune collecte hors ligne. Chaque tentative d’upload relit l’accord avant d’ajouter les headers de diagnostic.

Le mixin client intercepte l’entrée du vrai `Minecraft.crash` : il écrit une trace assainie dans la file avant de laisser Minecraft produire son rapport et quitter normalement. Le prochain lancement envoie cette entrée après confirmation du permis. La dernière opération active fournit la corrélation et les étapes lorsqu’un export est en cours ; les exceptions enveloppées sont ramenées à leur cause technique, sans lire leurs messages. Un processus tué de force, une panne native/JVM, un manque de mémoire empêchant toute allocation ou un crash avant le chargement du hook peuvent ne laisser aucune trace exploitable. Le mod ne lit ni ne transmet les fichiers complets `crash-reports/*.txt`.

Passer à **NON** arrête la collecte, efface la file locale, annule les demandes en vol et demande une fois la révocation/effacement à l’ancienne API, sans transmettre de rapport. Les réponses tardives sont ignorées. Si cette API est inaccessible ou si le jeton est déjà révoqué, l’effacement immédiat ne peut pas être confirmé ; sa politique de rétention et le nettoyage des appareils révoqués s’appliquent. Une erreur de sauvegarde du retrait laisse les diagnostics désactivés en mémoire et affiche un avertissement : réparer les droits et enregistrer le retrait avant de redémarrer, car l’ancien réglage sur disque n’a pas pu être changé.

## Ce qui est conservé

Le rapport du mod contient un identifiant aléatoire, la date, les versions du mod/Minecraft/loader, l’étape capture/envoi/appairage/crash, un identifiant de corrélation et une trace Java structurée limitée à douze frames. Huit étapes connues avec leur durée permettent de situer l’échec. Le serveur accepte seulement un contrat strict : classes des bibliothèques autorisées, identifiants Java, noms de fichiers `.java` sans dossier, lignes et versions bornées.

Les messages d’exception, URL, jetons, chemins locaux, noms de mondes/joueurs/serveurs, seeds, coordonnées et contenu des captures ne sont pas des champs du contrat. Les champs supplémentaires sont refusés. Le serveur ne reçoit ni le rapport complet du crash Minecraft ni un journal libre.

Un envoi accompagné du consentement et d’un permis courant peut également produire un diagnostic privé de l’erreur API. La trace conserve seulement les noms des fichiers source API reconnus, fonctions et lignes ; le message de l’exception et les chemins sont retirés. Hors consentement, le journal serveur indique uniquement un événement fixe et une corrélation aléatoire, sans objet d’erreur brut.

## Autorisation et retrait

- `POST /api/mod/diagnostics/consent`, Bearer d’un appareil appairé, corps strict `{ "enabled": true }`, renvoie `{ "permit": "UUID" }`. Chaque activation remplace le permis antérieur, avec cinq activations par minute au maximum.
- `POST /api/mod/diagnostics` exige ce Bearer, le header `X-Minemories-Diagnostics-Permit`, puis `{ "consent": true, "report": { ... } }` conforme au contrat partagé. Le corps est limité à 16 Kio, même sans `Content-Length`. Aucune lecture n’est autorisée avec le jeton du mod ; seule une session opérateur web explicitement autorisée peut consulter les rapports.
- Les envois consentis portent `X-Minemories-Diagnostics-Consent: true`, `X-Minemories-Diagnostics-Permit` et `X-Minemories-Correlation` (UUID). Ces valeurs ne sont pas des données libres du rapport. Un permis manquant, remplacé ou révoqué interdit toute conservation.
- `DELETE /api/mod/diagnostics` supprime les rapports de l’appareil et révoque son permis dans une transaction. Un rapport tardif avec l’ancien permis est rejeté, y compris après une nouvelle activation. La révocation d’un appareil interdit aussi ingestion/activation ; le nettoyage retire ses rapports et permis.

L’identité et le permis sont vérifiés à nouveau dans la transaction de conservation. Les reçus, refus et suppressions portent `Cache-Control: private, no-store`. Le retrait ne remet pas à zéro les limites d’envoi et d’activation.

## Limites et rétention

La rétention est calculée depuis la réception serveur. Le nettoyage se produit au démarrage, chaque heure et avant/après une ingestion ; aucun appel au stockage GLB n’est nécessaire. Les rapports anciens sont évincés dans un ordre déterministe lorsque le plafond est atteint.

| Variable | Défaut | Plage acceptée |
| --- | --- | --- |
| `DIAGNOSTICS_ENABLED` | `true` | `true` ou `false` (la réception exige toujours un consentement) |
| `DIAGNOSTICS_RETENTION_DAYS` | 14 | 1 à 90 jours |
| `DIAGNOSTICS_MAX_PER_DEVICE` | 1000 | 1 à 1000 rapports |
| `DIAGNOSTICS_MAX_REPORTS` | 10000 | 1 à 10000 rapports au total |
| `DIAGNOSTICS_PER_HOUR` | 5 | 1 à 20 rapports par appareil |

Le quota horaire utilise une fenêtre persistante d’une heure à partir du premier rapport. Un redémarrage ne réinitialise pas la fenêtre. Un renvoi identique du même UUID par le même appareil est idempotent et ne consomme pas de quota ; un contenu différent avec cet UUID est refusé. Les rapports antérieurs à 90 jours ou datés de plus de cinq minutes dans le futur sont refusés. Désactiver la réception n’empêche pas le retrait.

Ces plafonds bornent les données actives dans SQLite, pas la taille historique du fichier après suppression. L’exploitation doit garder les volumes, sauvegardes et journaux privés ; aucune route publique ne publie les diagnostics. Une sauvegarde ancienne garde ses anciennes données jusqu’à expiration selon la politique de sauvegarde de l’opérateur.

## Consultation réservée à l’opérateur

```sh
bun api:diagnostics --limit 100
bun api:diagnostics --reports --device <UUID> --limit 20
```

La commande ouvre une base SQLite existante en lecture seule via `DATABASE_PATH`. Elle ne crée aucune base et ne purge rien ; elle reste disponible en complément de la console privée. Les groupes sont des empreintes déterministes de la source, phase, classe d’exception et cinq premières frames ; les UUID de capture et les dates ne fragmentent pas les groupes. La sortie JSON détaillée reste privée : ne pas la publier automatiquement et ne jamais y ajouter les secrets d’environnement.

Le contrat du mod se trouve dans `packages/api-contract/src/diagnostics.ts`. Les tests exercent les vrais handlers HTTP, les refus de contenu libre, l’authentification/révocation, les permis périmés, les limites persistantes, la rétention, la suppression ciblée et la consultation en lecture seule. Le test en jeu du consentement/retrait complète ces preuves avant fusion du changement du mod.

## Console opérateur privée

La route `/admin/diagnostics` exige une session Better Auth et un identifiant utilisateur présent dans `DIAGNOSTICS_OPERATOR_IDS` (liste séparée par virgules). La liste vide refuse tout accès. Ce droit est distinct de `PUBLIC_MODERATOR_IDS` : modérer la galerie ne donne pas accès aux erreurs. Le lien apparaît dans le pied de page uniquement après confirmation du rôle ; la route reste chargée à la demande, hors pré-rendu/sitemap et sous `noindex`, y compris via Nginx et la preview Vite.

Le contrat oRPC `diagnostics` expose `access`, `list`, `detail` et `update`. L’API contrôle le rôle sur chaque lecture et modification, avec `Cache-Control: private, no-store`. La liste regroupe les occurrences par empreinte de source/phase/type/frames, affiche les versions réelles, les compteurs d’occurrences/appareils, dates et dernière trace. Filtres : statut, phase, source mod/API et version. Pages de 25 groupes et 20 occurrences. Les détails montrent les traces bornées, étapes, appareil et corrélation.

Les statuts sont `open` (à examiner), `in_progress`, `resolved` et `ignored`. Une occurrence nouvelle rouvre un groupe résolu ; les groupes ignorés restent ignorés. Les retransmissions idempotentes ne rouvrent rien. Chaque mise à jour exige la révision observée : une nouvelle occurrence ou décision concurrente renvoie CONFLICT et demande une actualisation. La dernière décision, sa date et l’opérateur sont persistés ; aucune issue ni notification externe n’est créée automatiquement. L’effacement d’un appareil et la rétention retirent aussi les groupes devenus vides. La migration initialise les groupes des rapports existants.

Voir [l’activation et la validation en production](remote-observability-operations.md), suivies séparément dans [#82](https://github.com/For-Hives/minemories/issues/82).

## Validation en jeu

Le 14 octobre 2026, deux lancements Minecraft 1.21.1 / NeoForge 21.1.248 sur une copie isolée et une API HTTP loopback réelle ont exercé le parcours : NON par défaut, activation indisponible sans appairage, appairage conservant NON, upload normal sans diagnostic, puis panne de stockage ne produisant aucun rapport sans accord. Après activation explicite, l’API et le mod ont conservé quatre rapports techniques avec une corrélation commune et les versions réelles. La consultation privée vérifie les traces et étapes bornées, sans message libre, URL, chemin ou champ de monde/joueur.

L’accord persiste à la réouverture de l’écran, au changement du seul dossier local et après redémarrage. Le retrait arrête la collecte et efface les rapports et le permis de cet appareil dans la fixture. Un nouvel échec reste visible pour le joueur sans collecte ; l’upload fonctionne à nouveau lorsque le stockage est rétabli. Déconnexion et changement d’API retirent l’accord. Les écrans Diagnostics OUI/NON ont été inspectés à une taille GUI de 320 × 240. Ces preuves locales ne valident pas un déploiement de production ; ses accès, rétention et consultation restent à vérifier après redéploiement.


Le 15 octobre 2026, le complément [#108](https://github.com/For-Hives/minemories/issues/108) a été exercé dans trois lancements Minecraft 1.21.1 / NeoForge 21.1.248, client de développement isolé avec API Hono/SQLite réelle en loopback. La fixture de contrôle active explicitement son propre accord, génère un échec technique de capture et appelle le vrai `Minecraft.crash`. Le hook conserve le rapport avant la fermeture ; le deuxième lancement l’envoie sans nouvel accord manuel. L’API contient alors un rapport capture et un rapport crash, avec versions réelles et sans les chaînes privées sentinelles injectées. L’échec de capture est injecté via l’opération instrumentée ; cette fixture n’exerce pas un nouvel export de monde complet.

Le troisième lancement retire l’accord et déclenche un nouvel échec contrôlé : la file locale, les rapports, le permis et les groupes orphelins sont effacés, sans nouvelle collecte. Les écrans simple (bouton Diagnostics), OUI et NON ont été capturés et inspectés à 854 × 480 pixels, GUI 427 × 240. Chromium sur le build web a consulté ces deux rapports avec une vraie session opérateur et sauvegardé un statut ; FR/EN, cinq largeurs de 390 à 1440 px, retour au login sans session et `noindex` ont été vérifiés. Ces preuves restent locales et ne valent pas validation du déploiement de production.
