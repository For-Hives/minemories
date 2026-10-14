# Diagnostics privés et consentis

L’aide au diagnostic reste facultative. Le mod n’envoie aucun rapport tant que l’utilisateur n’a pas activé cette option et appairé son installation. Les souvenirs et leur envoi fonctionnent sans cette option. Chaque API dispose de ses propres autorisations ; changer d’API ou d’appareil demande une nouvelle activation.

Dans Minecraft : **M → Mode avancé → Diagnostics**, puis **Diagnostics : OUI** après avoir lu les explications. Le réglage `diagnosticsConsent=false` par défaut est conservé dans `config/minemories.properties`. Son empreinte `diagnosticsIdentity` lie l’accord à l’API, l’appareil et le jeton : remplacer les identifiants dans ce fichier ne transfère pas l’accord à un autre compte. L’appairage, la déconnexion et le changement d’API retirent l’accord ; modifier seulement le dossier local le conserve. Le serveur doit confirmer un permis pour cette identité avant que le client commence à conserver des étapes ou assainir une exception.

Le client conserve au plus huit opérations avec huit étapes chacune, et une seule corrélation de dernière capture pour son envoi immédiat. Les autres fichiers reçoivent une nouvelle corrélation d’envoi. Ces informations restent en mémoire, sont vidées au retrait ou au changement d’identité, et ne deviennent jamais des métadonnées de souvenir. Aucun rapport n’est conservé sur disque, aucun retry de diagnostic n’est lancé et un seul rapport peut être en vol ; au plus cinq sont envoyés par heure. Les diagnostics peuvent donc manquer lors d’une panne réseau ou juste avant la confirmation de l’autorisation. Chaque tentative d’upload relit l’accord avant d’ajouter les headers de diagnostic.

Passer à **NON** arrête la collecte, annule les demandes en vol et demande une fois la révocation/effacement à l’ancienne API, sans transmettre de rapport. Les réponses tardives sont ignorées. Si cette API est inaccessible ou si le jeton est déjà révoqué, l’effacement immédiat ne peut pas être confirmé ; sa politique de rétention et le nettoyage des appareils révoqués s’appliquent. Une erreur de sauvegarde du retrait laisse les diagnostics désactivés en mémoire et affiche un avertissement : réparer les droits et enregistrer le retrait avant de redémarrer, car l’ancien réglage sur disque n’a pas pu être changé.

## Ce qui est conservé

Le rapport du mod contient un identifiant aléatoire, la date, les versions du mod/Minecraft/loader, l’étape capture/envoi/appairage, un identifiant de corrélation et une trace Java structurée limitée à douze frames. Huit étapes connues avec leur durée permettent de situer l’échec. Le serveur accepte seulement un contrat strict : classes des bibliothèques autorisées, identifiants Java, noms de fichiers `.java` sans dossier, lignes et versions bornées.

Les messages d’exception, URL, jetons, chemins locaux, noms de mondes/joueurs/serveurs, seeds, coordonnées et contenu des captures ne sont pas des champs du contrat. Les champs supplémentaires sont refusés. Le serveur ne reçoit ni le rapport complet du crash Minecraft ni un journal libre.

Un envoi accompagné du consentement et d’un permis courant peut également produire un diagnostic privé de l’erreur API. La trace conserve seulement les noms des fichiers source API reconnus, fonctions et lignes ; le message de l’exception et les chemins sont retirés. Hors consentement, le journal serveur indique uniquement un événement fixe et une corrélation aléatoire, sans objet d’erreur brut.

## Autorisation et retrait

- `POST /api/mod/diagnostics/consent`, Bearer d’un appareil appairé, corps strict `{ "enabled": true }`, renvoie `{ "permit": "UUID" }`. Chaque activation remplace le permis antérieur, avec cinq activations par minute au maximum.
- `POST /api/mod/diagnostics` exige ce Bearer, le header `X-Minemories-Diagnostics-Permit`, puis `{ "consent": true, "report": { ... } }` conforme au contrat partagé. Le corps est limité à 16 Kio, même sans `Content-Length`. Les rapports ne sont accessibles par aucun endpoint de lecture.
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

Ces plafonds bornent les données actives dans SQLite, pas la taille historique du fichier après suppression. L’exploitation doit garder les volumes, sauvegardes et journaux privés ; aucune route ne publie les diagnostics. Une sauvegarde ancienne garde ses anciennes données jusqu’à expiration selon la politique de sauvegarde de l’opérateur.

## Consultation réservée à l’opérateur

```sh
bun api:diagnostics --limit 100
bun api:diagnostics --reports --device <UUID> --limit 20
```

La commande ouvre une base SQLite existante en lecture seule via `DATABASE_PATH`. Elle ne crée aucune base, n’expose pas d’endpoint et ne purge rien. Les groupes sont des empreintes déterministes de la source, phase, classe d’exception et cinq premières frames ; les UUID de capture et les dates ne fragmentent pas les groupes. La sortie JSON détaillée reste privée : ne pas la publier automatiquement et ne jamais y ajouter les secrets d’environnement.

Le contrat du mod se trouve dans `packages/api-contract/src/diagnostics.ts`. Les tests exercent les vrais handlers HTTP, les refus de contenu libre, l’authentification/révocation, les permis périmés, les limites persistantes, la rétention, la suppression ciblée et la consultation en lecture seule. Le test en jeu du consentement/retrait complète ces preuves avant fusion du changement du mod.

## Validation en jeu

Le 14 octobre 2026, deux lancements Minecraft 1.21.1 / NeoForge 21.1.248 sur une copie isolée et une API HTTP loopback réelle ont exercé le parcours : NON par défaut, activation indisponible sans appairage, appairage conservant NON, upload normal sans diagnostic, puis panne de stockage ne produisant aucun rapport sans accord. Après activation explicite, l’API et le mod ont conservé quatre rapports techniques avec une corrélation commune et les versions réelles. La consultation privée vérifie les traces et étapes bornées, sans message libre, URL, chemin ou champ de monde/joueur.

L’accord persiste à la réouverture de l’écran, au changement du seul dossier local et après redémarrage. Le retrait arrête la collecte et efface les rapports et le permis de cet appareil dans la fixture. Un nouvel échec reste visible pour le joueur sans collecte ; l’upload fonctionne à nouveau lorsque le stockage est rétabli. Déconnexion et changement d’API retirent l’accord. Les écrans Diagnostics OUI/NON ont été inspectés à une taille GUI de 320 × 240. Ces preuves locales ne valident pas un déploiement de production ; ses accès, rétention et consultation restent à vérifier après redéploiement.
