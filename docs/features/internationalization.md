# Localisation du site — marchés Minecraft Java

Le sélecteur du site couvre les dix pays demandés, avec onze variantes linguistiques :

| Pays | Choix | Balise HTML / format régional |
| --- | --- | --- |
| États-Unis | English (US) | en-US |
| Russie | Русский | ru-RU |
| Allemagne | Deutsch | de-DE |
| Royaume-Uni | English (UK) | en-GB |
| France | Français (FR) | fr-FR |
| Corée du Sud | 한국어 | ko-KR |
| Brésil | Português (BR) | pt-BR |
| Pologne | Polski | pl-PL |
| Canada | English (CA), Français (CA) | en-CA, fr-CA |
| Japon | 日本語 | ja-JP |

Les identifiants historiques `en` et `fr` restent valables dans la préférence locale, pour préserver les choix déjà enregistrés. La préférence sauvegardée prime sur la liste ordonnée des langues du navigateur. Aucune géolocalisation ni déduction du pays à partir d’une adresse IP n’est utilisée. Les balises régionales alimentent le document HTML ; les dates, nombres, tailles et compteurs suivent Intl, avec les catégories de pluriels russes et polonaises.

## Catalogues et périmètre

Le site utilise un seul moteur : `translate(locale, key, values)` dans `i18n/catalog.ts`. Le hook `useI18n().t()` et le composant JSX `T` appellent ce même moteur. Les textes sont uniquement dans `i18n/locales/*.json` : `en.json` est la source canonique, `fr.json` et les six autres langues sont des catalogues complets. Les variantes régionales ne contiennent que leurs différences et héritent du catalogue de leur langue principale.

Les anciens couples `copy(fr, en)`, objets éditoriaux `{ fr, en }`, dictionnaires de guides inversés et tables de métadonnées séparées ont été supprimés. Les composants, contenus éditoriaux, guides, libellés de diagnostics, métadonnées, dates relatives immédiates et compteurs utilisent les mêmes clés. Les pluriels sont sélectionnés par `Intl.PluralRules`, puis résolus dans les catalogues ; les nombres sont formatés par `Intl.NumberFormat`.

Les identifiants d’API, chemins, noms de fichiers, commandes Minecraft et paramètres `{name}`, `{count}`, etc. gardent leur forme technique. Les contenus saisis par les utilisateurs restent littéraux. Les devises commerciales ne sont pas converties automatiquement lors d’un changement de langue.

Les nouveaux catalogues sont importés à la demande et fournis avec le site : aucun service de traduction n’est appelé par l’application. Pendant un chargement, la langue précédente reste active ; une erreur permet de réessayer. Une réponse tardive ne remplace pas un choix plus récent et une réponse après démontage ne modifie pas la préférence. Le rendu statique initial conserve les routes françaises existantes ; les métadonnées et le contenu sont actualisés après le choix du navigateur. Aucune URL de traduction ou balise hreflang ne désigne une page inexistante.

Les six nouveaux catalogues partent d’une prétraduction des textes publics avec Google Translate. Les termes principaux de navigation, compte, authentification, partage et viewer ont été revus ; les noms de produits, commandes et paramètres sont contrôlés automatiquement. Une relecture éditoriale par des locuteurs natifs reste utile pour les textes longs, notamment les guides et les pages légales.

## Maintenance et validation

Pour ajouter un message, choisir une clé stable dans `locales/en.json`, compléter tous les catalogues complets. Dans un composant, utiliser `t(key, values)` ou `T` ; dans les données éditoriales, stocker la clé seule et la traduire à l’affichage. Ne jamais recréer de couples de textes par langue dans les composants. Les variantes ne contiennent que leurs différences régionales.

Les tests contrôlent la parité des clés, les paramètres, les commandes et fichiers, les pluriels, le repli anglais et l’absence de l’ancien système dans les sources. Les tests d’interaction couvrent le vrai sélecteur, les préférences, les stockages bloqués, les chargements concurrents et leurs échecs, les guides et leurs étapes cochées, les métadonnées et les titres saisis par les propriétaires.

## Options du mod : langue de Minecraft

Le mod utilise exclusivement le système natif de Minecraft : `Component.translatable` pour les composants et `I18n.get` lorsque une API de dessin ou de champ exige une chaîne. Les ressources sont dans `assets/minemories/lang/` : anglais américain/britannique/canadien, français de France/du Canada, russe, allemand, coréen, portugais brésilien, polonais et japonais. Minecraft assure le repli vers `en_us` pour les langues ou clés absentes.

Il n’y a aucun sélecteur de langue propre au mod, aucune préférence de langue dans sa configuration, aucun appel au site pour choisir ou traduire les options. Changer la langue du site ne change pas celle des options en jeu. Les options simples/avancées, AFK, dossier local, API, diagnostic, monde distant et les écrans associés suivent la langue choisie dans Minecraft. Les messages techniques provenant des services et du moteur de capture ne sont pas retraduits à partir de leur texte libre.

Les tests Java vérifient les catalogues, les commandes et les chemins. Un même composant d’option est résolu successivement sous les onze langues injectées dans le moteur de Minecraft, afin de vérifier qu’il ne fige pas une traduction indépendante.

## Validation de la migration

Biome, typecheck et build web réussis ; 19 pages publiques pré-rendues. La suite avec couverture a exécuté 303 tests réussis et couvert les utilitaires à 100 % (lignes, branches, fonctions et instructions). Le worker de `temporal-files.test.ts` a expiré ; sa relance isolée a réussi ses quatre tests et terminé normalement. Les 54 fichiers, soit 307 tests, ont ainsi été vérifiés sans modifier les seuils de couverture ni l’isolation des tests.

Chromium a parcouru les onze choix en développement et en production à 390 × 844 : libellés traduits, balises régionales correctes et aucun débordement horizontal. Les imports JSON différés n’utilisent pas d’attribut de type JSON : Vite les sert comme modules JavaScript, que le navigateur refuserait avec cet attribut. Les imports statiques des catalogues de base gardent l’attribut nécessaire au chargement de la configuration par Node.

Le contrôle Gradle du module commun réussit : compilation, formatage, SpotBugs principal/tests et 176 tests Java, dont les deux tests de localisation. Le moteur natif est vérifié automatiquement sous les onze langues ; aucun essai visuel en jeu n’a été réalisé pour cette migration.
