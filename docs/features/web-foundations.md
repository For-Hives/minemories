# Structure et audit du web

## Organisation

- `app-context.tsx` conserve uniquement session, fichier local et notifications ; les pages ne dépendent plus de `App.tsx`.
- `components/SiteLayout.tsx` porte marque, navigation desktop/mobile, choix de langue, ouverture GLB, compte, footer et lien d’évitement. Les actions sont accessibles au clavier et la navigation mobile se ferme au changement de page.
- `components/ui.tsx` regroupe les boutons et titres de section ; `components/Loading.tsx` fournit des skeletons page, galerie, viewer et compte ainsi qu’un SVG orbital.
- `App.tsx` charge toutes les familles de pages à la demande, avec Suspense et reprise sur erreur de chargement. Le module Three.js n’est pas importé par les pages de contenu.
- `theme.css` porte couleurs, espacements, transitions à ressort, entrées, flottement SVG et shimmer. Toutes les animations respectent `prefers-reduced-motion`.

## Langues et contenus

Le shell, l’accueil, l’authentification et les libellés des fonctionnalités utilisent `i18n/I18n.tsx` (`useI18n`, `T`, `translate`). Les messages sources servent de clés ; `i18n/messages.ts` contient leurs traductions françaises. Un message absent reste lisible dans sa langue source. La préférence FR/EN reste dans le navigateur. `translate` accepte des variables nommées `{count}`, `{name}` ; les données utilisateur, chemins et identifiants d’état ne se traduisent pas.

Les guides détaillés existants restent en français et déclarent `lang="fr"`, y compris si le shell est en anglais. Les erreurs renvoyées par l’API/le moteur et certains textes de dates/métadonnées restent à migrer vers des clés stables. L’i18n est structurée, mais une traduction exhaustive de toutes les pages et des URL distinctes par langue n’est pas annoncée. Le contenu indexé par défaut est français ; aucun `hreflang` artificiel n’est émis pour des traductions incomplètes.

`content/site-content.ts` contient des objets typés `Localized`, articles, sections légales et plans. Ajouter un article ici suffit à alimenter sa page, le journal, le pré-rendu, le sitemap et son schéma Article. Ajouter un plan change la zone pricing sans modifier le layout. Les prix sont `null` tant qu’une offre n’est pas définie ; aucun checkout ni abonnement inventé. Les informations d’éditeur/hébergeur/contact doivent être complétées avant usage juridique/commercial.

Pour ajouter une nouvelle famille de pages : déclarer sa route dans `App.tsx`, ses métadonnées dans `route-metadata.ts` et son rendu dans `prerender.tsx`. Réutiliser `ContentLayout`, les blocs et les composants communs. Un changement de langue futur nécessite de compléter les catalogues et les contenus localisés, avec une stratégie d’URL dédiée si l’on veut indexer chaque traduction.

## Pré-rendu et crawl

`build-web.mjs` génère le client Vite, puis une entrée de rendu React temporaire dans `work/web-ssr`. `prerender-web.mjs` écrit onze pages publiques complètes (HTML, titres, description, canonical, Open Graph, JSON-LD), `sitemap.xml`, `robots.txt`, un shell privé `app.html` et une page 404. Le tutoriel contient un parcours manuel Windows complet dans `noscript`. Les pages s’hydratent dans le navigateur ; la progression sauvegardée est restaurée après l’hydratation.

Ni la galerie, ni le viewer local, ni les liens `/share/`, ni l’authentification ne figurent dans le sitemap. Ils utilisent `noindex,nofollow` et sont exclus dans robots.txt. Une capture partagée reste accessible à son destinataire, sans devenir une page marketing indexée. Aucun compte ni appel API authentifié n’est utilisé au pré-rendu.

Variables de build :

- `VITE_SITE_URL` : origine publique, défaut `https://minemories.xenos.lightin.io` ; configure-la pour un autre domaine.
- `VITE_INDEXABLE=false` : preview/dev sans indexation, conserve le HTML lisible, sitemap vide et robots Disallow.
- `VITE_API_URL` : origine API, déjà utilisée par Better Auth/oRPC.

## Serveur statique Coolify

Conserver Railpack, `railpack.web.json`, base `/` et publish directory `apps/web/dist`. **Aucun JDK ni Gradle dans le front.** Le pré-rendu utilise uniquement Node et React ; aucun serveur Node de production n’est nécessaire. Le JAR est récupéré depuis GitHub Releases dans le navigateur.

Le Nginx doit servir `$uri/index.html` pour les pages publiques, `/app.html` pour les routes privées et une vraie 404 pour les URL inconnues. `deploy/nginx.web.conf` est le template pour un conteneur statique avec racine `/usr/share/nginx/html` ; adapter la racine si le conteneur diffère. Reprendre ces locations dans la configuration Nginx personnalisée Coolify. L’aperçu Vite applique ces mêmes règles. La garde `data-route` empêche une erreur d’hydratation si un serveur ancien renvoie encore l’accueil en repli, mais ne remplace pas une configuration HTTP correcte.

## Audit par parcours

| Parcours | Travaux effectués | Suite spécifique |
| --- | --- | --- |
| Accueil et guides | Shell partagé, messages, illustration SVG animée, navigation et pré-rendu | Traduction complète des guides et revue éditoriale |
| Installation | Hydratation compatible avec la reprise locale, version sans JS, zones Windows préservées | Vraies captures, première release GitHub et essai Mae en jeu |
| Compte | Module différé, skeleton, formulaires et libellés localisés | Sessions de production et compte réel |
| Galerie | Module différé, skeleton en cartes, libellés et états d’appairage préservés | Extraction de polling et tests d’interaction restants du backlog |
| Viewer local/distant | Module Three.js différé, skeleton du cadre, libellés et présélections | Profilage shader ; aucune modification du moteur GLB |
| Partage | Module différé, téléchargement annulé à la sortie, état accessible et texte mobile sans débordement | Test de révocation/incident avec API de production |
| Journal | Données FR/EN, index et article, schema et sitemap automatiques | Articles éditoriaux supplémentaires, éventuel CMS |
| Tarifs/légal | Blocs extensibles, textes factuels et état expérimental | Offre validée, coordonnées juridiques et revue de publication |

Les comptes privés et les captures n’entrent jamais dans les artefacts de rendu public. La crawlabilité signifie que le HTML est accessible aux robots ; elle ne garantit pas l’indexation par un moteur.
