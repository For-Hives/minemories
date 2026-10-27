# Changelog

## [0.22.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.21.0-beta.1...mod-v0.22.0-beta.1) (2026-10-27)

### Fonctionnalités

* adopter minemories.net et api.minemories.net comme domaines officiels ([690b6a5](https://github.com/For-Hives/minemories/commit/690b6a573fcac267db8d5ca23dd7c90bb18f461b))
* **mod:** option pour enregistrer les captures manuelles en tuiles ([0bf0a39](https://github.com/For-Hives/minemories/commit/0bf0a3949ca458f21195cdaf87297b8120d4fe1a))
* timelapse monde cumulatif à partir des captures tuilées ([43832af](https://github.com/For-Hives/minemories/commit/43832af2525b6127efb1aa36274a08be1a596f6b))
* un seul visualiseur avec l'évolution intégrée, captures manuelles tuilées par défaut ([76c0b20](https://github.com/For-Hives/minemories/commit/76c0b200976a5deeddeda24d4ed1fdd857cddcac))
* une carte par évolution, ouverture sur la dernière capture, réponses GZIP, tuiles de 32 blocs ([7aaadeb](https://github.com/For-Hives/minemories/commit/7aaadeb6d062a31cd35f84e33166bf4627cbcf3b))

### Corrections

* **deps:** mettre à jour better-auth en 1.7.7 (bun audit) ([3e5eac2](https://github.com/For-Hives/minemories/commit/3e5eac25084ad64c09cf84f0e2575b7d78327f5f))

### Documentation

* bilan de la tentative de tuiles et du mode évolution ([8714847](https://github.com/For-Hives/minemories/commit/8714847fc95ceb61cc9ebd5ccacdd3846ff34510))

### Tests

* **mod:** couvrir l'ancien historique d'exploration et le zoneId ([#148](https://github.com/For-Hives/minemories/issues/148)) ([9bd26e1](https://github.com/For-Hives/minemories/commit/9bd26e16b96158427ab967838da8555315d4a794))

## [0.21.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.20.0-beta.1...mod-v0.21.0-beta.1) (2026-10-27)

### Fonctionnalités

* **mod:** réglages avancés organisés en onglets ([efc4a6e](https://github.com/For-Hives/minemories/commit/efc4a6ef79f26cbb15f6568357305a202e8c0a88))

### Corrections

* **mod:** retirer l'écriture statique de l'onglet avancé signalée par SpotBugs ([7c60436](https://github.com/For-Hives/minemories/commit/7c60436393b8924e12c127d7f9b834149c5a71fa))

## [0.20.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.19.1-beta.1...mod-v0.20.0-beta.1) (2026-10-27)

### Fonctionnalités

* **mod:** écran d'accueil simple à icônes et réglages avancés séparés ([9fb18f3](https://github.com/For-Hives/minemories/commit/9fb18f3d29c969f6c05235156a3e2ff3941df76f)), references [#156](https://github.com/For-Hives/minemories/issues/156)
* **mod:** modèle de vue et textes de l'écran d'accueil simple ([e18219e](https://github.com/For-Hives/minemories/commit/e18219ec03e67ba1720fa87da9ac5c94a2f6a718)), references [#156](https://github.com/For-Hives/minemories/issues/156)
* **mod:** tout activé par défaut et rappel de connexion cliquable dans le chat ([e37123b](https://github.com/For-Hives/minemories/commit/e37123ba0144c809314955fcea20d4eeba868911)), references [#156](https://github.com/For-Hives/minemories/issues/156)

### Corrections

* **mod:** corriger le formatage des tests et le champ volatile de ClientRuntime ([d7a3083](https://github.com/For-Hives/minemories/commit/d7a3083d0545d24c689f965867955f4681b292e9)), references [#156](https://github.com/For-Hives/minemories/issues/156)

### Documentation

* décrire l'écran d'accueil simple et les diagnostics activés par défaut ([ab01f48](https://github.com/For-Hives/minemories/commit/ab01f4891bdcf133ef8fb543bf7d2ad85b32523f)), references [#156](https://github.com/For-Hives/minemories/issues/156)

## [0.19.1-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.19.0-beta.1...mod-v0.19.1-beta.1) (2026-10-27)

### Corrections

* **api:** servir un GLB assemblé pour les captures tuilées sur les routes de fichier ([71950ee](https://github.com/For-Hives/minemories/commit/71950eec3e1f015956482d15d7fe221c3bd24598)), references [#146](https://github.com/For-Hives/minemories/issues/146)

### Refactorisation

* **front:** déplacer la fusion de GLB de tuiles dans le package de contrat ([b73b976](https://github.com/For-Hives/minemories/commit/b73b9763a498bdf09c29e97b23aa7bbd449d6253)), references [#146](https://github.com/For-Hives/minemories/issues/146)

## [0.19.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.18.0-beta.1...mod-v0.19.0-beta.1) (2026-10-27)

### Fonctionnalités

* **mod:** écrire les tuiles par spool pour les captures AFK ([2bd39f0](https://github.com/For-Hives/minemories/commit/2bd39f08a901e3ea050ff02100083508c4fe2965)), references [#145](https://github.com/For-Hives/minemories/issues/145)
* **mod:** écrire un bundle de tuiles pour les captures AFK (option avancée) ([baaaea5](https://github.com/For-Hives/minemories/commit/baaaea57ec2d67d5866af5217f7a37ae71aa22b5)), references [#145](https://github.com/For-Hives/minemories/issues/145)

## [0.18.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.17.0-beta.1...mod-v0.18.0-beta.1) (2026-10-27)

### Fonctionnalités

* **front:** exporter la capture affichée en un seul GLB depuis le lecteur ([e292557](https://github.com/For-Hives/minemories/commit/e292557c8e0cccb2c75f3b3bc6d8b162335ed607)), references [#148](https://github.com/For-Hives/minemories/issues/148)
* **front:** fusionner les GLB de tuiles en un seul GLB autonome ([6421a5f](https://github.com/For-Hives/minemories/commit/6421a5fae7b75364599c675c985e9a86e73f5091)), references [#148](https://github.com/For-Hives/minemories/issues/148)

## [0.17.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.16.0-beta.1...mod-v0.17.0-beta.1) (2026-10-27)

### Fonctionnalités

* **front:** ajouter le planificateur de tuiles et l'API par tuile du viewer ([e9dc2eb](https://github.com/For-Hives/minemories/commit/e9dc2ebb8c245041b5565b53dd01a60e8bb21b05)), references [#147](https://github.com/For-Hives/minemories/issues/147)
* **front:** lire une série tuilée tuile par tuile dans le lecteur temporel ([f92829a](https://github.com/For-Hives/minemories/commit/f92829a8a3a8d57eccbe0b7221d92e2dc7a6cc97)), references [#147](https://github.com/For-Hives/minemories/issues/147)

## [0.16.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.15.0-beta.1...mod-v0.16.0-beta.1) (2026-10-27)

### Fonctionnalités

* **api:** accepter les bundles de tuiles et servir leurs tuiles au propriétaire ([735ed1f](https://github.com/For-Hives/minemories/commit/735ed1fecea6c644ec1ef6365de201bde4662cbe)), references [#146](https://github.com/For-Hives/minemories/issues/146)
* **api:** indexer les tuiles d'un bundle et lire un intervalle d'octets ([f192555](https://github.com/For-Hives/minemories/commit/f192555daba57a3277cc25cd3e51cdebf5f19e3c)), references [#146](https://github.com/For-Hives/minemories/issues/146)
* **api:** valider les bundles de tuiles et déclarer leur contrat ([509718f](https://github.com/For-Hives/minemories/commit/509718ffa2f1959ba0c216f28f4a8e6aefdf339a)), references [#146](https://github.com/For-Hives/minemories/issues/146)

### Tests

* **api:** justifier la boucle séquentielle des tests de tuiles ([9e3eb90](https://github.com/For-Hives/minemories/commit/9e3eb90300985f0b72762ecddeae6551497cb631))

## [0.15.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.14.0-beta.1...mod-v0.15.0-beta.1) (2026-10-27)

### Fonctionnalités

* **mod:** découper les captures en tuiles Minemories dans le cœur ([b04f474](https://github.com/For-Hives/minemories/commit/b04f474161a95ee25a5b12c58c7889b88f2341e7)), references [#145](https://github.com/For-Hives/minemories/issues/145)

### Corrections

* **deps:** résoudre les avis de sécurité signalés par bun audit ([5b1fd1b](https://github.com/For-Hives/minemories/commit/5b1fd1b7c7522e3b63436a640e0176515b050bfb))

### Maintenance

* **deps:** update gradle to v9.8.2 ([864226b](https://github.com/For-Hives/minemories/commit/864226b0a8f395b6c83462ee482061b2ad2cb12e))

## [0.14.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.13.0-beta.1...mod-v0.14.0-beta.1) (2026-10-19)

### Fonctionnalités

* **i18n:** localize the website for ten countries ([94808d8](https://github.com/For-Hives/minemories/commit/94808d87aafec0519d243495931aebe294e244fd))
* improve viewer, sharing and account settings ([c320b92](https://github.com/For-Hives/minemories/commit/c320b92b7e142449ef2763793861527f6c640d0e))

### Refactorisation

* **i18n:** unify web catalogs and localize mod options ([139271e](https://github.com/For-Hives/minemories/commit/139271ef10df199786ea8cc76d2450c5a8bf1626))

## [0.13.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.12.0-beta.1...mod-v0.13.0-beta.1) (2026-10-16)

### Fonctionnalités

* **front:** complete French and English guides and display formats ([980c59f](https://github.com/For-Hives/minemories/commit/980c59f80f465cbba450df36166b01b07ace257a))

### Corrections

* **deps:** resolve Minecraft runtime dependencies from their official sources ([c8c9044](https://github.com/For-Hives/minemories/commit/c8c9044a27b8e949c5dbb88043cef59739e7eda8))

### Maintenance

* **deps:** update plugin dev.architectury.loom-remap to v1.17.493 ([3465e50](https://github.com/For-Hives/minemories/commit/3465e50201800ab1969c92f62d0b9b8bcaf99eec))

## [0.12.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.11.0-beta.1...mod-v0.12.0-beta.1) (2026-10-16)

### Fonctionnalités

* **front:** prepare consented public-page error diagnostics ([6e986f7](https://github.com/For-Hives/minemories/commit/6e986f7e6c29aacaa7499d94160264349a8e77fb))

## [0.11.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.10.0-beta.1...mod-v0.11.0-beta.1) (2026-10-16)

### Fonctionnalités

* **web:** redesign sign-in around focused and guest journeys ([4dc3076](https://github.com/For-Hives/minemories/commit/4dc3076d1661091cdbbf457e6ae548f2f78d80a6))

### Corrections

* **front:** cover gallery lifecycle and ignore obsolete responses ([dcf75ee](https://github.com/For-Hives/minemories/commit/dcf75ee993303e6c760411a2f9b6e68b60c57db0))
* **web:** reserve local GLB loading for development ([516fdf2](https://github.com/For-Hives/minemories/commit/516fdf26cade4f57c4714d3316c13e70183b49e8))

### Refactorisation

* **front:** isolate gallery state and cancellable pairing polling ([05a2cc7](https://github.com/For-Hives/minemories/commit/05a2cc74d10a54937b20d975981e7a6f3320acce))

## [0.10.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.9.0-beta.1...mod-v0.10.0-beta.1) (2026-10-16)

### Fonctionnalités

* **api:** prepare opt-in Polar billing with verified webhook ledger ([f4d3278](https://github.com/For-Hives/minemories/commit/f4d327822a78737d14fde4385c45a707dcfa0823))

### Documentation

* **billing:** retain explicit payment-off configuration per owner decision ([b01644d](https://github.com/For-Hives/minemories/commit/b01644d5a49c00804e0d467dc1af5f35a6906b50))

## [0.9.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.8.0-beta.1...mod-v0.9.0-beta.1) (2026-10-15)

### Fonctionnalités

* **admin:** add protected dashboard and administrator management ([2f50c9d](https://github.com/For-Hives/minemories/commit/2f50c9dbe3b85c92f981f8385db17dd56a988ba5))
* **admin:** bootstrap requested owner once with cleanup reminder ([94f04c7](https://github.com/For-Hives/minemories/commit/94f04c7e84fddfe8910ce243b65ca53b7c997533))
* **web:** make sign-in easier to enter and navigate ([8d6e89b](https://github.com/For-Hives/minemories/commit/8d6e89b366079cbc19f8923c9a7910edc65cc97e))

## [0.8.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.7.0-beta.1...mod-v0.8.0-beta.1) (2026-10-15)

### Fonctionnalités

* **web:** propose a living-album art direction across the site ([16e0684](https://github.com/For-Hives/minemories/commit/16e068426c3ed91cd1c461ce88edef3fd5e9be00))

## [0.7.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.6.0-beta.1...mod-v0.7.0-beta.1) (2026-10-15)

### Fonctionnalités

* **account:** change email and password from account settings ([749ce6b](https://github.com/For-Hives/minemories/commit/749ce6b8650a1aa63474b846e5c521fed4392fc4))

### Corrections

* **front:** keep account settings accessible with avatar fallback ([52e8054](https://github.com/For-Hives/minemories/commit/52e805425bc5f266c36b31a48047b16ab397109c))

## [0.6.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.5.1-beta.1...mod-v0.6.0-beta.1) (2026-10-15)

### Fonctionnalités

* **api:** bind cold storage catalogs to an explicit provider target ([7029f7f](https://github.com/For-Hives/minemories/commit/7029f7feef418513d304fac4ef3e5dd2d8314b70))
* **api:** coordinate cancellable cold storage copy workers ([a4ebb2c](https://github.com/For-Hives/minemories/commit/a4ebb2c89926f65f57263b343c5afbfc09c8086a))
* **api:** coordinate durable cold storage transitions and readers ([c818b78](https://github.com/For-Hives/minemories/commit/c818b787bb9bd0c1a6a53aba360161787e814646))
* **api:** expose authorized capture availability and restoration intent ([7999df3](https://github.com/For-Hives/minemories/commit/7999df319a5b2b24e76b205d5b4ed80aa0dca01f))
* **api:** isolate immutable storage generations and durable cleanup ([6ad55f0](https://github.com/For-Hives/minemories/commit/6ad55f00a04993ba51550228d4f18cccadc035e2))
* **api:** lease original capture streams across storage transitions ([b3ad52c](https://github.com/For-Hives/minemories/commit/b3ad52cccafc28454d89fd19889afb2cd2e5e7e3))
* **api:** preview cold storage eligibility across shared captures ([4f97a8c](https://github.com/For-Hives/minemories/commit/4f97a8c239f7052cf0be19c1ea185182b6daeb49))
* **api:** schedule cold storage transitions and guard physical deletion ([bc5b281](https://github.com/For-Hives/minemories/commit/bc5b2814e7c9f42bf49e25a58e42835bb6153cea))
* **api:** track actual capture openings for cold storage ([f829b50](https://github.com/For-Hives/minemories/commit/f829b50e7a07647ed6e3be1f94e59d4c777842af))
* **api:** verify conditional S3 cold copies and asynchronous restores ([9d9b608](https://github.com/For-Hives/minemories/commit/9d9b60863f3ea590702a1168a213c2702ef4f7b6))
* **front:** restore archived captures across viewers and timelines ([19170df](https://github.com/For-Hives/minemories/commit/19170df9c47439826d1d9efc3378228a8d8a62b5))
* **mod:** retain five foundation blocks and allow 450 MiB uploads ([d851d74](https://github.com/For-Hives/minemories/commit/d851d74c17f20ffa8a6e18887acc28d7dcb8a873))
* **viewer:** center captured players and add first-person exploration ([dd1bba3](https://github.com/For-Hives/minemories/commit/dd1bba3b8bdff008706f8dae985664558d438441))
* **web:** rebuild viewer as an immersive cinematic studio ([6a9f424](https://github.com/For-Hives/minemories/commit/6a9f4242345040d383c57b9717e77054eded75b2))

### Corrections

* **api:** await durable cleanup before closing SQLite on shutdown ([7d64e89](https://github.com/For-Hives/minemories/commit/7d64e89bc5789330d4e70cb59f8872facb42a1b6))
* **api:** keep bound S3 uploads in STANDARD storage ([2d4b546](https://github.com/For-Hives/minemories/commit/2d4b546db425aaa216d222956c6c220bfbebd986))
* **api:** share the upload ceiling with cold storage copies ([f6fa877](https://github.com/For-Hives/minemories/commit/f6fa87739c22cd534d53082eca68c74cb634648e))
* **web:** keep viewer loading inside the immersive surface ([13dfd3a](https://github.com/For-Hives/minemories/commit/13dfd3a5e502e5821760e9793227dc13f4e8c1f5))
* **web:** retain reflection settings on shared water materials ([3c4e65a](https://github.com/For-Hives/minemories/commit/3c4e65af3699fb88b3999241ae26dab176c6ad74))

### Documentation

* **api:** compare cold classes and verified provider costs ([eda841a](https://github.com/For-Hives/minemories/commit/eda841a8d2fc5cb10bdeeea0577db23deb393f64))

### Tests

* **api:** verify raised upload boundaries under parallel coverage ([28e3b62](https://github.com/For-Hives/minemories/commit/28e3b620d3cf44d9de9b08cee37b271aadb684e7))
* **mod:** record five-block native capture validation ([35a2533](https://github.com/For-Hives/minemories/commit/35a253337c73b4981588401a45d8ca2855cee496))

## [0.5.1-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.5.0-beta.1...mod-v0.5.1-beta.1) (2026-10-15)

### Corrections

* **mod:** preserve atlas sampling across sprite boundaries ([4b879bb](https://github.com/For-Hives/minemories/commit/4b879bbe70b5c0d343d0ab8287b8e9ee9b920342))

## [0.5.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.4.0-beta.1...mod-v0.5.0-beta.1) (2026-10-15)

### Fonctionnalités

* **mod:** enable validated Fabric and Forge release targets ([6e46ebe](https://github.com/For-Hives/minemories/commit/6e46ebee5f90782bce638b522bd659065b10622b))
* **mod:** share client across Fabric and Forge adapters ([eed3186](https://github.com/For-Hives/minemories/commit/eed31869f8384d2c60d85c24c3b88321bde76501))

### Corrections

* **web:** preserve imported normals to prevent Firefox bloom corruption ([f20b8e2](https://github.com/For-Hives/minemories/commit/f20b8e230861fe9671dfb236e9a83bd83bc3b199))

### Build

* **mod:** verify all loader distributions in CI ([bcf30fd](https://github.com/For-Hives/minemories/commit/bcf30fd457e1967c93c2490402bf9f4e64a1813d))

## [0.4.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.3.1-beta.1...mod-v0.4.0-beta.1) (2026-10-15)

### Fonctionnalités

* **web:** add adaptive viewer lighting and memory studio controls ([5f2919f](https://github.com/For-Hives/minemories/commit/5f2919f03c3955393b5e2d4b79a7f5e3ca2183f7))

## [0.3.1-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.3.0-beta.1...mod-v0.3.1-beta.1) (2026-10-15)

### Maintenance

* **deps:** update vitest monorepo to v5.0.5 ([aba7d70](https://github.com/For-Hives/minemories/commit/aba7d702fa6be498ea2aa1b5680d825d14bc4b08))

## [0.3.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.2.1-beta.1...mod-v0.3.0-beta.1) (2026-10-15)

### Fonctionnalités

* recover mod crash diagnostics and add private operator triage ([a05a3a1](https://github.com/For-Hives/minemories/commit/a05a3a1dd8863db636d75c94d6be146959882ed0))
* **web:** expose mod release history and automatic changelog ([a45957a](https://github.com/For-Hives/minemories/commit/a45957a0d13b3d2698f4390b46161ecab5539bd7))

### Maintenance

* **deps:** update dependency basic-ftp to v6.2.3 ([bf1c8c6](https://github.com/For-Hives/minemories/commit/bf1c8c6c8b757217d7f5129f2633d9eb8a5fdbcb))

## [0.2.1-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.2.0-beta.1...mod-v0.2.1-beta.1) (2026-10-15)

### Corrections

* **ci:** publish from the authoritative draft creation response ([87bccca](https://github.com/For-Hives/minemories/commit/87bccca62a0b11fc7f4f4d127f0fa9770aca3bc1))

## [0.2.0-beta.1](https://github.com/For-Hives/minemories/compare/mod-v0.1.0-beta...mod-v0.2.0-beta.1) (2026-10-15)

### Fonctionnalités

* **api:** add moderated public discovery and durable votes ([e7cf4c2](https://github.com/For-Hives/minemories/commit/e7cf4c2de3f87474164eeaef1422ffbab27bba0e))
* **api:** add transactional catalog for temporal capture chunks ([b87aea4](https://github.com/For-Hives/minemories/commit/b87aea4bfefa6eaaac5f6a4389e5ca153d420eda))
* **api:** convert and replay temporal capture files with durable cleanup ([003c646](https://github.com/For-Hives/minemories/commit/003c646bfb59808012d5455916d70c8ce54da34c))
* **api:** index precise owner-scoped temporal capture windows ([da6ea96](https://github.com/For-Hives/minemories/commit/da6ea9689df5852896f58dbf21883b47837ed82e))
* **api:** serve temporal manifests and maintain deduplicated capture storage ([81756c3](https://github.com/For-Hives/minemories/commit/81756c3107c3a8db1574b2a22d075d871339a101))
* **ci:** automate versioned mod releases after main quality gates ([f4383a1](https://github.com/For-Hives/minemories/commit/f4383a1f896c4761da56804364995a3a411f167b))
* **mod:** identify capture footprints and prepare bounded temporal chunks ([7070ede](https://github.com/For-Hives/minemories/commit/7070edecd457cf1490f9af0889248cb958f8f80c))
* **mod:** rendre les captures AFK progressives ([#58](https://github.com/For-Hives/minemories/issues/58)) ([6bca109](https://github.com/For-Hives/minemories/commit/6bca1090a6f0743370f623ae076d2c952ed43b58))
* **mod:** scope remote captures to sessions or explicit worlds ([e77d6f8](https://github.com/For-Hives/minemories/commit/e77d6f8bfb725c770761747adafa161a7a70296b))
* **mod:** suggest locally frequented zones ([6cd3471](https://github.com/For-Hives/minemories/commit/6cd3471bbdd57e08cfc50d60857db63c6d566cf5))
* **web:** bound temporal scene loading and release replaced capture assets ([91c3eeb](https://github.com/For-Hives/minemories/commit/91c3eeb4c124d9e8b2d679bcf30d5c2af5b8b01b))
* **web:** connect moderated public gallery and ranking ([3c2c5e0](https://github.com/For-Hives/minemories/commit/3c2c5e01eba2b7295a3c0016f2448b597e4b9ba8))
* **web:** play recorded capture timelines with bounded paging and resume ([cb19a16](https://github.com/For-Hives/minemories/commit/cb19a163023fd5298ee5fff85d8bd82b587adc6e))

### Corrections

* **ci:** collect a single flattened release artifact ([d1b962d](https://github.com/For-Hives/minemories/commit/d1b962df3b609f5a552a58f7efc927776bf5aef6))
* **ci:** isolate release previews from the publication queue ([6719fd1](https://github.com/For-Hives/minemories/commit/6719fd14be5909a9124105a6c26bbff844fd0377))
* **ci:** verify release identity with its tagged commit ([0dc3ef3](https://github.com/For-Hives/minemories/commit/0dc3ef34362ab469a20da2a8ef2a16d87e1e0c06))
* **deps:** update AWS S3 packages to v3.1152.0 ([#57](https://github.com/For-Hives/minemories/issues/57)) ([5ffe289](https://github.com/For-Hives/minemories/commit/5ffe289b44d56a6d59a095e03f33bedfac4e6f16))
* **mod:** collect Create CPU models while Flywheel remains active in game ([4c5701a](https://github.com/For-Hives/minemories/commit/4c5701ad1021a6df1010c47ae35c0a8821e5dd8f))
* **mod:** crop used renderer sprites from large modpack atlases ([abd28f8](https://github.com/For-Hives/minemories/commit/abd28f83947b3e7bf9edf75613adc9e9f10fdfbb))
* **test:** keep Java diagnostics out of the crash probe path ([54f0c18](https://github.com/For-Hives/minemories/commit/54f0c188de39a0957692f7df98e0739cf70a8940))

### Performances

* **core:** mask unsampled atlas texels without changing UVs ([9d22a95](https://github.com/For-Hives/minemories/commit/9d22a951ac3b71f0bebba5e257ef204df876360a))
* **core:** pack exact indices with adaptive unsigned widths ([ae8f6ec](https://github.com/For-Hives/minemories/commit/ae8f6ec91e32ed6a422b2fdeba936f4a4c95ea34))
* **mod:** attribute AFK capture costs and bound icon preparation ([bfadba1](https://github.com/For-Hives/minemories/commit/bfadba105030f4b19b8c3804313a72a8e61d0907))

### Documentation

* migrate task tracking to GitHub issues ([#92](https://github.com/For-Hives/minemories/issues/92)) ([9bb7ca6](https://github.com/For-Hives/minemories/commit/9bb7ca6c2ca0033b1435d602fe1fbfd1a2ea3212))
* **mod:** validate AFK cancellation and Sodium Iris capture paths ([9e1fbbd](https://github.com/For-Hives/minemories/commit/9e1fbbd6096f461104ecbfcb7ecfffb45861a8f6))
* **mod:** validate native 200 MiB upload recovery ([0f35da9](https://github.com/For-Hives/minemories/commit/0f35da9aba9a8cc98c7ed11a4353264d90957a3d))
* **mod:** validate visited depth across zones and player identities ([68e5760](https://github.com/For-Hives/minemories/commit/68e576061a164bf8624b58f17815dd8d24a78607))
* record tested beta release and completed distribution tasks ([8888df4](https://github.com/For-Hives/minemories/commit/8888df41533cf71fee99d664184e83635711e02c))

Les entrées suivantes seront générées depuis les Conventional Commits lors des releases automatiques.

## 0.1.0-beta — 2026-10-14

Première bêta publiée manuellement, avec le JAR validé en jeu : [release et empreintes](https://github.com/For-Hives/minemories/releases/tag/mod-v0.1.0-beta).
