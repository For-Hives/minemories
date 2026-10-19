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

`i18n/source-messages.json` contient les 1 184 messages sources. Les catalogues russe, allemand, coréen, portugais brésilien, polonais et japonais contiennent chacun toutes ces clés. Les variantes anglaises et canadienne française héritent de leur langue principale, avec des adaptations comme favourites/colours et courriel. Le français et l’anglais existants restent disponibles immédiatement.

Les messages communs, la copie éditoriale, les tableaux d’options, les contenus du journal, les pages publiques, les réglages du compte, le partage et les métadonnées passent par la même résolution. Les identifiants d’API, chemins, noms de fichiers, commandes Minecraft et paramètres `{name}`, `{count}`, etc. gardent leur forme technique. Les devises commerciales ne sont pas converties automatiquement lors d’un changement de langue.

Les nouveaux catalogues sont importés à la demande et fournis avec le site : aucun service de traduction n’est appelé par l’application. Pendant un chargement, la langue précédente reste active ; une erreur permet de réessayer. Une réponse tardive ne remplace pas un choix plus récent et une réponse après démontage ne modifie pas la préférence. Le rendu statique initial conserve les routes françaises existantes ; les métadonnées et le contenu sont actualisés après le choix du navigateur. Aucune URL de traduction ou balise hreflang ne désigne une page inexistante.

Les six nouveaux catalogues partent d’une prétraduction des textes publics avec Google Translate. Les termes principaux de navigation, compte, authentification, partage et viewer ont été revus ; les noms de produits, commandes et paramètres sont contrôlés automatiquement. Une relecture éditoriale par des locuteurs natifs reste utile pour les textes longs, notamment les guides et les pages légales.

## Maintenance et validation

Pour ajouter un message, conserver une clé anglaise stable, compléter le français et les six catalogues complets, puis mettre à jour `source-messages.json`. Les préférences des utilisateurs et les valeurs de protocole ne doivent pas devenir des clés à traduire. Les variantes ne contiennent que leurs différences régionales. Les noms techniques et les paramètres sont vérifiés par `catalogs.test.ts`, ainsi que la parité des clés, les compteurs et le repli lisible. Les tests d’interaction exercent le vrai sélecteur, la restauration d’une préférence, la détection du navigateur, les stockages bloqués, les réponses concurrentes et les échecs de chargement.

Validation locale : 308 tests web réussis sur 54 fichiers ; couverture des utilitaires à 100 % (lignes, branches, fonctions, instructions). Exécution avec deux workers et un délai de test de 120 secondes adapté à cette machine ; les attentes d’import asynchrone des catalogues disposent de 10 secondes. Les seuils de couverture du dépôt restent inchangés. Typecheck web et build de production réussis, avec pré-rendu des 19 pages publiques.

Chromium a exercé les onze choix sur le serveur de développement et sur le build de production : changement de texte, balises de langue, courriel canadien et restauration après rechargement. Contrôle mobile à 390 × 844 en japonais, coréen, allemand, russe et portugais brésilien : aucun débordement horizontal ni erreur JavaScript. Les titres de captures choisis par leur propriétaire sont conservés littéralement, même lorsqu’ils correspondent à un libellé de l’interface.

Après la dernière revue des libellés (FAQ, diagnostics, unités de stockage), 53 tests ciblés supplémentaires passent, ainsi que le typecheck et le build web relancés. Les vérifications du sélecteur et des catalogues sont incluses dans cette relance.
