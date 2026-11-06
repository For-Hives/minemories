# Versions et nouveautés du mod

L’issue [#61](https://github.com/For-Hives/minemories/issues/61) ajoute deux pages publiques :

- `/versions` : historique des JAR compatibles, dernière publication mise en avant, version du mod, Minecraft, loader, date UTC localisée, statut préversion, taille et téléchargement direct.
- `/changelog` : mêmes publications, avec, pour chaque version, le lien vers le commit construit. Un lien `/changelog#v<version>` mène à la version visée.

Le tutoriel `/installation` et le pied de page donnent accès à cet historique. Pour mettre à jour ou revenir à une version précédente, fermer Minecraft et conserver un seul JAR Minemories dans le dossier `mods` du profil compatible.

## Source et compatibilité

`mod-releases.ts` partage la sélection avec le téléchargement du tutoriel. Le navigateur lit l'index public de l'API Minemories (`/downloads/index.json`, voir [le flux de release](automatic-releases.md)), sans token et sans construire Java au déploiement web. Aucun changelog n'est rédigé ou inventé côté site : l'index suit les versions stockées, donc la page reflète la dernière release du VPS à sa prochaine ouverture.

L'index contient, par cible (Minecraft x loader), les **3 versions les plus récentes** (rétention du stockage). Chaque version indique date de build, commit, taille, SHA-256 et lien de téléchargement `/downloads/<cible>/<version>`. Les versions plus anciennes ne sont plus téléchargeables : le site ne les propose pas. Le badge « dernière version » indique une publication récente, sans promettre de validation en jeu du JAR exact.

## États et intégrité

- Squelette pendant le chargement, état vide distinct d'une panne.
- Erreur réseau ou réponse invalide : message et nouvelle tentative ; lien vers `index.json` sans JavaScript.
- Délai de 15 secondes, annulation au démontage et rejet des réponses tardives.
- SHA-256 de l'index affiché avec chaque téléchargement ; l'affichage d'une empreinte ne prétend pas vérifier automatiquement le fichier local.
- Le lien vers le commit de la version pointe vers le dépôt public.

## Accessibilité et langues

Pages chargées à la demande, titres hiérarchisés, dates `<time>`, ancres par version, téléchargements nommés avec leur version,. Interface FR/EN et formats de dates/tailles localisés . Les animations SVG, boutons et squelettes reprennent les composants du site et leur préférence de réduction des mouvements.

Les deux routes sont pré-rendues avec titres, navigation et accès à `index.json` sans JavaScript. L’historique actualisé est chargé côté navigateur : aucun accès réseau requis pendant le build. La politique de pré-lancement reste `noindex,nofollow`, `robots.txt` interdit et sitemap vide par défaut ; Railpack force toujours `VITE_INDEXABLE=false`.

## Validation

Les tests d’interaction couvrent tri, compatibilité, téléchargements/empreintes, lien vers le commit, index vide ou invalide, panne/reprise, délai et réponse obsolète, FR/EN. Les tests de pré-rendu et de métadonnées couvrent les nouvelles routes et le maintien de `noindex`. Aucun changement de comportement du mod ni du format GLB.

Vérification du 15 octobre 2026 : Chromium sur le build de production, largeurs 1440/390/650/800/1024 px, trois releases publiques réelles, ancre de l’ancienne beta, changement FR/EN, mouvements réduits, lien depuis le tutoriel et erreur HTTP 429 simulée puis reprise sur les données publiques. Dans l’environnement cloud, les réponses GitHub du navigateur sont acheminées par `curl` avec le proxy hérité ; aucun token ni jeu de données inventé. Aucun débordement horizontal ou erreur JavaScript observé. Téléchargement réel du JAR `0.2.1-beta.1` : 300 220 octets, SHA-256 `113ddeb9956a15b871e4f5eb6536dfe71765b3e3bf493c69e02ced6f99c3eb3d`, identique au digest GitHub. Les routes de preview répondent 200 avec `X-Robots-Tag: noindex,nofollow` et `robots.txt` garde `Disallow: /`.
