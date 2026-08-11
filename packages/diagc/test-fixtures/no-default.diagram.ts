import { model } from '@diagramming/core';

// Only named exports, no default. With jiti's `{ default: true }` this resolves
// to the module namespace object, which the shape guard must reject rather than
// writing the namespace out as an artifact.
export const m = model('no-default');
m.node('a', { type: 'service' });
