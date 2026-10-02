# Git graph

A branching history: one lane per branch, commits along it, and the branch-offs and merges drawn between lanes. Reach for it to explain a release train or a branching strategy.

{{starter}}

## How it works

- `m.gitGraph()` declares the diagram. It creates the model's first plane, so it throws if a plane already exists or if you call it twice.
- `g.branch(id, { name, color })` adds a lane. Lanes are drawn top to bottom in the order you declare them.
- `branch.commit('v1.0')` adds a commit after the lane's previous one. The string is its tag; with no tag the commit is a plain circle.
- `branch.commit({ from: otherCommit })` starts a run branched off a commit on another lane. It throws if `from` is on the same lane. `commit({ tag, gap: n })` leaves `n` empty columns before the commit.
- `branch.merge(src, { tag })` adds a commit that absorbs the commit `src` from another lane. It throws if `src` is on the same lane.
- `g.stage(id, { name, from, to })` frames a span of columns across every lane. `to` defaults to `from`. Declare it after the commits it names.
- Columns are worked out from the links: a commit sits one column after everything it follows, branches from or merges. Do not try to place commits.

## Node types

{{node-types}}

The builder creates all three, so an author never writes them.

## Rules

- A commit with more than one incoming `commit` link, or more than one incoming `branch` link, fails validation (`git-parents`). The builder cannot produce this; hand-written relations can.
- A `commit` link must stay in one lane, and `branch` and `merge` links must cross lanes (`git-commit-lane`). The two throws above guard this.
- A stage whose `from` or `to` is not a commit fails with `git-stage-span`.
- `gap` must be a non-negative whole number (`git-gap`). The builder drops a `gap` of zero or less.
