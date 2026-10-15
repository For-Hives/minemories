# Socle de facturation Polar

Le code prépare l’intégration Better Auth/Polar ; il ne constitue pas une offre commerciale activée. Par défaut, `POLAR_ENVIRONMENT` est absent ou `off` : aucun plugin, checkout ou appel fournisseur n’est ajouté. Aucun client Polar n’est créé à l’inscription Minemories.

## Configuration explicite

Pour un environnement de test isolé, fournir `POLAR_ENVIRONMENT=sandbox`, `POLAR_ORGANIZATION_ID` (UUID), `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `WEB_ORIGIN` et `POLAR_PRODUCTS` (tableau JSON de `{ "slug": "offre-test", "productId": "UUID" }`). Les slugs et produits sont uniques. Les secrets restent dans l’environnement du déploiement, jamais dans Git ou les issues.

La production exige en plus `POLAR_PRODUCTION_READY=true`, une `POLAR_TERMS_VERSION` explicite et une origine HTTPS. Ces paramètres attestent une décision opérateur ; le code ne peut pas vérifier la relecture juridique. Ne les activer qu’après préparation du compte Polar (#63), validation de l’offre et des conditions (#89), et exercice réel du sandbox. Une base est liée durablement à une organisation et un environnement ; leur changement nécessite une migration explicite.

## Checkout et webhooks

`POST /api/auth/checkout` accepte uniquement `{ "slug": "offre-test" }`, pour une session authentifiée. Le produit est choisi dans la liste serveur. Les identifiants de produits, client, organisation, tarifs, métadonnées, essais, remises et redirections fournis par le client sont refusés. Les URL de retour restent dans la galerie configurée ; l’adresse IP du client n’est pas envoyée. Le retour du checkout n’accorde aucun droit. Le portail client utilise également l’identité de la session Better Auth. Les paramètres `reference_id` et `organizationId` sont refusés sur les routes client pour empêcher une recherche par référence d’organisation étrangère.

Le plugin vérifie la signature Standard Webhooks et sa fenêtre temporelle sur le corps exact de `POST /api/auth/polar/webhooks`, limité à 256 Kio. Le contexte conserve l’identifiant de livraison et son SHA-256. La projection minimale SQLite des commandes et abonnements vérifie l’organisation et l’identifiant externe du compte Minemories. Les doublons identiques sont idempotents, un identifiant réutilisé avec un autre corps échoue, les révisions anciennes ne régressent pas l’état et le propriétaire d’une ressource ne peut pas changer. Les commandes et abonnements ont des espaces d’identifiants distincts. Les types non exploités sont acquittés sans modification. Les logs d’authentification liés à Polar sont réduits à un événement générique pour éviter d’y écrire des erreurs fournisseur contenant des données personnelles.

## Périmètre restant avant commercialisation

La projection est un cache technique, pas une autorité de quotas : aucun événement ne modifie aujourd’hui les limites d’upload, les droits d’accès, la conservation ou une offre. Les révisions identiques avec contenus divergents nécessiteront une réconciliation avec l’état canonique du fournisseur avant que ce cache puisse piloter des droits. Le modèle de facturation par capture ou compte, les taxes, quotas et engagements de conservation/résiliation doivent être décidés dans #89 ; ne pas inventer d’abonnement mensuel en remplacement des tarifs préparés.

Restent à réaliser pour clôturer #80 : rattacher le contrat commercial validé aux droits et quotas, proposer le parcours utilisateur correspondant, vérifier les changements/annulations et leurs effets, effectuer un paiement sandbox réel et préparer le déploiement avec le compte et les secrets réels. La présence de ce socle ne valide ni un encaissement sandbox ni un paiement de production.

## Validation locale

Les tests utilisent le vrai plugin Better Auth et le SDK Polar, des sessions réelles et un serveur fournisseur simulé localement. Ils vérifient l’identité transmise, le refus d’un produit arbitraire, les URL imposées, l’absence d’appel à l’inscription et de droits après checkout, les signatures invalides/expirées, doubles livraisons, reprises désordonnées, remboursements, organisation étrangère et erreurs fournisseur. Ils ne transmettent aucune donnée de compte réel à Polar.

Références : [adaptateur Better Auth](https://polar.sh/docs/integrate/sdk/adapters/better-auth), [webhooks Polar](https://polar.sh/docs/integrate/webhooks/endpoints).
