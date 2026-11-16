import { model } from '@diagc/core';

const m = model('order-lifecycle', { name: 'Order lifecycle' });

const order = m.stateMachine('order', { name: 'Order' });

const draft = order.state('draft', 'Draft');
const paid = order.state('paid', 'Paid', { entry: 'reserveStock', exit: 'releaseHold' });
const fulfil = order.state('fulfil', 'Fulfilment');
const held = order.state('held', 'On hold');
const inStock = order.choice('in-stock');
const done = order.final();

// Draft is a plain composite: one substate at a time.
const editing = draft.state('editing', 'Editing');
draft.initial().to(editing);
editing.to(draft.state('reviewing', 'Reviewing'), { trigger: 'submit' });

// Two regions make Fulfilment orthogonal: both run at once.
const pick = fulfil.region('pick', 'Picking');
const bill = fulfil.region('bill', 'Billing');
const picking = pick.state('picking', 'Picking');
pick.initial().to(picking);
const resumePicking = pick.history();
bill.initial().to(bill.state('invoicing', 'Invoicing'));

order.initial().to(draft);
order.transition(draft, paid, { trigger: 'pay', guard: 'total > 0', effect: 'charge' });
order.transition(paid, inStock);
order.transition(inStock, fulfil, { guard: 'in stock' });
order.transition(inStock, draft, { guard: 'else' });
order.transition(fulfil, done, { trigger: 'deliver' });

// Resuming enters Picking's history: picking goes on where it was left.
order.transition(picking, held, { trigger: 'hold' });
order.transition(held, resumePicking, { trigger: 'resume' });

// An internal transition: the state is not left.
paid.on('remind', { guard: 'overdue', effect: 'email' });

export default m;
