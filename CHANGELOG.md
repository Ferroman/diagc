# Changelog

## [0.7.0](https://github.com/Ferroman/diagc/compare/v0.6.0...v0.7.0) (2026-10-01)


### Features

* **renderer:** route activity links between lanes; tidy lane order ([#40](https://github.com/Ferroman/diagc/issues/40)) ([63d620b](https://github.com/Ferroman/diagc/commit/63d620b833b4c052a210382454227c2607be01bc))
* **studio:** drag activity lanes to reorder; editing fixes ([#39](https://github.com/Ferroman/diagc/issues/39)) ([2d69502](https://github.com/Ferroman/diagc/commit/2d695022da87520a1564f5ca13e3ce291788124b))
* **studio:** export the canvas as a PNG ([#41](https://github.com/Ferroman/diagc/issues/41)) ([599fd18](https://github.com/Ferroman/diagc/commit/599fd18f85519fb880500cc22d526741b0fca9a9))

## [0.6.0](https://github.com/Ferroman/diagc/compare/v0.5.1...v0.6.0) (2026-10-01)


### Features

* **studio:** reorder activity lanes ([#37](https://github.com/Ferroman/diagc/issues/37)) ([74266d6](https://github.com/Ferroman/diagc/commit/74266d604a619ad3b237678f90e619cc1c7bf7f6))


### Bug Fixes

* **renderer:** caption named activity glyphs below them ([#36](https://github.com/Ferroman/diagc/issues/36)) ([ddd52b8](https://github.com/Ferroman/diagc/commit/ddd52b8d464bf5acdbcde7b34ef4cc5f15081d53))

## [0.5.1](https://github.com/Ferroman/diagc/compare/v0.5.0...v0.5.1) (2026-09-30)


### Bug Fixes

* **renderer:** place causal-loop R/B markers inside their loops ([#33](https://github.com/Ferroman/diagc/issues/33)) ([33a8cad](https://github.com/Ferroman/diagc/commit/33a8cad1d101b71715838c9404cdc78d8a6b6c4f))

## [0.5.0](https://github.com/Ferroman/diagc/compare/v0.4.1...v0.5.0) (2026-09-30)


### Features

* **renderer:** lay causal loops out with stress ([#24](https://github.com/Ferroman/diagc/issues/24)) ([0e86367](https://github.com/Ferroman/diagc/commit/0e863675c0f68194c12f103176eb47e2ea6be440))

## [0.4.1](https://github.com/Ferroman/diagc/compare/v0.4.0...v0.4.1) (2026-09-30)


### Bug Fixes

* **core:** warn about a stray fishbone cause instead of refusing to save ([#29](https://github.com/Ferroman/diagc/issues/29)) ([5ef729b](https://github.com/Ferroman/diagc/commit/5ef729b91e43ab09b853a96168471adfa246a4fa))

## [0.4.0](https://github.com/Ferroman/diagc/compare/v0.3.0...v0.4.0) (2026-09-28)


### Features

* **core:** put ER table columns on layers ([#27](https://github.com/Ferroman/diagc/issues/27)) ([f9cc88e](https://github.com/Ferroman/diagc/commit/f9cc88ef5ac1350eb0f3b80cad9212241668c155))

## [0.3.0](https://github.com/Ferroman/diagc/compare/v0.2.2...v0.3.0) (2026-09-28)


### Features

* deployment notation ([#23](https://github.com/Ferroman/diagc/issues/23)) ([2c4dbf5](https://github.com/Ferroman/diagc/commit/2c4dbf56f67f26f5ac91452a40b94f90ac81fec0))
* **diagc:** send credentials to private include hosts ([#22](https://github.com/Ferroman/diagc/issues/22)) ([9d9c5c3](https://github.com/Ferroman/diagc/commit/9d9c5c301bc4586ea7a1d0c444cfad3621d83c91))

## [0.2.2](https://github.com/Ferroman/diagc/compare/v0.2.1...v0.2.2) (2026-09-27)


### Bug Fixes

* **renderer:** outline activity decisions ([#20](https://github.com/Ferroman/diagc/issues/20)) ([b35c8f5](https://github.com/Ferroman/diagc/commit/b35c8f5d036fcc1a4c11447a3a30ed135ce87820))

## [0.2.1](https://github.com/Ferroman/diagc/compare/v0.2.0...v0.2.1) (2026-09-27)


### Bug Fixes

* **renderer:** lay activity lanes out as swimlanes ([d09def0](https://github.com/Ferroman/diagc/commit/d09def0112379d10574d1304310c3fb0124741cc))
* **renderer:** start activity layouts at the start node ([165d173](https://github.com/Ferroman/diagc/commit/165d173b57e77952b5b2c1129419acf2136b2e07))

## [0.2.0](https://github.com/Ferroman/diagc/compare/v0.1.0...v0.2.0) (2026-09-26)


### Features

* activity diagram editing in the studio: lane +, drops into lanes, copy/paste ([#16](https://github.com/Ferroman/diagc/issues/16)) ([37e5d0e](https://github.com/Ferroman/diagc/commit/37e5d0e3033bd8db7e29060f4c7414059fdccf92))
* comments and links on nodes and relations ([#11](https://github.com/Ferroman/diagc/issues/11)) ([5ba6da4](https://github.com/Ferroman/diagc/commit/5ba6da4d0e18f75f6cda09d137bd4c33b6cb298a))
* **diagc:** group the published index by folder and title cards with model names ([a4a2956](https://github.com/Ferroman/diagc/commit/a4a2956433f45d8e9635c7eef2c98ea610a59cc8))
* **diagc:** publish --link puts a link in the index header ([#6](https://github.com/Ferroman/diagc/issues/6)) ([3015f12](https://github.com/Ferroman/diagc/commit/3015f12c0621c1400ec5187739ad19506491deb3))
* drop a node on a plan zone to assign it ([#14](https://github.com/Ferroman/diagc/issues/14)) ([1cf9a57](https://github.com/Ferroman/diagc/commit/1cf9a57b16bd3c544d407de76d8bb0226e849345))
* plan (Gantt) notation ([#12](https://github.com/Ferroman/diagc/issues/12)) ([#13](https://github.com/Ferroman/diagc/issues/13)) ([27235c4](https://github.com/Ferroman/diagc/commit/27235c4af9e55e7ecb74a0751f75e3d0f34df18b))
* **renderer:** a legend that reads on activity, threat-model and ER diagrams ([#7](https://github.com/Ferroman/diagc/issues/7)) ([88c86d4](https://github.com/Ferroman/diagc/commit/88c86d411ad672a600afe9c8c87e16d3a5573d87))
* **viewer:** the leverage report on published causal-loop pages ([#10](https://github.com/Ferroman/diagc/issues/10)) ([959c745](https://github.com/Ferroman/diagc/commit/959c745cb0eab721ce6e628ebdaab277411425f0))


### Bug Fixes

* **diagc:** compile a save only once it is fully written ([#5](https://github.com/Ferroman/diagc/issues/5)) ([e76aa06](https://github.com/Ferroman/diagc/commit/e76aa06c4874fd42d65c12bf4bc6299f779e95be))
* **renderer:** ER crow's foot and in-place table rename ([#4](https://github.com/Ferroman/diagc/issues/4)) ([176265d](https://github.com/Ferroman/diagc/commit/176265d8adef4c54b6ffc909f26796e0c475cffe))
* **renderer:** keep animated edges still in the PNG export ([bd08e5f](https://github.com/Ferroman/diagc/commit/bd08e5fbfaa1e41d5e48c5647fe4c2716e22a2ae))
