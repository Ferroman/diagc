# Fishbone

A cause-and-effect diagram: one effect at the head of a fish, categories of cause as bones, and causes and sub-causes hanging off them. Reach for it in a postmortem, when you ask why something already happened.

{{starter}}

## How it works

- `m.fishbone(id, name?, opts?)` declares the diagram and its effect, the fish's head. It throws if called twice. `opts` takes `description` and `color` for the effect, and `plane` / `planeName` to keep the fish beside other views of the model.
- `fb.categories('Software')` seeds a preset of bones and returns them keyed by slug id (`people`, `infrastructure`). A key is read with `!`: `people!.cause(…)`.
- The presets are `Software` (People, Process, Requirements, Code, Infrastructure, Dependencies), `6M` (Man, Machine, Method, Material, Measurement, Environment) and `4S` (Surroundings, Suppliers, Systems, Skills).
- `fb.category(id, name?, opts?)` adds one bone by hand. `opts` takes `description` and `color`.
- `category.cause(id, name?, opts?)` hangs a cause on a bone. `cause.cause(id, name?, opts?)` hangs a sub-cause on a cause. Each call returns the new cause, so calls chain.
- The layout is the notation's own: nothing on the fish is placed by hand. Bones alternate above and below the spine in declaration order.

## Node types

{{node-types}}

You never write these types yourself: the builder creates them. A cause and a sub-cause share one type, and where the node hangs says which it is.

## Rules

- A sub-cause cannot have a cause of its own: three levels below the effect is the limit. The builder throws on the fourth. Hand-written JSON fails with `fb-too-deep`.
- One effect per diagram. The builder cannot make a second one; hand-written JSON with two `fb-effect` nodes fails with `fb-many-effects`.
- Fishbone nodes take no containment (`fb-contained`). The builder never adds any; only a hand-written `node.contains(…)` call or JSON can.
- A cause that does not reach the effect is a warning (`fb-unattached`), not an error. It draws in a row under the fish.
- A category must hang on the effect and a cause on a category or another cause. Anything else fails with `fb-misplaced`. The builder wires these correctly.
