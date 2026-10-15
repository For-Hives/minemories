# Administration du service

Le panneau privé `/admin` est accessible depuis « Mon compte » après vérification des droits par le serveur. Il propose les volumes finalisés en Go décimaux par heure, les inscriptions, des périodes de 24 heures, 7 jours et 30 jours, une recherche paginée des comptes avec filtre de rôle, les compteurs de stockage et d’activité, et les 50 derniers changements de rôle. Les heures sont regroupées en UTC. Les droits administrateur ne donnent aucun accès supplémentaire aux fichiers privés.

## Premier administrateur

Sur le serveur de l’API, avec sa base et son environnement réels, exécuter :

```sh
bun api:admin --email adresse-du-compte-existant@example.com
```

`DATABASE_PATH` doit désigner la base existante. La commande refuse une base absente et un compte inconnu ; elle ne crée ni compte ni mot de passe. Elle est idempotente et journalise la première attribution. À la demande du propriétaire, un bootstrap temporaire contient son adresse côté serveur (TODO #125). Au démarrage, il promeut le compte existant une seule fois et conserve une marque persistante : aucune création de compte, aucun hook d’inscription et aucune réattribution après rétrogradation ou recréation du compte. Si le compte est absent, il ne crée rien ; un redémarrage ultérieur pourra initialiser le compte une fois créé. Cette exception temporaire doit être retirée après confirmation de l’accès opérateur. Cette commande locale n’est pas exposée sur HTTP. Lancer cette commande sur une base de test ne modifie pas les droits du site déployé.

## Permissions

Les rôles sont conservés en SQLite et relus à chaque requête : une rétrogradation prend effet immédiatement. Chaque promotion ou rétrogradation exige le mot de passe actuel de l’administrateur connecté, avec le même contrôle de session et la même limite de huit confirmations par minute que les paramètres du compte. Le serveur revérifie le rôle dans la transaction d’écriture ; le dernier administrateur ne peut pas être rétrogradé. Le rôle et sa trace d’audit sont publiés ensemble. Le panneau nécessite une session et reste exclu du prérendu public et des robots.

## Mesures

Des triggers SQLite agrègent les inscriptions et les publications de captures dans leur transaction d’origine. Un upload incomplet, un rollback, une reprise ou un nouvel appel de finalisation ne créent pas de double compte. Une conversion de capture existante ne compte pas comme upload. Une suppression ultérieure conserve le volume historique. Il s’agit de captures finalisées et de leur taille logique, pas du trafic réseau, des tentatives abandonnées ou d’une facture fournisseur.

Le suivi commence à l’installation de cette version : aucune série passée n’est reconstruite à partir de captures potentiellement supprimées. Les heures antérieures sont signalées sans historique ; la première heure et l’heure courante sont partielles. Les compteurs actuels distinguent captures et corbeille, effacements en attente, réservations d’upload, sessions non expirées, appareils associés, publications approuvées et objets froids/en restauration. Les agrégats ne stockent aucun événement client ni adresse IP. Les dates Better Auth au format ISO sont normalisées pour l’affichage et l’expiration des sessions.

## Validation

Tests des transactions, recherches et pagination, protections du dernier administrateur, bootstrap, publications reprises, rollback et conservation de l’historique. Les parcours HTTP utilisent de vraies sessions Better Auth et le contrat oRPC ; ils vérifient aussi qu’un administrateur ne peut pas télécharger le fichier privé d’un autre compte. Les tests d’interaction couvrent l’accès refusé, les filtres, les périodes, la pagination et la confirmation des rôles.
