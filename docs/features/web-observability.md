# Diagnostics web facultatifs

L’observabilité du site (#68) utilise le client officiel `@sentry/browser`, chargé à la demande. Ce dispositif est distinct du consentement des diagnostics Minecraft et n’active ni Umami, ni statistiques de navigation, ni relecture de session. Il ne mesure pas les visites et ne collecte pas les erreurs des captures.

## Activation et retrait

Sans `VITE_WEB_DIAGNOSTICS_DSN`, aucun SDK n’est chargé et aucun rapport n’est envoyé, même si une préférence ancienne subsiste. Le DSN public HTTPS est une configuration de compilation Vite ; un jeton d’administration Sentry ne doit jamais être utilisé. Aucun DSN réel n’est livré dans le dépôt.

Un DSN valide rend visible le choix facultatif sur `/privacy`, initialement décoché. Le consentement est stocké uniquement sur cet appareil sous `minemories-web-diagnostics-v1`. L’absence ou l’indisponibilité du stockage interdit la collecte. Le retrait prend effet immédiatement dans l’onglet et par événement `storage` dans les autres onglets ; les requêtes en cours sont annulées, aucun envoi différé n’est conservé. Effacer les données du site retire également le consentement.

Avant de configurer le DSN dans un déploiement, l’opérateur doit documenter le destinataire, la région et la rétention dans la politique de confidentialité, limiter les accès au projet et configurer les restrictions d’origine et quotas Sentry. Le collecteur voit nécessairement l’adresse IP et les en-têtes techniques de la connexion HTTP ; ne pas décrire ces rapports comme anonymes. Le socle livré reste désactivé et les coordonnées légales à compléter en #89 ne sont pas inventées.

## Données autorisées

La liste fermée `observability/policy.ts` autorise uniquement les routes éditoriales fixes : accueil, guides, versions, présentation, tarifs et pages légales. Aucune route inconnue, connexion, compte, galerie, viewer, capture publique, partage, modération ou diagnostic privé n’est instrumentée. Les paramètres de requête et fragments ne sont jamais consultés pour le rapport.

Seules trois catégories sont disponibles : `runtime` (erreur de script), `unhandled-promise` et `page-render` (frontière React). Chaque catégorie est envoyée au plus une fois par montage de page. Un rapport contient la catégorie, la route fixe, une empreinte de regroupement, un identifiant aléatoire d’événement et les métadonnées techniques constantes du SDK. Ces informations permettent d’identifier une page publique cassée sans lire l’exception. Les erreurs réseau d’ingestion sont absorbées, les doublons ne sont pas réessayés ; la limitation de débit du transport Sentry reste active.

La politique `dataCollection` désactive chaque collecte automatique, y compris l’inférence IP côté Sentry (`infer_ip: never`). Le client n’installe aucune intégration automatique : pas de breadcrumbs, session, replay, traçage ou instrumentation réseau. Aucun objet d’erreur, message, stack, capture, nom de fichier, chemin local, cookie, identifiant de compte, jeton, code d’appairage ou URL privée n’est passé au fournisseur. `beforeSend` reconstruit l’événement à partir de la liste fermée et retire même les données d’un éventuel scope Sentry ambiant. Le transport refuse aussi les envois après retrait ou changement de route, omet cookies et referrer, refuse les redirections et annule les requêtes au départ de la page.

## Validation

Les tests utilisent le véritable SDK avec un transport réseau intercepté : contenu exact de l’enveloppe, suppression d’un scope ambiant contenant e-mail/jeton/code, erreurs réseau, dédoublonnage et annulation. Les interactions vérifient l’absence de chargement sans configuration ou consentement, l’activation, le retrait, les changements entre onglets, les routes privées/inconnues, le départ pendant l’import différé et les préférences indisponibles. Aucun appel à un projet Sentry réel n’est nécessaire.

Références du fournisseur : [client isolé](https://docs.sentry.io/platforms/javascript/best-practices/shared-environments/), [filtrage](https://docs.sentry.io/platforms/javascript/configuration/filtering/), [enveloppes](https://develop.sentry.dev/sdk/foundations/envelopes/).
