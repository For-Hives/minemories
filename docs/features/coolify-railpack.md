# Déploiement Coolify avec Railpack

Créer deux applications Coolify connectées au même dépôt Git. Pour les deux, choisir **Railpack** et définir le **Base Directory** à `/` afin que Bun voie le workspace, `bun.lock` et `packages/api-contract`.

## API

- Fichier de configuration Railpack : `railpack.api.json` (variable de build `RAILPACK_CONFIG_FILE=railpack.api.json`).
- Application serveur, site statique désactivé ; exposer le port interne `3001`.
- Variables d’exécution : `NODE_ENV=production`, `API_PORT=3001`, `WEB_ORIGIN=https://<domaine-du-front>`, `BETTER_AUTH_URL=https://<domaine-api>`, `BETTER_AUTH_SECRET` et `PAIRING_PEPPER` (deux secrets aléatoires distincts d’au moins 32 caractères).
- Configurer Garage ou un autre stockage S3 avec `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` et `S3_REGION`. L’endpoint doit être joignable depuis le conteneur API ; les valeurs locales de `.env.example` ne conviennent pas à Coolify.
- Le quota GLB par compte est de 2 Gio par défaut. Configurer `ACCOUNT_STORAGE_BYTES` en octets pour l’adapter ; une valeur positive entière est obligatoire si renseignée. La corbeille, les réservations et les suppressions non acquittées restent comptées. Voir [le quota et sa migration](account-storage-quota.md).
- Ajouter un volume persistant monté sur `/app/apps/api/data`. Définir `DATABASE_PATH=/app/apps/api/data/minemories.sqlite` et `UPLOADS_PATH=/app/apps/api/data/uploads` pour conserver la base et les uploads en attente entre les redéploiements. Avec `STORAGE_DRIVER=filesystem`, définir aussi `LOCAL_OBJECTS_PATH=/app/apps/api/data/objects`.
- Le contrôle de santé est `GET /healthz`.
- Si l’API est derrière un reverse proxy, définir `TRUSTED_PROXY_IPS` avec les IP exactes des proxys immédiatement connectés à Bun, séparées par des virgules. Le proxy doit remplacer `X-Forwarded-For` ou y ajouter l’IP réelle du client en dernière position ; ne pas transmettre le header client inchangé. Restreindre l’accès direct au port API. Sans cette configuration, la limite d’appairage s’applique à l’IP du proxy pour tous ses clients ; les headers IP non fiables sont ignorés. Ne pas ajouter arbitrairement des IP publiques ou celles des joueurs.

Railpack installe le workspace, vérifie les types de l’API puis démarre `NODE_ENV=production bun run --filter @minemories/api start`. La [validation de configuration](api-startup-configuration.md) refuse les valeurs manquantes ou invalides avant l’ouverture de SQLite. Conserver les secrets stables ; retirer un ancien repli de pepper nécessite de réappairer les mods.

## Front

- Fichier de configuration Railpack : `railpack.web.json` (variable de build `RAILPACK_CONFIG_FILE=railpack.web.json`).
- Activer **Is it a static site?** et définir le **Publish Directory** à `apps/web/dist`.
- Définir `VITE_API_URL=https://<domaine-api>` comme variable de **build**, puis reconstruire le front après toute modification de cette URL. Vite l’intègre aux fichiers statiques.

Le build installe aussi Node 24 et Java 21, vérifie et construit le mod, copie le JAR et son manifeste SHA-256 dans `apps/web/public/downloads`, puis exécute le contrôle TypeScript et génère le site Vite. Les fichiers `downloads/` sont ainsi servis avec le site, sans dépendre d’une publication catalogue. Le serveur statique Coolify/Nginx sert ensuite le contenu de `apps/web/dist`.

## Déploiement

Dans chaque application, ajouter `RAILPACK_CONFIG_FILE` comme variable de build pour sélectionner le fichier correspondant. Ne pas y mettre de secrets dans les fichiers Railpack. Déployer d’abord l’API, puis le front ; les origines `WEB_ORIGIN`, `BETTER_AUTH_URL` et `VITE_API_URL` doivent correspondre aux domaines HTTPS publics configurés dans Coolify.
