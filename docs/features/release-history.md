# Versions et nouveautés du mod

L’issue [#61](https://github.com/For-Hives/minemories/issues/61) ajoute deux pages publiques :

- `/versions` : historique des JAR compatibles, dernière publication mise en avant, version du mod, Minecraft, loader, date UTC localisée, statut préversion, taille et téléchargement direct.
- `/changelog` : mêmes publications, avec les notes officielles de GitHub Releases. La dernière est ouverte ; un lien `/changelog#v<version>` ouvre les notes de la version visée lorsqu’elle est chargée.

Le tutoriel `/installation` et le pied de page donnent accès à cet historique. Pour mettre à jour ou revenir à une version précédente, fermer Minecraft et conserver un seul JAR Minemories dans le dossier `mods` du profil compatible.

## Source et compatibilité

`mod-releases.ts` partage la sélection avec le téléchargement du tutoriel. Le navigateur consulte l’API publique GitHub du dépôt `For-Hives/minemories`, sans token, sans passer par l’API Minemories et sans construire Java au déploiement web. Aucun changelog n’est rédigé ou inventé côté site : la publication d’une release suffit à alimenter les pages à leur prochaine ouverture.

Seuls les tags `mod-v<version>`, publiés et non brouillons, possédant le JAR `minemories-neoforge-mc1.21.1.jar` avec son URL exacte dans ce dépôt sont retenus. Les autres loaders restent exclus jusqu’à leur prise en charge explicite. La compatibilité présentée est Minecraft Java 1.21.1 / NeoForge 21.1.248 / Java 21. Le badge « dernière version » indique une publication récente, sans promettre de validation en jeu du JAR exact.

L’API est parcourue par pages de 30 publications, chargées explicitement par « Charger les versions précédentes ». Chaque page est filtrée, les résultats sont dédupliqués par version et triés par date de publication. Le tutoriel choisit toujours la dernière release compatible dans la première page, comme auparavant. Une ancre visant une version au-delà des pages chargées nécessite de charger ces pages ou d’utiliser GitHub.

## États et intégrité

- Squelette pendant le chargement, état vide distinct d’une panne.
- Erreur réseau, refus/limitation GitHub ou réponse invalide : message et nouvelle tentative ; lien GitHub toujours disponible.
- Délai de 15 secondes, annulation au démontage et rejet des réponses tardives ; une panne de pagination conserve les téléchargements déjà affichés et réessaie la même page.
- SHA-256 GitHub et fichier `.sha256` seulement lorsqu’ils existent ; sinon absence explicite, sans bloquer le JAR ni inventer d’empreinte. L’affichage d’une empreinte ne prétend pas vérifier automatiquement le fichier local.
- Notes rendues avec `react-markdown` : HTML ignoré, protocoles dangereux filtrés par défaut, images remplacées par leur texte alternatif pour éviter des requêtes externes dans les notes. La version originale reste liée sur GitHub.

## Accessibilité et langues

Pages chargées à la demande, titres hiérarchisés, dates `<time>`, ancres par version, téléchargements nommés avec leur version, volets `<details>` utilisables au clavier. Interface FR/EN et formats de dates/tailles localisés ; les notes restent dans leur langue d’origine. Les animations SVG, boutons et squelettes reprennent les composants du site et leur préférence de réduction des mouvements.

Les deux routes sont pré-rendues avec titres, navigation et accès GitHub sans JavaScript. L’historique actualisé est chargé côté navigateur : aucun accès réseau requis pendant le build. La politique de pré-lancement reste `noindex,nofollow`, `robots.txt` interdit et sitemap vide par défaut ; Railpack force toujours `VITE_INDEXABLE=false`.

## Validation

Les tests d’interaction couvrent tri, compatibilité, téléchargements/empreintes, liens vers les notes, notes absentes ou hostiles, pagination et déduplication, panne/reprise, délai et réponse obsolète, FR/EN. Les tests de pré-rendu et de métadonnées couvrent les nouvelles routes et le maintien de `noindex`. Aucun changement de comportement du mod ni du format GLB.

Vérification du 15 octobre 2026 : Chromium sur le build de production, largeurs 1440/390/650/800/1024 px, trois releases publiques réelles, ancre de l’ancienne beta, changement FR/EN, mouvements réduits, lien depuis le tutoriel et erreur HTTP 429 simulée puis reprise sur les données publiques. Dans l’environnement cloud, les réponses GitHub du navigateur sont acheminées par `curl` avec le proxy hérité ; aucun token ni jeu de données inventé. Aucun débordement horizontal ou erreur JavaScript observé. Téléchargement réel du JAR `0.2.1-beta.1` : 300 220 octets, SHA-256 `113ddeb9956a15b871e4f5eb6536dfe71765b3e3bf493c69e02ced6f99c3eb3d`, identique au digest GitHub. Les routes de preview répondent 200 avec `X-Robots-Tag: noindex,nofollow` et `robots.txt` garde `Disallow: /`.
