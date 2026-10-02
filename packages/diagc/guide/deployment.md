# Deployment

Where software runs: the environments, regions, networks and subnets around it, and the services, databases and load balancers inside them. Reach for it to show how a system is reached and what fails together.

{{starter}}

## How it works

- `m.notation('deployment')` declares the diagram. It needs no builder call of its own: every element is an `m.node` with a `deploy-*` type.
- Zones are groups, built with `contains`: an environment, a region, an availability zone, a network, a public or private subnet, a cluster, a host. They nest, outermost first.
- What a box sits inside is the information. A private subnet says how a service is reached, an availability zone what it fails with.
- The nodes inside the zones are a service, database, queue, storage, load balancer, gateway or firewall. `deploy-internet` is the outside: the internet, or any network you do not own.
- A connection is `m.relate(a, b, { kind: 'network', label })`. The label is the port or protocol: `'HTTPS 443'`.
- `technology` joins the type's subtitle under a node's name: `technology: 'Postgres'` on a `deploy-database` prints `[Database: Postgres]`. A zone's header shows only its icon and name.

## Node types

{{node-types}}

The zones are `deploy-environment`, `deploy-region`, `deploy-zone`, `deploy-network`, `deploy-subnet-public`, `deploy-subnet-private`, `deploy-cluster` and `deploy-host` (a host is a leaf when nothing is drawn inside it); the other eight are nodes.

## Rules

- Draw the zones that carry meaning, such as a private subnet or an availability zone. Do not add a box that tells the reader nothing.
- Use `kind: 'network'` for every connection. A kind outside the registry draws as a plain arrow and raises the `unknown-kind` lint warning.
- Pick the type from the list above. An unlisted `type` draws as a plain box and raises the `unknown-type` lint warning.
- The notation adds no validation codes of its own, so nothing checks that a node sits in the right zone. Put each one in the zone it really runs in.
- A zone's own `color` replaces the notation's colour for its type; leave it unset.
