# ER

Entity-relationship diagram: each table is a titled box listing its columns and types, with primary and foreign keys marked. Reach for it to show how a schema is keyed.

{{starter}}

## How it works

- `m.table(id, { name, columns })` declares a table. `name` defaults to the id. A column is `{ name, type, pk?, fk? }`; `type` is free text and may be left out.
- `m.fk(from, fromColumn, to, toColumn?, opts?)` draws a foreign key from one row to another, from the referencing column to the referenced one.
- `toColumn` defaults to the target's single primary-key column. `m.fk` throws when you leave it out and the target has no primary key or several. Declare the target table, with its key, before the call, or name `toColumn`.
- `m.fk` does not set `fk: true` on the source column. That flag only prints the `FK` marker; set it on the column yourself.
- It needs no `m.notation` call. A table is an ordinary node, so `contains` groups tables, for example into a schema or a bounded context, like any other nodes.

## Node types

{{node-types}}

`m.table` creates the one type, so an author never writes it.

## Rules

- Two columns in one table with the same name fail validation (`duplicate-column`).
- A relation whose `fromColumn` or `toColumn` names no column on its table fails with `unknown-column`.
- A column can carry a `layer`, and the row shows only while that layer is on. Give the `fk` relation the same layer, or its edge floats to the table's middle. A layer goes in the fifth argument, `{ layer }`, so name `toColumn` too: `m.fk(orders, 'created_by', users, 'id', { layer: 'audit' })`. The layer must be declared with `m.layer`, or validation fails with `unknown-layer`.
