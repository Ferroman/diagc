# Activity

A UML activity diagram: swimlanes of actions, decisions, forks and joins, and signals between actors. Reach for it to show who does what in a workflow.

{{starter}}

## How it works

- `m.activity(id, { name })` declares a frame. Call it again for another frame: each call is one frame, and several share a canvas. It needs no `m.notation` call.
- `act.lane(id, { name, color })` adds a lane to the frame. Lanes are drawn top to bottom in the order you declare them.
- Elements are created on a lane and return a handle you can wire up: `.action(id, name)`, `.decision(id?, name?)`, `.bar(id?)` for a fork or join, `.start(id?)`, `.end(id?)`, `.send(id, name)`, `.receive(id, name)`, `.object(id, name)` and `.note(id, text)`.
- `lane.region(id?, name?)` adds an interruptible region inside a lane. It takes the same element methods, but not another `region`.
- `act.flow(from, to, label?)` draws control flow. `act.objectFlow` draws a dashed arrow for data. `act.interrupt` leaves a region. `act.noteLink(note, target)` ties a note to what it annotates. Each returns `act`, so they chain.
- A guard is a label: `act.flow(decision, next, '[approved]')`.

## Node types

{{node-types}}

The builder creates all of these: use the method that matches the shape you want, not `m.node`.

## Rules

- A frame's children must be lanes, or validation fails with `activity-frame-children`.
- A lane must sit in a frame (`activity-lane-parent`). A region must sit in a lane if it sits in anything (`activity-region-parent`). The builder already does this.
- Bars, start and end ignore `color`.
- Nothing checks the flow itself: a fork that never joins, or a decision with one exit, is accepted.
