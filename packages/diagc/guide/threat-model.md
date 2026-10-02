# Threat model

A STRIDE data-flow diagram: the entities, processes and data stores a system moves data between, the flows between them, and the trust boundaries those flows cross. Reach for it to review what an attacker could still do, and to keep the findings with the picture.

{{starter}}

## How it works

- `m.threatModel(opts?)` declares the diagram. It throws if called twice. `opts` takes `plane` and `name`: `plane` puts it on a plane of its own, and `name` names that plane. Without a `plane` the whole model is the threat model and `name` is ignored.
- `tm.entity(id, name?)` is something outside the system, `tm.process(id, name?)` something the system does with the data, `tm.store(id, name?)` where the data rests. `tm.boundary(id, name?)` is a trust boundary. Each returns an ordinary node handle.
- A boundary is a group: `boundary.contains(a, b)`. Which boundaries a flow crosses is worked out from that containment; you never declare a crossing.
- `tm.flow(from, to, labelOrOpts?)` is one data flow, from the source of the data to its destination. A string is its label. A request and its response are two flows.
- `.threat({ category, title, severity?, status?, mitigation?, description?, id? })` records a finding on an element or on a flow, and chains. `category` is one of `S` Spoofing, `T` Tampering, `R` Repudiation, `I` Information disclosure, `D` Denial of service, `E` Elevation of privilege. `severity` is `low`, `medium`, `high` or `critical`; unset it is unrated, shown as `—`. `status` is `open`, `mitigated`, `accepted` or `not-applicable`; unset it means `open`.
- The published page lists every threat in a table under the picture: element, the boundaries it crosses, category, title, severity, status and mitigation.

## Node types

{{node-types}}

You never write these types yourself: the four `tm.` helpers set them, and `tm-boundary` is the one you nest the other three in.

## Rules

- Record the threats the person you are drawing it for names. Do not invent threats to fill the table; a flow or element with none is fine.
- A flow joins two elements, never a boundary. `tm.flow` does not stop you, but a `data-flow` relation that starts or ends on a `tm-boundary` fails validation with `tm-flow-boundary`.
- Use `data-flow` (what `tm.flow` writes). A relation of another kind still counts as a crossing and still carries threats, but it is not checked for `tm-flow-boundary`.
- A threat needs a `title` (`threat-title`) and a `category` from `S T R I D E` (`threat-category`). A `severity` or `status` outside the lists above fails with `threat-severity` or `threat-status`. The types allow only the listed values; JSON can still write others.
- A threat `id` defaults to `t1`, `t2`, … on its own element. The builder throws on a repeated `id` on one element; hand-written JSON fails with `threat-id`.
