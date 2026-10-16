# Langues du site et publication des URL

Le site propose les parcours français et anglais dans un même shell. `I18nProvider` sélectionne la langue et conserve uniquement cette préférence sur l’appareil. Les guides concept/fonctionnement/FAQ, les six étapes d’installation (tous les launchers), les légendes et textes alternatifs des captures tutoriel ont un catalogue anglais explicite dans `i18n/guide-messages.ts`. L’interface commune conserve ses clés sources et le catalogue français `messages.ts` ; les textes éditoriaux déjà appariés restent dans `content/`.

Le changement de langue est une présentation : les valeurs `windows`, `manuel`, `curseforge`, `autre`, numéros d’étape, identifiants de capture, dimensions Minecraft, commandes, noms de fichiers et chemins ne changent pas. Le prénom, la progression et les cases cochées du tutoriel sont conservés. Les textes de commandes restent copiables à l’identique.

## Erreurs et formats

`error-messages.ts` convertit les codes API/authentification connus et les erreurs fixes du moteur en clés affichables. Les détails serveur inconnus ne sont pas montrés : un message contextuel invite à réessayer. Les clés sont stockées dans les états, puis traduites au rendu, pour qu’une erreur déjà affichée change aussi de langue. Les erreurs métier de compte, administration et restauration déjà localisées conservent leurs messages spécifiques.

Les dates relatives utilisent `Intl.RelativeTimeFormat`. Les dates de publication, l’expiration d’appairage, les compteurs et séparateurs décimaux suivent la langue de l’interface ; les horodatages ISO et unités de protocole sont inchangés. Les tailles restent en unités binaires KiB/MiB/GiB ; les octets et limites de transfert ne changent pas. Les métadonnées titre/description/OpenGraph et les schémas `inLanguage` suivent le texte affiché.

Les guides ont également été actualisés : marge inférieure d’au moins cinq blocs sous la position visitée (dans les limites du monde), liste des loaders validés sur la page Versions, timelapse de captures datées, limites d’upload 450 MiB et appairage nécessaire à la galerie. La compatibilité de chaque modpack n’est pas promise.

## URL : état livré

Les URL publiques existantes restent les URL canoniques. Le serveur pré-rend le français ; l’anglais se sélectionne dans le navigateur et ne dispose pas encore d’URL distinctes publiées. Le choix local de langue ne crée donc aucun `hreflang`. Les routes privées, liens de partage, authentification, compte et administration restent sans canonical public, sans schéma public et en `noindex,nofollow`, quelle que soit la langue. L’indexation générale reste désactivée sauf activation explicite de `VITE_INDEXABLE`.

Pour publier les langues dans les moteurs de recherche, la convention retenue est : français sur les chemins existants (`/installation`), anglais sous `/en` (`/en/installation`, `/en` pour l’accueil). Les slugs de contenu et identifiants de protocole restent stables. Cette publication doit être atomique : route réelle, pré-rendu dans la langue indiquée par l’URL, liens internes localisés, canonical vers soi-même, sitemap et alternates réciproques `fr`/`en` (et `x-default` vers le français). Une préférence locale ne doit alors jamais remplacer la langue imposée par l’URL.

Aucun alternate ne doit être ajouté avant que les deux pages correspondantes existent réellement et soient entièrement traduites. Les notes de release GitHub restent des documents officiels dans leur langue d’origine, pas des traductions inventées ; leur interface est bilingue. Les textes juridiques déjà appariés demeurent provisoires jusqu’à finalisation de #89. Ce travail prépare la publication des langues sans prétendre avoir lancé des URL anglaises indexables.

## Validation

Les interactions parcourent les guides dans les deux langues, les six étapes pour les quatre launchers, les commandes inchangées et la conservation du prénom, du launcher et de la progression lors du changement de langue. Les tests couvrent toutes les unités de dates relatives, les séparateurs de tailles, les codes d’erreurs connus et le repli sûr, les métadonnées de chaque page publique et l’absence d’alternates fictifs. Les régressions galerie, appairage et viewer restent actives.
