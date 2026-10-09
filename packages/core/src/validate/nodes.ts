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
  for (const n of ctx.model.nodes) {
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

function checkId(ctx: Ctx, node: DiagramNode): void {
  const { issues, nodeIds } = ctx;
  if (nodeIds.has(node.id)) report(issues, 'duplicate-node', `Duplicate node id '${node.id}'`, node.id);
  nodeIds.add(node.id);
  if (node.id === RESERVED_NODE_ID) {
    report(issues, 'reserved-node-id', `Node id '${node.id}' is reserved for the layout root`, node.id);
  }
}

function checkStyle({ issues }: Ctx, node: DiagramNode): void {
  if (node.color !== undefined && typeof node.color !== 'string') {
    report(issues, 'invalid-style', `Node '${node.id}' has invalid color '${String(node.color)}'`, node.id);
  }
  if (node.textColor !== undefined && typeof node.textColor !== 'string') {
    report(issues, 'invalid-style', `Node '${node.id}' has invalid textColor '${String(node.textColor)}'`, node.id);
  }
  if (node.technology !== undefined && typeof node.technology !== 'string') {
    report(issues, 'invalid-style', `Node '${node.id}' has invalid technology '${String(node.technology)}'`, node.id);
  }
}

/** rich runs, alignment and font scale */
function checkText({ issues }: Ctx, node: DiagramNode): void {
  if (node.rich !== undefined) {
    const bad =
      !Array.isArray(node.rich) ||
      node.rich.some((r) => {
        const run = r as TextRun;
        return (
          r === null ||
          typeof r !== 'object' ||
          typeof run.text !== 'string' ||
          (run.bold !== undefined && typeof run.bold !== 'boolean') ||
          (run.italic !== undefined && typeof run.italic !== 'boolean')
        );
      });
    if (bad) report(issues, 'invalid-rich', `Node '${node.id}' has invalid rich text`, node.id);
  }
  if (node.textAlign !== undefined && !(TEXT_ALIGNS as readonly string[]).includes(node.textAlign)) {
    report(issues, 'invalid-align', `Node '${node.id}' has invalid textAlign '${String(node.textAlign)}'`, node.id);
  }
  if (node.fontScale !== undefined && !(FONT_SCALES as readonly string[]).includes(node.fontScale)) {
    report(
      issues,
      'invalid-font-scale',
      `Node '${node.id}' has invalid fontScale '${String(node.fontScale)}'`,
      node.id,
    );
  }
}

/** image and shape refs, and the link */
function checkRefs({ issues }: Ctx, node: DiagramNode): void {
  if (
    node.image !== undefined &&
    (typeof node.image !== 'string' || !(IMAGE_REF.test(node.image) || LIBRARY_IMAGE_REF.test(node.image)))
  ) {
    report(issues, 'invalid-image', `Node '${node.id}' has invalid image ref '${String(node.image)}'`, node.id);
  }
  if (
    node.shape !== undefined &&
    (typeof node.shape !== 'string' || !(IMAGE_REF.test(node.shape) || LIBRARY_IMAGE_REF.test(node.shape)))
  ) {
    report(issues, 'invalid-shape', `Node '${node.id}' has invalid shape ref '${String(node.shape)}'`, node.id);
  }
  if (node.link !== undefined && (typeof node.link !== 'string' || node.link.trim() === '')) {
    report(issues, 'invalid-link', `Node '${node.id}' has invalid link`, node.id);
  }
}

/** `keys` maps each key to the first node that declared it */
function checkKey({ issues }: Ctx, node: DiagramNode, keys: Map<string, string>): void {
  if (node.key === undefined) return;
  if (typeof node.key !== 'string' || !KEY_PATTERN.test(node.key)) {
    report(issues, 'invalid-key', `Node '${node.id}' has invalid key '${String(node.key)}'`, node.id);
  } else if (keys.has(node.key)) {
    report(
      issues,
      'duplicate-key',
      `Nodes '${keys.get(node.key) ?? ''}' and '${node.id}' share key '${node.key}' in one diagram`,
      node.id,
    );
  } else {
    keys.set(node.key, node.id);
  }
}

function checkInclude({ issues }: Ctx, node: DiagramNode): void {
  if (node.include !== undefined && (typeof node.include !== 'string' || node.include === '')) {
    report(issues, 'invalid-include', `Node '${node.id}' has invalid include '${String(node.include)}'`, node.id);
  }
  if (node.includePlane !== undefined) {
    if (typeof node.includePlane !== 'string' || node.includePlane === '') {
      report(
        issues,
        'invalid-include',
        `Node '${node.id}' has invalid includePlane '${String(node.includePlane)}'`,
        node.id,
      );
    } else if (node.include === undefined) {
      report(issues, 'invalid-include', `Node '${node.id}' has includePlane without include`, node.id);
    }
  }
  if (node.includePlanes !== undefined) {
    if (typeof node.includePlanes !== 'boolean') {
      report(
        issues,
        'invalid-include',
        `Node '${node.id}' has invalid includePlanes '${String(node.includePlanes)}'`,
        node.id,
      );
    } else if (node.include === undefined) {
      report(issues, 'invalid-include', `Node '${node.id}' has includePlanes without include`, node.id);
    }
  }
}

/** node.plane must reference a declared plane; node.layer a declared layer */
function checkMembership(ctx: Ctx, node: DiagramNode): void {
  const { issues } = ctx;
  if (node.plane !== undefined && !ctx.planeIds.has(node.plane)) {
    report(issues, 'unknown-plane', `Node '${node.id}' belongs to unknown plane '${node.plane}'`, node.id);
  }
  if (node.layer !== undefined && !ctx.layerIds.has(node.layer)) {
    report(issues, 'unknown-layer', `Node '${node.id}' references unknown layer '${node.layer}'`, node.id);
  }
}

function checkColumns(ctx: Ctx, node: DiagramNode): void {
  const { issues } = ctx;
  if (node.columns === undefined) return;
  if (!Array.isArray(node.columns)) {
    report(issues, 'invalid-columns', `Node '${node.id}' columns must be a list`, node.id);
    return;
  }
  const seen = new Set<string>();
  for (const c of node.columns) {
    if (c === null || typeof c !== 'object' || typeof (c as { name?: unknown }).name !== 'string') {
      report(issues, 'invalid-columns', `Node '${node.id}' has an invalid column`, node.id);
      continue;
    }
    if (seen.has(c.name)) {
      report(issues, 'duplicate-column', `Node '${node.id}' has duplicate column '${c.name}'`, node.id);
    }
    seen.add(c.name);
    if (c.layer !== undefined && !ctx.layerIds.has(c.layer)) {
      report(issues, 'unknown-layer', `Column '${node.id}.${c.name}' references unknown layer '${c.layer}'`, node.id);
    }
  }
}
