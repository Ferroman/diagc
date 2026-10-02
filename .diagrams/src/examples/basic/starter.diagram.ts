import { model } from '@diagc/core';

// A starter: a customer and one system holding two services and a database.
// `contains` nests, `relate` draws an arrow. The system rests folded, with the
// arrows into it bundled, until you double-click it.
const m = model('shop', { name: 'Shop' });

const customer = m.node('customer', { type: 'person', name: 'Customer' });
const shop = m.node('shop', { type: 'system', name: 'Shop' });

const web = m.node('web', { type: 'service', name: 'Storefront' });
const api = m.node('api', { type: 'service', name: 'Orders API' });
const db = m.node('orders-db', { type: 'database', name: 'Orders DB' });

shop.contains(web, api, db);

m.relate(customer, web, { kind: 'sync', label: 'Browses' });
m.relate(web, api, { kind: 'sync', label: 'Places orders' });
m.relate(api, db, { kind: 'writes', label: 'Order rows' });

export default m;
