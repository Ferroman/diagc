# Plan

A schedule: work as bars on a calendar, with milestones, nesting and the people who own, do and check each piece. Reach for it to show who does what and when.

{{starter}}

## How it works

- `m.plan(id?, opts?)` declares the schedule on a plane of its own (`id` defaults to `plan`; `opts` takes `name`). It throws if called twice. A model that already has other planes can add one, and `zone.contains(...)` then schedules its nodes.
- `plan.zone(id, { name, start, end })` is a bar. Dates are `YYYY-MM-DD` and `end` is inclusive. `color` and the other node options go in the same object.
- `zone.zone(id, { … })` nests a zone inside another; the nested dates must lie inside the parent's.
- `plan.event(id, { name, at })` and `zone.event(id, { name, at })` are single dates, drawn as diamonds. A nested event must fall inside its zone.
- `plan.person(id, name?, opts?)` and `plan.team(id, name?, opts?)` are the actors. `zone.owner(handle)`, `zone.executor(handle)` and `zone.checker(handle)` give one a role on a zone, and chain. A role shows as a chip on the bar, not as an arrow.
- `zone.comment(text, opts?)` and `zone.link(label, url)` chain on a zone. `opts` takes `by`, `at` and `id`.
- The bars are placed from their dates: x is always the date, and rows inside a zone are automatic. Do not place them.

## Node types

{{node-types}}

A person and a team use the plain `person` and `team` types, so they look the same on any diagram.

## Rules

- A zone needs both `start` and `end`, and an event `at`; a missing one fails with `plan-missing`. A date that is not a real `YYYY-MM-DD` day fails with `plan-date`. The builder does not check dates: the types make them required, and validation reports the rest.
- A zone whose `end` is before its `start` fails with `plan-span`.
- A zone or event contained in a zone, on the plan plane, that lies outside that zone's dates fails with `plan-nested`.
- The three role methods always target the zone. A hand-written relation of kind `owns`, `executes` or `checks` whose target is not a `plan-zone` fails with `plan-role-target`; those are the only kinds drawn as chips.
