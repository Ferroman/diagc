import { FB_CAUSE_TYPE, FB_EFFECT_TYPE, fishboneTree, isFishboneNode } from '@diagc/core/internal';
import type { QuickAddRecipes } from '../../canvas-editing/quickAddRecipe';
import { addChild, isSubCause } from './fishboneActions';

/** The fish owns its tree: the effect grows a category, a category or cause a
 * cause, down to the depth addChild allows. A node that is not of its types (a
 * comment on the fish) gets nothing, because the tree would ignore whatever hung
 * on it. */
export const fishboneQuickAdd: QuickAddRecipes = ({ model, source }) => {
  if (!isFishboneNode(source)) return 'none';
  // three levels below the effect is the limit (addChild's rule, read once)
  if (source.type === FB_CAUSE_TYPE && isSubCause(fishboneTree(model), source.id)) return 'none';
  return {
    label: source.type === FB_EFFECT_TYPE ? 'Add a category' : 'Add a cause',
    build: () => {
      const out = addChild(model, source.id);
      return out === null ? undefined : { beside: false, ...out };
    },
  };
};
