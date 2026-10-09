import { FONT_SCALES, TEXT_ALIGNS, type DiagramNode, type TextRun } from '../types';
import { RESERVED_NODE_ID } from '../shared-constants';
import { report, type Ctx } from './context';

/** content-hashed asset filename shape (hex hash + extension); shared with the
 * studio dev middleware's asset naming (`apps/studio/vite-plugins/handlers.ts`) */
export const IMAGE_REF = /^[a-z0-9]+\.(png|jpe?g|svg|webp|gif)$/;
/** Bundled library icons served verbatim from apps/studio/public/library/<pack>/.
 * A fixed, traversal-free namespace (never passed to readAsset, which uses IMAGE_REF). */
export const LIBRARY_IMAGE_REF = /^\/library\/[a-z0-9-]+\/[a-z0-9-]+\.(png|jpe?g|svg|webp|gif)$/;

/** shared-identity keys are slugs; also the composed id of a merged node */
export const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Per-node checks: duplicate ids, style scalars, rich runs, aligns/scale, image
 * & shape refs, keys, include, table columns. Builds the shared node-key/id maps. */
export function validateNodes(ctx: Ctx): void {
  const keys = new Map<string, string>(); // key -> first declaring node id
  for (const n of ctx.m.nodes) {
    checkId(ctx, n);
    checkStyle(ctx, n);
    checkText(ctx, n);
    checkRefs(ctx, n);
    checkKey(ctx, n, keys);
    checkInclude(ctx, n);
    checkMembership(ctx, n);
    checkColumns(ctx, n);
  }
}

function checkId(ctx: Ctx, n: DiagramNode): void {
  const { issues, nodeIds } = ctx;
  if (nodeIds.has(n.id)) report(issues, 'duplicate-node', `Duplicate node id '${n.id}'`, n.id);
  nodeIds.add(n.id);
  if (n.id === RESERVED_NODE_ID) {
    report(issues, 'reserved-node-id', `Node id '${n.id}' is reserved for the layout root`, n.id);
  }
}

function checkStyle({ issues }: Ctx, n: DiagramNode): void {
  if (n.color !== undefined && typeof n.color !== 'string') {
    report(issues, 'invalid-style', `Node '${n.id}' has invalid color '${String(n.color)}'`, n.id);
  }
  if (n.textColor !== undefined && typeof n.textColor !== 'string') {
    report(issues, 'invalid-style', `Node '${n.id}' has invalid textColor '${String(n.textColor)}'`, n.id);
  }
  if (n.technology !== undefined && typeof n.technology !== 'string') {
    report(issues, 'invalid-style', `Node '${n.id}' has invalid technology '${String(n.technology)}'`, n.id);
  }
}

/** rich runs, alignment and font scale */
function checkText({ issues }: Ctx, n: DiagramNode): void {
  if (n.rich !== undefined) {
    const bad =
      !Array.isArray(n.rich) ||
      n.rich.some((r) => {
        const run = r as TextRun;
        return (
          r === null ||
          typeof r !== 'object' ||
          typeof run.text !== 'string' ||
          (run.bold !== undefined && typeof run.bold !== 'boolean') ||
          (run.italic !== undefined && typeof run.italic !== 'boolean')
        );
      });
    if (bad) report(issues, 'invalid-rich', `Node '${n.id}' has invalid rich text`, n.id);
  }
  if (n.textAlign !== undefined && !(TEXT_ALIGNS as readonly string[]).includes(n.textAlign)) {
    report(issues, 'invalid-align', `Node '${n.id}' has invalid textAlign '${String(n.textAlign)}'`, n.id);
  }
  if (n.fontScale !== undefined && !(FONT_SCALES as readonly string[]).includes(n.fontScale)) {
    report(issues, 'invalid-font-scale', `Node '${n.id}' has invalid fontScale '${String(n.fontScale)}'`, n.id);
  }
}

