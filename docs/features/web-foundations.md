# Structure et audit du web

## Organisation

- `app-context.tsx` conserve uniquement session, fichier local et notifications ; les pages ne dépendent plus de `App.tsx`.
- `components/SiteLayout.tsx` porte marque, navigation desktop/mobile, choix de langue, ouverture GLB, compte, footer et lien d’évitement. Les actions sont accessibles au clavier et la navigation mobile se ferme au changement de page.
- `components/ui.tsx` regroupe les boutons et titres de section ; `components/Loading.tsx` fournit des skeletons page, galerie, viewer et compte ainsi qu’un SVG orbital.
- `App.tsx` charge toutes les familles de pages à la demande, avec Suspense et reprise sur erreur de chargement. Le module Three.js n’est pas importé par les pages de contenu.
- `theme.css` porte couleurs, espacements, transitions à ressort, entrées, flottement SVG et shimmer. Toutes les animations respectent `prefers-reduced-motion`.

## Langues et contenus

Le shell, l’accueil, l’authentification et les libellés des fonctionnalités utilisent `i18n/I18n.tsx` (`useI18n`, `T`, `translate`). Les messages sources servent de clés ; `i18n/messages.ts` contient leurs traductions françaises. Un message absent reste lisible dans sa langue source. La préférence FR/EN reste dans le navigateur. `translate` accepte des variables nommées `{count}`, `{name}` ; les données utilisateur, chemins et identifiants d’état ne se traduisent pas.

Les guides détaillés existants restent en français et déclarent `lang="fr"`, y compris si le shell est en anglais. Les erreurs renvoyées par l’API/le moteur et certains textes de dates/métadonnées restent à migrer vers des clés stables. L’i18n est structurée, mais une traduction exhaustive de toutes les pages et des URL distinctes par langue n’est pas annoncée. Le contenu pré-rendu est français et l’indexation est bloquée par défaut ; aucun `hreflang` artificiel n’est émis pour des traductions incomplètes.

`content/site-content.ts` contient les articles et sections légales typés `Localized`. Ajouter un article alimente sa page, le journal, le pré-rendu et son schéma Article. `content/discovery.ts` centralise les quatre angles éditoriaux FR/EN et les exemples de la galerie. `useLocalizedCopy` sélectionne les paires de textes éditoriaux ; le catalogue de messages partagé reste utilisé pour l’interface commune.

`content/pricing.ts` porte les montants en centimes et les règles testées : 2 € par snapshot, cloud 6 / 5 / 4 / 3 €/an puis plancher à 3 €, par snapshot conservée. Ce périmètre est une hypothèse explicite en attente de confirmation métier. Les tarifs fournis le 14 octobre 2026 prennent priorité sur l’ancienne vision de facturation par serveur dans BESOIN.md. La projection suppose des captures de même ancienneté et une conservation continue ; elle sépare création et renouvellements. Aucun paiement n’est activé. L’éditeur/hébergeur/contact, les taxes, le quota, les conditions de conservation et le prestataire de paiement restent à finaliser.

Pour ajouter une nouvelle famille de pages : déclarer sa route dans `App.tsx`, ses métadonnées dans `route-metadata.ts` et son rendu dans `prerender.tsx`. Réutiliser `ContentLayout`, les blocs et les composants communs. Un changement de langue futur nécessite de compléter les catalogues et les contenus localisés, avec une stratégie d’URL dédiée si l’on veut indexer chaque traduction.

## Pré-rendu et crawl

`build-web.mjs` génère le client Vite, puis une entrée de rendu React temporaire dans `work/web-ssr`. `prerender-web.mjs` écrit dix-sept pages publiques complètes (HTML, titres, description, canonical, Open Graph, JSON-LD), `sitemap.xml`, `robots.txt`, un shell privé `app.html` et une page 404. Le tutoriel contient un parcours manuel Windows complet dans `noscript`. Les pages s’hydratent dans le navigateur ; la progression sauvegardée est restaurée après l’hydratation.

Ni la galerie, ni le viewer local, ni les liens `/share/`, ni l’authentification ne figurent dans le sitemap. Ils utilisent `noindex,nofollow` et sont exclus dans robots.txt. Une capture partagée reste accessible à son destinataire, sans devenir une page marketing indexée. Aucun compte ni appel API authentifié n’est utilisé au pré-rendu.

Variables de build :

- `VITE_SITE_URL` : origine publique, défaut `https://minemories.xenos.lightin.io` ; configure-la pour un autre domaine.
- `VITE_INDEXABLE` : seules les valeurs exactement `true` autorisent l’indexation dans le build. Par défaut, y compris variable absente : `noindex,nofollow` partout, sitemap vide et `robots.txt` avec `Disallow: /`. Le HTML source et les changements de route client restent aussi en noindex. La commande de `railpack.web.json` force aussi `false` pour neutraliser une ancienne variable Coolify à `true`.
- `VITE_API_URL` : origine API, déjà utilisée par Better Auth/oRPC.

## Serveur statique Coolify

Conserver Railpack, `railpack.web.json`, base `/` et publish directory `apps/web/dist`. **Aucun JDK ni Gradle dans le front.** Le pré-rendu utilise uniquement Node et React ; aucun serveur Node de production n’est nécessaire. Le JAR est récupéré depuis GitHub Releases dans le navigateur.

