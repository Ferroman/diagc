import { NodeRef } from '../../builder/node-ref';
import type { ModelBuilder } from '../../builder/model-builder';
import { defined } from '../../util';
import { GIT_STAGE_TYPE } from './git-graph';

export interface CommitOpts {
  /** default `${branchId}-${n}`, n = this branch's 1-based commit count */
  id?: string;
  /** the label drawn above the circle; absent = untagged (name '') */
  tag?: string;
  /** start a new segment branched off this commit (on another branch) — no
   * `commit` link from the lane's previous commit */
  from?: CommitRef;
  /** empty columns to leave before this commit (`metadata.gap`) */
  gap?: number;
  color?: string;
}
export type MergeOpts = Omit<CommitOpts, 'from'>;

export class CommitRef extends NodeRef {
  constructor(
    id: string,
    builder: ModelBuilder,
    readonly branch: BranchRef,
  ) {
    super(id, builder);
  }
}

/** One lane of a git graph. `commit()` chains from the lane's last commit; `merge()`
 * adds a commit that absorbs another lane's. Both hand back CommitRefs, which are
 * NodeRefs — relate them, layer them, describe them like any node. */
export class BranchRef extends NodeRef {
  private count = 0;
  private latest: CommitRef | undefined;
  constructor(
    id: string,
    private readonly m: ModelBuilder,
  ) {
    super(id, m);
  }

  commit(tagOrOpts: string | CommitOpts = {}): CommitRef {
    const opts: CommitOpts = typeof tagOrOpts === 'string' ? { tag: tagOrOpts } : tagOrOpts;
    if (opts.from !== undefined && opts.from.branch === this) {
      throw new Error(
        `branch '${this.id}': use commit() to continue a lane — 'from' must name a commit on another branch`,
      );
    }
    const prev = this.latest;
    const c = this.create(opts);
    if (opts.from !== undefined) this.m.relate(opts.from, c, { kind: 'branch' });
    else if (prev !== undefined) this.m.relate(prev, c, { kind: 'commit' });
    return c;
  }

  merge(src: CommitRef, opts: MergeOpts = {}): CommitRef {
    if (src.branch === this) throw new Error(`branch '${this.id}': cannot merge a lane into itself`);
    const prev = this.latest;
    const c = this.create(opts);
    this.m.relate(src, c, { kind: 'merge' });
    if (prev !== undefined) this.m.relate(prev, c, { kind: 'commit' });
    return c;
  }

  private create(opts: MergeOpts): CommitRef {
    this.count += 1;
    const id = opts.id ?? `${this.id}-${this.count}`;
    this.m.node(id, {
      type: 'commit',
      name: opts.tag ?? '',
      ...defined({ color: opts.color }),
      ...(opts.gap !== undefined && opts.gap > 0 ? { metadata: { gap: opts.gap } } : {}),
    });
    this.m.addContainment(this.id, id);
    const ref = new CommitRef(id, this.m, this);
    this.latest = ref;
    return ref;
  }
}

export interface StageOpts {
  /** the label drawn at the top of the frame; defaults to the id */
  name?: string;
  /** the commit whose column the frame starts at */
  from: CommitRef;
  /** the commit whose column it ends at (inclusive); defaults to `from` */
  to?: CommitRef;
  color?: string;
}

export class GitGraphBuilder {
  constructor(private readonly m: ModelBuilder) {}
  /** A named frame across every lane, spanning the columns of `from`…`to` —
   * a phase of the history ("Development", "Release candidates"). Declare it
   * after the commits it names. */
  stage(id: string, opts: StageOpts): NodeRef {
    return this.m.node(id, {
      type: GIT_STAGE_TYPE,
      ...defined({ name: opts.name, color: opts.color }),
      metadata: { from: opts.from.id, ...(opts.to !== undefined ? { to: opts.to.id } : {}) },
    });
  }
  /** lanes are drawn top-to-bottom in the order they are declared */
  branch(id: string, opts: { name?: string; color?: string } = {}): BranchRef {
    this.m.node(id, {
      type: 'branch',
      ...defined({ name: opts.name, color: opts.color }),
    });
    return new BranchRef(id, this.m);
  }
}
