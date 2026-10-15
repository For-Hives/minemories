# Activer l’observabilité distante du mod

Le fonctionnement et les champs transmis sont décrits dans [Diagnostics privés et consentis](consented-diagnostics.md). Le complément fonctionnel est suivi dans [#108](https://github.com/For-Hives/minemories/issues/108) ; le déploiement et ses preuves restent [#82](https://github.com/For-Hives/minemories/issues/82).

## Configuration API dans Coolify

Déployer d’abord l’API contenant le contrat `crash`, la migration des groupes et les routes oRPC opérateur, puis le web et le JAR. Le workflow de release reste indépendant du déploiement web. La nouvelle API accepte encore les rapports des anciennes versions du mod. Un nouveau mod conserve et réessaie les crashs refusés par une ancienne API dans les limites de sa file.

Variables runtime API :

```dotenv
DIAGNOSTICS_ENABLED=true
DIAGNOSTICS_OPERATOR_IDS=<identifiant Better Auth du compte opérateur>
DIAGNOSTICS_RETENTION_DAYS=14
DIAGNOSTICS_PER_HOUR=5
DIAGNOSTICS_MAX_PER_DEVICE=1000
DIAGNOSTICS_MAX_REPORTS=10000
```

`DIAGNOSTICS_OPERATOR_IDS` contient des IDs Better Auth, pas des adresses email ni des identifiants GitHub. Obtenir l’ID depuis une session connectée (`/api/auth/get-session`, champ `user.id`) ou la base privée existante. Configurer cette liste côté API, jamais dans une variable `VITE_` ou dans le dépôt. Une liste vide bloque la console. Redémarrer l’API après modification : la liste est lue au démarrage. La réception est activée par défaut mais ne collecte rien sans accord et appareil appairé.

Conserver `DATABASE_PATH` sur un volume privé persistant. Le compte système de l’API doit être propriétaire des fichiers SQLite, WAL/SHM et sauvegardes ; limiter l’accès aux opérateurs. Ne jamais placer la base ou une sortie de `bun api:diagnostics` dans le dossier web public. Les suppressions ne réduisent pas automatiquement le fichier SQLite ni les sauvegardes historiques : appliquer une durée de conservation aux sauvegardes également. Vérifier ces droits dans le conteneur de production avant d’ouvrir les essais.

Côté web : construire avec `VITE_API_URL` pointant vers l’API déployée et garder `VITE_INDEXABLE=false`. Appliquer `deploy/nginx.web.conf` mis à jour pour que `/admin/diagnostics` serve `app.html` avec `noindex`. Configurer les origines de session/CORS comme pour la galerie ; la console utilise la même session Better Auth, aucun nouveau secret d’administration à transmettre au navigateur.

## Essai de production avec un appareil de contrôle

1. Se connecter au site avec le compte opérateur. `/admin/diagnostics` doit s’ouvrir ; un compte ordinaire et un modérateur de galerie non autorisé doivent être refusés. Vérifier `Cache-Control: private, no-store` et `noindex`.
2. Appairer une installation de contrôle, puis ouvrir **M → Diagnostics**. Vérifier NON par défaut ; le propriétaire du profil active lui-même OUI après lecture. Ne jamais activer l’accord à la place de Mae ou d’un autre joueur.
3. Sur un profil de test sauvegardé, provoquer une erreur d’export maîtrisée (par exemple un dossier d’export qui ne peut pas être créé). Vérifier dans la console la phase capture, version du JAR, date, frames et corrélation. Un refus normal de sélection/zone n’est pas une exception technique.
4. Simuler une indisponibilité réseau puis rétablir l’accès ; la file doit rester bornée et le rapport arriver avec le même UUID. Un délai et les limites horaires peuvent différer la réception.
5. Sur un profil de contrôle jetable, exercer un vrai crash Java Minecraft, puis relancer. Vérifier la phase crash et les étapes disponibles. Un arrêt forcé du processus ne garantit aucune trace.
6. Passer une erreur en cours puis résolue ; provoquer une occurrence équivalente pour vérifier la réouverture. Actualiser avant modification lorsqu’une occurrence arrive pendant la consultation.
7. Retirer OUI dans le mod : file locale effacée, permis révoqué et rapports de cet appareil supprimés. Les groupes sans autre occurrence disparaissent. Déclencher ensuite un nouvel échec pour confirmer l’absence de collecte. Sans accès à l’API ou après révocation du jeton, l’effacement serveur immédiat ne peut pas être confirmé ; la rétention et le nettoyage des appareils révoqués prennent le relais.
8. Consigner révision API/web, version/empreinte du JAR, compte opérateur de contrôle, résultats et permissions des volumes/sauvegardes dans le suivi privé de déploiement. Fermer #82 seulement après ces preuves.

## Exploitation

Commencer par les groupes « À examiner », filtrer les crashs ou la version concernée, puis ouvrir une occurrence. La cause technique et les frames permettent de retrouver la release ; les messages libres, noms de mondes et journaux Minecraft complets sont volontairement absents. La dernière décision est conservée avec date et identifiant d’opérateur. Le nettoyage borne aussi les groupes et retire les appareils révoqués.

La CLI privée reste disponible dans le conteneur API :

```sh
bun api:diagnostics --limit 100
bun api:diagnostics --reports --device <UUID> --limit 20
```

Aucun accès Coolify ni compte opérateur de production n’est fourni par le code. Les essais Minecraft/API/web locaux documentés ne prouvent pas que la révision a été déployée. Garder cette distinction dans les annonces aux testeurs.
