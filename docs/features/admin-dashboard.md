# Administration du service

Le tableau de bord `/admin` présente les sections ouvertes au compte (comptes et rôles, modération, diagnostics) ; le panneau des comptes et des chiffres vit sous `/admin/users`. Il est accessible depuis « Mon compte » après vérification des droits par le serveur. Il propose les volumes finalisés en Go décimaux par heure, les inscriptions, des périodes de 24 heures, 7 jours et 30 jours, une recherche paginée des comptes avec filtre de rôle, les compteurs de stockage et d’activité, et les 50 derniers changements de rôle. Les heures sont regroupées en UTC. Les droits administrateur ne donnent aucun accès supplémentaire aux fichiers privés.

## Premier administrateur

Sur le serveur de l’API, avec sa base et son environnement réels, exécuter :

```sh
bun api:admin --email adresse-du-compte-existant@example.com
```

`DATABASE_PATH` doit désigner la base existante. La commande refuse une base absente et un compte inconnu ; elle ne crée ni compte ni mot de passe. Elle est idempotente et journalise la première attribution. À la demande du propriétaire, un bootstrap temporaire contient son adresse côté serveur (TODO #125). Au démarrage, il promeut le compte existant une seule fois et conserve une marque persistante : aucune création de compte, aucun hook d’inscription et aucune réattribution après rétrogradation ou recréation du compte. Si le compte est absent, il ne crée rien ; un redémarrage ultérieur pourra initialiser le compte une fois créé. Cette exception temporaire doit être retirée après confirmation de l’accès opérateur. Sur un serveur sans shell, `ADMIN_BOOTSTRAP_USER_IDS` (identifiants de comptes séparés par des virgules, les mêmes que `DIAGNOSTICS_OPERATOR_IDS`) promeut chaque compte existant une seule fois au démarrage de l’API ; l’identifiant est mémorisé, donc une rétrogradation n’est jamais annulée par un redémarrage, et un compte pas encore créé reste en attente. L’identifiant, contrairement à l’adresse, ne peut pas être réclamé par quelqu’un d’autre. Cette commande locale n’est pas exposée sur HTTP. Lancer cette commande sur une base de test ne modifie pas les droits du site déployé.

## Liste des utilisateurs et stockage

`/admin/users` liste tous les comptes (25 par page, recherche par nom, e-mail ou identifiant, filtre de rôle). Le tri (`sort` : `registered_desc` par défaut, `registered_asc`, `storage_desc`, `storage_asc`) est optionnel dans le contrat : un ancien client qui ne l'envoie pas obtient l'ordre historique, et les champs ajoutés en sortie ne cassent pas les lecteurs existants.

Pour chaque compte, la procédure ne renvoie que des métadonnées : identifiant, nom, e-mail, rôle, date d'inscription, nombre de captures et d'appareils, et trois octets : `usedBytes` (ce qui compte contre le quota), `reservedBytes` (envois non terminés ou abandonnés) et `pendingDeletionBytes` (objets en attente de suppression), plus `storedBytes` (captures seules, corbeille comprise). Jamais de contenu, de nom de fichier, de clé d'objet, de lien privé ni de jeton. La réponse expose aussi `quotaBytes` (`ACCOUNT_STORAGE_BYTES`, 2 Gio par défaut) et `overview` : nombre de comptes, octets utilisés au total et comptes à 90 % du quota ou plus, calculés sur tous les comptes quels que soient le filtre et la page.

L'utilisation vient de `ACCOUNT_USAGE_SQL` (`apps/api/src/storage-quota.ts`), la même règle que `accountStorageSummary` et le contrôle de quota à l'envoi : captures + réservations d'envoi + suppressions en attente. Une seule requête agrégée (`GROUP BY user_id`) est jointe à la page, sans boucle par compte ; le tri sur l'espace utilisé s'appuie sur cette même jointure. L'ordre d'un tri est choisi dans une table fixe de clauses, rien n'est interpolé depuis la requête.

L'interface affiche, par compte, une barre de progression (`role="progressbar"`, `aria-valuenow`, `aria-valuetext` complet), le texte « utilisé / quota », le pourcentage, le nombre exact d'octets, une étiquette « Proche du quota » (≥ 90 %) ou « Quota atteint », et le détail réservé/en suppression quand il est non nul : la couleur n'est jamais le seul signal. Les tailles sont en unités décimales (ko, Mo, Go) écrites par `Intl.NumberFormat` selon la langue (`src/lib/bytes.ts`) ; l'affichage de 2 Gio vaut donc environ 2,15 Go. Sur téléphone, le tableau devient une liste de cartes. La promotion et la rétrogradation gardent leur flux (mot de passe, audit, dernier administrateur protégé) ; la boîte de dialogue nomme le compte visé et la liste, les chiffres et le journal sont rechargés après succès. Aucune suppression de compte, aucun changement de quota ni aucune usurpation d'identité n'est offert.

## Permissions

Les rôles sont conservés en SQLite et relus à chaque requête : une rétrogradation prend effet immédiatement. Chaque promotion ou rétrogradation exige le mot de passe actuel de l’administrateur connecté, avec le même contrôle de session et la même limite de huit confirmations par minute que les paramètres du compte. Le serveur revérifie le rôle dans la transaction d’écriture ; le dernier administrateur ne peut pas être rétrogradé. Le rôle et sa trace d’audit sont publiés ensemble. Le panneau nécessite une session et reste exclu du prérendu public et des robots.

## Mesures

Des triggers SQLite agrègent les inscriptions et les publications de captures dans leur transaction d’origine. Un upload incomplet, un rollback, une reprise ou un nouvel appel de finalisation ne créent pas de double compte. Une conversion de capture existante ne compte pas comme upload. Une suppression ultérieure conserve le volume historique. Il s’agit de captures finalisées et de leur taille logique, pas du trafic réseau, des tentatives abandonnées ou d’une facture fournisseur.

Le suivi commence à l’installation de cette version : aucune série passée n’est reconstruite à partir de captures potentiellement supprimées. Les heures antérieures sont signalées sans historique ; la première heure et l’heure courante sont partielles. Les compteurs actuels distinguent captures et corbeille, effacements en attente, réservations d’upload, sessions non expirées, appareils associés, publications approuvées et objets froids/en restauration. Les agrégats ne stockent aucun événement client ni adresse IP. Les dates Better Auth au format ISO sont normalisées pour l’affichage et l’expiration des sessions.

## Validation

Tests des transactions, recherches et pagination, protections du dernier administrateur, bootstrap, publications reprises, rollback et conservation de l’historique. Les parcours HTTP utilisent de vraies sessions Better Auth et le contrat oRPC ; ils vérifient aussi qu’un administrateur ne peut pas télécharger le fichier privé d’un autre compte. Les tests d’interaction couvrent l’accès refusé, les filtres, les périodes, la pagination et la confirmation des rôles.
