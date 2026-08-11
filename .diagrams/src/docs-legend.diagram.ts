import { model } from '@diagramming/core';

const m = model('docs-legend', { name: 'Legend example' });

m.layer('data-flow', { name: 'Data flow', tint: '#0ea5e9' });

const shop = m.node('shop', { type: 'system', name: 'Shop' });
const web = m.node('web', { type: 'service', name: 'Storefront' });
const api = m.node('api', { type: 'service', name: 'Orders API' });
const db = m.node('db', { type: 'database', name: 'Orders DB', color: '#f59e0b' });

shop.contains(web, api, db);
m.relate(web, api, { kind: 'sync' });
m.relate(api, db, { kind: 'writes' });
m.relate(web, db, { kind: 'flow', layer: 'data-flow' });

// A plane that presets the overlay, so the exported PNG shows the layer row on.
m.plane('default', { name: 'Default', layers: ['data-flow'] });

m.legend({
  items: [
    { label: 'Fire-and-forget', kind: 'flow' },
    { label: 'Owned by Payments', color: '#f59e0b' },
  ],
});

export default m;
