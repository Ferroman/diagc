# Third-party notices

`diagc` is licensed under AGPL-3.0-only (see [LICENSE](LICENSE)). It incorporates the
third-party components listed here, each under its own license. Nothing in this file
alters those licenses; it exists to satisfy their attribution requirements.

Two groups are distinguished, because the obligations differ:

- **Bundled components** are compiled into `packages/diagc/assets/` by
  `scripts/stage-assets.mjs` and ship inside the published `diagc` package — the studio
  bundle and the single-file viewer shell that `diagc publish` stamps diagrams into.
  Their code is redistributed by this project.
- **Runtime dependencies** are declared in `package.json` and fetched by your package
  manager. They are not redistributed here; they arrive under their own licenses.

`@diagramming/core` has no dependencies and bundles nothing. It is covered by
[LICENSE](LICENSE) alone.

---

## Bundled components

| Component | Version | License |
| --- | --- | --- |
| [elkjs](https://github.com/kieler/elkjs) | 0.12.0 | **GPL-3.0-or-later** (elected — see below) |
| [@xyflow/react](https://reactflow.dev) | 12.11.2 | MIT |
| [react](https://react.dev), react-dom | 19.2.7 | MIT |
| [roughjs](https://roughjs.com) | 4.6.6 | MIT |
| [lucide-react](https://lucide.dev) | 1.25.0 | ISC |
| [marked](https://marked.js.org) | 18.0.6 | MIT |
| [@fontsource/kalam](https://fontsource.org) | 5.3.0 | OFL-1.1 |
| [@fontsource/caveat](https://fontsource.org) | 5.3.0 | OFL-1.1 |

### elkjs — election of the GPL branch

Copyright (c) 2017 Kiel University and others.

elkjs is offered under a choice of two licenses. Its source files carry the notice that
Exhibit A of the Eclipse Public License 2.0 requires in order to make the code available
under a Secondary License:

```
 * Copyright (c) 2017 Kiel University and others.
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 2.0 which is available at
 * https://www.eclipse.org/legal/epl-2.0.
 * ... which is available under Secondary Licenses when the conditions for such
 * availability set forth in the Eclipse Public License v. 2.0 are satisfied:
 * GPL-3.0 ...
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-3.0-or-later
```

**This project elects the GPL-3.0-or-later branch**, and does not rely on the EPL-2.0
branch. The reason matters: the Free Software Foundation treats EPL-2.0 as incompatible
with the GPL family, so combining EPL-2.0 code into this AGPL-3.0 work would be a
conflict. GPL-3.0-or-later has no such problem — GPL-3.0 section 13 and AGPL-3.0
section 13 grant reciprocal permission to combine works under the two licenses.

The full GPL-3.0 text is at <https://www.gnu.org/licenses/gpl-3.0-standalone.html>.

### MIT-licensed components

Copyright holders:

- **@xyflow/react** — Copyright (c) 2019-2025 webkid GmbH
- **react**, **react-dom** — Copyright (c) Meta Platforms, Inc. and affiliates
- **roughjs** — Copyright (c) 2019 Preet Shihn
- **marked** — Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/); Copyright (c) 2011-2018, Christopher Jeffrey (https://github.com/chjj/)

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be included in all copies
or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### lucide-react — ISC

Copyright (c) 2026 Lucide Icons and Contributors.
Incorporates icons from Feather, Copyright (c) 2013-present Cole Bemis.

Permission to use, copy, modify, and/or distribute this software for any purpose with
or without fee is hereby granted, provided that the above copyright notice and this
permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO
THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO
EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL
DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER
IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

### Fonts — SIL Open Font License 1.1

The bundled fonts remain under the OFL and are **not** relicensed by this project.

- **Kalam** — Copyright (c) 2014 Indian Type Foundry (info@indiantypefoundry.com)
- **Caveat** — Copyright 2014 The Caveat Project Authors
  (https://github.com/googlefonts/caveat)

Both are packaged by [Fontsource](https://fontsource.org). The full OFL-1.1 text ships
with each package (`node_modules/@fontsource/{kalam,caveat}/LICENSE`) and is available
at <https://openfontlicense.org>.

Under the OFL these fonts may be bundled and redistributed with software, but may not
be sold on their own, and any derivative font must remain under the OFL.

---

## Runtime dependencies

Fetched by your package manager rather than redistributed here, listed for completeness.

| Component | Version | License | Copyright |
| --- | --- | --- | --- |
| [playwright-core](https://playwright.dev) | 1.62.1 | Apache-2.0 | Microsoft Corporation |
| [chokidar](https://github.com/paulmillr/chokidar) | 4.0.3 | MIT | Copyright (c) 2012 Paul Miller, Elan Shanker |
| [fast-glob](https://github.com/mrmlnc/fast-glob) | 3.3.3 | MIT | Copyright (c) Denis Malinochkin |
| [jiti](https://github.com/unjs/jiti) | 2.7.0 | MIT | Copyright (c) Pooya Parsa |

The Apache License 2.0 is at <https://www.apache.org/licenses/LICENSE-2.0>.
The MIT text above applies to the MIT-licensed entries here.

---

## Icon and logo assets — trademarks

**A copyright license grants no trademark rights.** The AGPL covering this project does
not, and cannot, give you permission to use the marks below. They are included so that
diagrams can depict the systems they describe; using them remains subject to each
owner's brand policy, and neither this project nor its license grants any endorsement,
affiliation, or sponsorship.

### AWS Architecture Icons

`apps/studio/public/library/aws/`, `aws-resources/`, `aws-groups/`, `aws-categories/`
contain icons from the AWS Architecture Icons asset package, regenerated by
`scripts/build-aws-pack.mjs` (which pins the release URL it downloads).

Amazon Web Services, AWS, and the AWS service names and logos are trademarks of
Amazon.com, Inc. or its affiliates. Their use here is governed by the terms distributed
inside the AWS asset package and by the
[AWS Trademark Guidelines](https://aws.amazon.com/trademark-guidelines/), **not** by
this project's license. Consult those terms before redistributing this package or
building a product on it.

### Vendor logos ("tech" pack)

`apps/studio/public/library/tech/` holds logos normalised onto a common tile by
`scripts/build-tech-pack.mjs`. **These marks are modified** — rescaled and placed on a
64×64 background — which many brand policies restrict. Sources:

| Mark | Source | Owner |
| --- | --- | --- |
| Temporal | [simple-icons](https://github.com/simple-icons/simple-icons) (CC0-1.0 repository) | Temporal Technologies Inc. |
| NATS | [cncf/artwork](https://github.com/cncf/artwork) | The Linux Foundation / CNCF |
| StarRocks | [StarRocks/starrocks](https://github.com/StarRocks/starrocks) | StarRocks / The Linux Foundation |

simple-icons places its *repository* under CC0-1.0 but expressly disclaims any
trademark rights in the marks it distributes. CNCF artwork is subject to the
[Linux Foundation Trademark Usage Guidelines](https://www.linuxfoundation.org/legal/trademark-usage).
