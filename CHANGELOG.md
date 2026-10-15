# Changelog

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
