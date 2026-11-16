import { model } from '@diagc/core';

const m = model('order-lifecycle', { name: 'Order lifecycle' });

const order = m.stateMachine('order', { name: 'Order' });

const draft = order.state('draft', 'Draft');
const paid = order.state('paid', 'Paid', { entry: 'reserveStock', exit: 'releaseHold' });
const fulfil = order.state('fulfil', 'Fulfilment');
const inStock = order.choice('in-stock');
const done = order.final();

// Two regions make Fulfilment orthogonal: both run at once.
const pick = fulfil.region('pick', 'Picking');
const bill = fulfil.region('bill', 'Billing');
pick.initial().to(pick.state('picking', 'Picking'));
pick.history();
bill.initial().to(bill.state('invoicing', 'Invoicing'));

order.initial().to(draft);
order.transition(draft, paid, { trigger: 'pay', guard: 'total > 0', effect: 'charge' });
order.transition(paid, inStock);
order.transition(inStock, fulfil, { guard: 'in stock' });
order.transition(inStock, draft, { guard: 'else' });
order.transition(fulfil, done, { trigger: 'deliver' });

// An internal transition: the state is not left.
paid.on('remind', { guard: 'overdue', effect: 'email' });

export default m;