Le Nginx doit servir `$uri/index.html` pour les pages publiques, `/app.html` pour les routes privées et une vraie 404 pour les URL inconnues. `deploy/nginx.web.conf` est le template pour un conteneur statique avec racine `/usr/share/nginx/html` ; adapter la racine si le conteneur diffère. Reprendre ces locations dans la configuration Nginx personnalisée Coolify. Le template ajoute actuellement `X-Robots-Tag: noindex,nofollow` sur toutes les réponses, erreurs comprises. L’aperçu Vite lit la politique dans le HTML construit et émet le même blocage pour les pages non indexables. Pour une future ouverture, retirer le verrou `VITE_INDEXABLE=false` de la commande Railpack, reconstruire volontairement avec `VITE_INDEXABLE=true` **et** retirer l’en-tête global du serveur, en conservant celui des pages privées et des 404. La garde `data-route` empêche une erreur d’hydratation si un serveur ancien renvoie encore l’accueil en repli, mais ne remplace pas une configuration HTTP correcte.

## Audit par parcours

| Parcours | Travaux effectués | Suite spécifique |
| --- | --- | --- |
| Accueil et guides | Shell partagé, messages, illustration SVG animée, navigation et pré-rendu | Traduction complète des guides et revue éditoriale |
| Installation | Hydratation compatible avec la reprise locale, version sans JS, zones Windows préservées | Vraies captures, première release GitHub et essai Mae en jeu |
| Compte | Module différé, skeleton, formulaires et libellés localisés | Sessions de production et compte réel |
| Galerie | Module différé, skeleton en cartes, libellés et états d’appairage préservés | États et polling extraits, interactions et annulations couvertes (#59, #77) |
| Viewer local/distant | Module Three.js différé, skeleton du cadre, libellés et présélections | Profilage shader ; aucune modification du moteur GLB |
| Partage | Module différé, téléchargement annulé à la sortie, état accessible et texte mobile sans débordement | Test de révocation/incident avec API de production |
| Journal | Données FR/EN, index et article, schema et sitemap automatiques | Articles éditoriaux supplémentaires, éventuel CMS |
| Découverte | Quatre pages FR/EN, hub `/decouvrir`, navigation depuis l’accueil | Choisir une licence ; finaliser les messages avant lancement |
| Galerie/classement démo | `/explorer`, recherche, thèmes, tri, favoris, votes locaux et aperçu par URL | Publication volontaire, modération et votes réels côté API |
| Tarifs/légal | Tarifs fournis, simulateur, estimation locale et textes factuels | Paiement Polar, taxes, quota, contrat de conservation et coordonnées juridiques |

Les comptes privés et les captures n’entrent jamais dans les artefacts de rendu public. La crawlabilité signifie que le HTML est accessible aux robots ; elle ne garantit pas l’indexation par un moteur.


## Démonstrations et préférences

`/open-source`, `/nostalgie`, `/partager` et `/classement` présentent des usages différents avec des CTA vers le tutoriel, GitHub et la vraie galerie privée. `/nostalgie` permet de faire évoluer une illustration SVG par curseur ; ce n’est pas un timelapse réel. Les images de la démo sont des illustrations, sans import de captures privées ni de moteur Three.js. Le dépôt public n’a pas encore de licence de redistribution : la page distingue cette réalité de l’ambition open source.

`/explorer?souvenir=premiere-maison` ouvre un aperçu d’exemple. Son lien peut être copié ; si le presse-papiers est bloqué, un champ sélectionnable permet la copie manuelle. Recherche, filtres, favoris et votes réversibles fonctionnent sur l’appareil. Les scores initiaux sont des exemples explicitement identifiés. Les préférences `minemories-demo-v1` sont validées au chargement et effaçables avec « Réinitialiser la démo ». Elles ne sont jamais envoyées à l’API.

Le simulateur `/pricing` accepte 1–100 snapshots et 1–10 ans ; un champ invalide empêche l’enregistrement. « Garder cette estimation » écrit uniquement `minemories-quote-v1`, relu après hydratation et ignoré s’il est invalide. Une restriction du stockage navigateur ne bloque pas le parcours. Le mod actuel exporte un souvenir GLB de zone : les sauvegardes Minecraft complètes et leur archive commerciale ne sont pas annoncées comme déjà fonctionnelles.

## Régressions de la galerie et du viewer distant

Les interactions de `gallery-lifecycle.test.tsx` couvrent le cycle capture → corbeille → restauration → effacement confirmé, le refus de la confirmation, les pannes et reprises, les renommages de capture et de zone, ainsi que la création, copie, rotation et révocation d’un lien. Les noms de zones restent locaux ; un renommage annulé ne déclenche aucune mutation serveur.

Une réponse de liste ancienne ne peut plus remplacer une actualisation récente. Les réponses de partage, renommage et corbeille arrivant après la fermeture de leur composant ne produisent plus de notification sur la page suivante ni de rafraîchissement inutile. Les tests du viewer vérifient le signal d’annulation, la destruction de la scène et le rejet d’un ancien téléchargement lors du passage à une autre capture. Les tests des liens publics/partagés complètent ce parcours avec l’ouverture et les accès révoqués. Ces tests utilisent les vrais composants avec une API simulée ; ils ne remplacent pas une validation de déploiement ou un profilage GPU.

La coordination de la galerie est séparée en `gallery-data.ts` (listes, quota, actions et actualisation), `gallery-pairing.ts` (création et vérification du code) et `GalleryPairingCard.tsx` (présentation). Le polling de la galerie reprend douze secondes après la fin du cycle précédent : une réponse lente n’empile pas les requêtes automatiques. Une actualisation manuelle reste disponible et conserve la protection contre les réponses anciennes. Les vérifications d’appairage gardent leurs délais de 1,1 puis 1,6 seconde et sont interrompues au départ de la page, y compris si la création du code est encore en cours. Les dossiers restent ouverts après un aller-retour par la corbeille. Les deux exceptions de complexité historiques de `GalleryPage` ont été retirées après ajout des interactions.
