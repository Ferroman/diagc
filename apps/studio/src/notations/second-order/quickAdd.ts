import { isSecondOrderNode } from '@diagc/core/internal';
import type { QuickAddRecipes } from '../../canvas-editing/quickAddRecipe';
import { thenWhat } from './secondOrderActions';

/** A decision or consequence grows a neutral consequence, the panel's "And then
 * what?"; anything else on the plane gets nothing, as on the fish. */
export const secondOrderQuickAdd: QuickAddRecipes = ({ model, source }) =>
  isSecondOrderNode(source)
    ? {
        label: 'And then what?',
        build: () => {
          const out = thenWhat(model, source.id, '0');
          return out === null ? undefined : { beside: false, ...out };
        },
      }
    : 'none';