/** image and shape refs, and the link */
function checkRefs({ issues }: Ctx, n: DiagramNode): void {
  if (
    n.image !== undefined &&
    (typeof n.image !== 'string' || !(IMAGE_REF.test(n.image) || LIBRARY_IMAGE_REF.test(n.image)))
  ) {
    report(issues, 'invalid-image', `Node '${n.id}' has invalid image ref '${String(n.image)}'`, n.id);
  }
  if (
    n.shape !== undefined &&
    (typeof n.shape !== 'string' || !(IMAGE_REF.test(n.shape) || LIBRARY_IMAGE_REF.test(n.shape)))
  ) {
    report(issues, 'invalid-shape', `Node '${n.id}' has invalid shape ref '${String(n.shape)}'`, n.id);
  }
  if (n.link !== undefined && (typeof n.link !== 'string' || n.link.trim() === '')) {
    report(issues, 'invalid-link', `Node '${n.id}' has invalid link`, n.id);
  }
}

/** `keys` maps each key to the first node that declared it */
function checkKey({ issues }: Ctx, n: DiagramNode, keys: Map<string, string>): void {
  if (n.key === undefined) return;
  if (typeof n.key !== 'string' || !KEY_PATTERN.test(n.key)) {
    report(issues, 'invalid-key', `Node '${n.id}' has invalid key '${String(n.key)}'`, n.id);
  } else if (keys.has(n.key)) {
    report(
      issues,
      'duplicate-key',
      `Nodes '${keys.get(n.key) ?? ''}' and '${n.id}' share key '${n.key}' in one diagram`,
      n.id,
    );
  } else {
    keys.set(n.key, n.id);
  }
}

function checkInclude({ issues }: Ctx, n: DiagramNode): void {
  if (n.include !== undefined && (typeof n.include !== 'string' || n.include === '')) {
    report(issues, 'invalid-include', `Node '${n.id}' has invalid include '${String(n.include)}'`, n.id);
  }
  if (n.includePlane !== undefined) {
    if (typeof n.includePlane !== 'string' || n.includePlane === '') {
      report(issues, 'invalid-include', `Node '${n.id}' has invalid includePlane '${String(n.includePlane)}'`, n.id);
    } else if (n.include === undefined) {
      report(issues, 'invalid-include', `Node '${n.id}' has includePlane without include`, n.id);
    }
  }
  if (n.includePlanes !== undefined) {
    if (typeof n.includePlanes !== 'boolean') {
      report(issues, 'invalid-include', `Node '${n.id}' has invalid includePlanes '${String(n.includePlanes)}'`, n.id);
    } else if (n.include === undefined) {
      report(issues, 'invalid-include', `Node '${n.id}' has includePlanes without include`, n.id);
    }
  }
}

/** node.plane must reference a declared plane; node.layer a declared layer */
function checkMembership(ctx: Ctx, n: DiagramNode): void {
  const { issues } = ctx;
  if (n.plane !== undefined && !ctx.planeIds.has(n.plane)) {
    report(issues, 'unknown-plane', `Node '${n.id}' belongs to unknown plane '${n.plane}'`, n.id);
  }
  if (n.layer !== undefined && !ctx.layerIds.has(n.layer)) {
    report(issues, 'unknown-layer', `Node '${n.id}' references unknown layer '${n.layer}'`, n.id);
  }
}

function checkColumns(ctx: Ctx, n: DiagramNode): void {
  const { issues } = ctx;
  if (n.columns === undefined) return;
  if (!Array.isArray(n.columns)) {
    report(issues, 'invalid-columns', `Node '${n.id}' columns must be a list`, n.id);
    return;
  }
  const seen = new Set<string>();
  for (const c of n.columns) {
    if (c === null || typeof c !== 'object' || typeof (c as { name?: unknown }).name !== 'string') {
      report(issues, 'invalid-columns', `Node '${n.id}' has an invalid column`, n.id);
      continue;
    }
    if (seen.has(c.name)) {
      report(issues, 'duplicate-column', `Node '${n.id}' has duplicate column '${c.name}'`, n.id);
    }
    seen.add(c.name);
    if (c.layer !== undefined && !ctx.layerIds.has(c.layer)) {
      report(issues, 'unknown-layer', `Column '${n.id}.${c.name}' references unknown layer '${c.layer}'`, n.id);
    }
  }
}
