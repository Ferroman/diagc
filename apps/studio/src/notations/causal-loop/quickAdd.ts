import { childrenOf, containmentOn, containmentPlaneOf } from '@diagc/core/internal';
import type { QuickAddRecipes } from '../../canvas-editing/quickAddRecipe';

/** A causal-loop group carries no `+` (the renderer hangs none on it, and Tab
 * offers what `+` does): the notation draws an open one as a bare name tag and
 * arranges its members itself, so "add a connected node" would have nowhere to
 * put the result. Every other node gets the generic sibling. */
export const causalLoopQuickAdd: QuickAddRecipes = ({ model, source, ctx }) =>
  childrenOf(containmentOn(model, containmentPlaneOf(model, ctx.plane))).has(source.id) ? 'none' : undefined;
