// What the builder hands back for a node, and the option types its methods share.
import type {
  Column,
  Comment,
  EdgeLabel,
  FontScale,
  Link,
  Polarity,
  RelationStyle,
  TextAlign,
  TextRun,
  Threat,
} from '../types';
import type { ModelBuilder } from './model-builder';

export interface NodeOpts {
  type?: string;
  name?: string;
  icon?: string;
  /** silhouette-mask ref (see DiagramNode.shape) */
  shape?: string;
  /** image ref for image-typed nodes (see DiagramNode.image) */
  image?: string;
  /** fill/accent color (see DiagramNode.color) */
  color?: string;
  /** label color override (see DiagramNode.textColor) */
  textColor?: string;
  /** implementation technology (see DiagramNode.technology) */
  technology?: string;
  /** navigation target (see DiagramNode.link) */
  link?: string;
  description?: string;
  /** rich-text label runs (see DiagramNode.rich) */
  rich?: TextRun[];
  /** label alignment (see DiagramNode.textAlign) */
  textAlign?: TextAlign;
  /** label size step (see DiagramNode.fontScale) */
  fontScale?: FontScale;
  metadata?: Record<string, unknown>;
  /** cross-diagram identity (see DiagramNode.key) */
  key?: string;
  /** compose another diagram's content under this node (see DiagramNode.include) */
  include?: string;
  /** structure plane to graft from the include (see DiagramNode.includePlane) */
  includePlane?: string;
  /** carry the include's planes over (see DiagramNode.includePlanes) */
  includePlanes?: boolean;
  /** restrict this node to a single plane (see DiagramNode.plane) */
  plane?: string;
  /** transparent-sheet membership (see DiagramNode.layer) */
  layer?: string;
  /** ER-table rows (see DiagramNode.columns) */
  columns?: Column[];
  /** STRIDE findings (see DiagramNode.threats) */
  threats?: Threat[];
  /** remarks shown in this node's bubble (see DiagramNode.comments) */
  comments?: Comment[];
  /** resources this node points at, listed in its bubble (see DiagramNode.links) */
  links?: Link[];
}

export interface RelateOpts {
  kind: string;
  /** explicit relation id; when omitted the builder synthesizes `${from}->${to}#${n}`.
   * The pair counter advances either way, so a later un-id'd relation on the same
   * pair gets the same suffix it would have gotten without the override. */
  id?: string;
  label?: string;
  /** positioned edge labels (see DiagramRelation.labels) */
  labels?: EdgeLabel[];
  style?: RelationStyle;
  description?: string;
  layer?: string;
  polarity?: Polarity;
  delay?: boolean;
  /** FK column on the source table (see DiagramRelation.fromColumn) */
  fromColumn?: string;
  /** referenced column on the target table (see DiagramRelation.toColumn) */
  toColumn?: string;
  /** STRIDE findings (see DiagramRelation.threats) */
  threats?: Threat[];
  /** remarks shown in this relation's bubble (see DiagramRelation.comments) */
  comments?: Comment[];
}

/** A threat as authored: the id is synthesized (`t1`, `t2`, …) unless given. */
export type ThreatOpts = Omit<Threat, 'id'> & { id?: string };

/** A comment as authored: the id is synthesized (`c1`, `c2`, …) unless given. */
export interface CommentOpts {
  id?: string;
  by?: string;
  at?: string;
}

export interface ContainsOpts {
  /** plane the containment belongs to; defaults to the model's first-declared plane */
  plane?: string;
}

export class NodeRef {
  constructor(
    readonly id: string,
    private readonly builder: ModelBuilder,
  ) {}

  /** children, optionally followed by a trailing `{ plane }` options object */
  contains(...args: (NodeRef | ContainsOpts)[]): this {
    const last = args[args.length - 1];
    const opts = last !== undefined && !(last instanceof NodeRef) ? last : undefined;
    for (const child of args) {
      if (child instanceof NodeRef) this.builder.addContainment(this.id, child.id, opts?.plane);
    }
    return this;
  }

  /** A STRIDE finding against this element. On every node ref, not just the
   * threat-model ones: threat-modelling an existing C4 or ER diagram annotates
   * the nodes it already has. */
  threat(opts: ThreatOpts): this {
    this.builder.addThreat({ node: this.id }, opts);
    return this;
  }

  /** A remark on this element, shown in its bubble. */
  comment(text: string, opts: CommentOpts = {}): this {
    this.builder.addComment({ node: this.id }, text, opts);
    return this;
  }

  /** A resource this element points at, listed in its bubble. */
  link(label: string, url: string): this {
    this.builder.addLink(this.id, { label, url });
    return this;
  }
}

/** A DFD element's node options, minus the two its helper already supplies:
 * `type` from the helper itself, `name` from its second argument. */
export type ElementOpts = Omit<NodeOpts, 'type' | 'name'>;
