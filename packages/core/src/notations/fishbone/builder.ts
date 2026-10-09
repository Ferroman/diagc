import { NodeRef } from '../../builder/node-ref';
import type { ModelBuilder } from '../../builder/model-builder';
import { defined } from '../../util';
import {
  FB_CATEGORY_TYPE,
  FB_CAUSE_OF_KIND,
  FB_CAUSE_TYPE,
  FISHBONE_PRESETS,
  presetId,
  type FishbonePreset,
} from './fishbone';

export interface FishboneOpts {
  description?: string;
  color?: string;
}

/** A cause (level 2) or a sub-cause (level 3). The level rides on the ref so a
 * fourth `.cause()` fails at build time, where the author is, rather than as a
 * validation issue at compile time. */
export class CauseRef extends NodeRef {
  constructor(
    id: string,
    private readonly m: ModelBuilder,
    private readonly level: 2 | 3,
  ) {
    super(id, m);
  }

  /** a sub-cause of this cause, and the arrow from it to here */
  cause(id: string, name?: string, opts: FishboneOpts = {}): CauseRef {
    if (this.level === 3) {
      throw new Error(
        `fishbone: '${id}' would be a fourth level below the effect; three levels (category, cause, sub-cause) is the limit`,
      );
    }
    this.m.node(id, { type: FB_CAUSE_TYPE, ...defined({ name }), ...opts });
    const ref = new CauseRef(id, this.m, 3);
    this.m.relate(ref, this, { kind: FB_CAUSE_OF_KIND });
    return ref;
  }
}

export class CategoryRef extends NodeRef {
  constructor(
    id: string,
    private readonly m: ModelBuilder,
  ) {
    super(id, m);
  }

  /** a cause on this bone, and the arrow from it to here */
  cause(id: string, name?: string, opts: FishboneOpts = {}): CauseRef {
    this.m.node(id, { type: FB_CAUSE_TYPE, ...defined({ name }), ...opts });
    const ref = new CauseRef(id, this.m, 2);
    this.m.relate(ref, this, { kind: FB_CAUSE_OF_KIND });
    return ref;
  }
}

export class FishboneBuilder {
  constructor(
    private readonly m: ModelBuilder,
    private readonly effect: NodeRef,
  ) {}

  /** a major bone, and the arrow from it to the effect */
  category(id: string, name?: string, opts: FishboneOpts = {}): CategoryRef {
    this.m.node(id, { type: FB_CATEGORY_TYPE, ...defined({ name }), ...opts });
    const ref = new CategoryRef(id, this.m);
    this.m.relate(ref, this.effect, { kind: FB_CAUSE_OF_KIND });
    return ref;
  }

  /** the bones of a standard set, keyed by their slug ids (`presetId`) */
  categories(preset: FishbonePreset): Record<string, CategoryRef> {
    return Object.fromEntries(
      FISHBONE_PRESETS[preset].map((name) => {
        const id = presetId(name);
        return [id, this.category(id, name)];
      }),
    );
  }
}
