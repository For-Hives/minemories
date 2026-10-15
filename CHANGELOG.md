# Changelog

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
