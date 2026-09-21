import { model } from '@diagc/core';

const m = model('expense-approval', { name: 'Expense approval' });

const act = m.activity('claim', { name: 'Expense claim' });
const finance = act.lane('finance', { name: 'Finance', color: '#3caea3' });

const start = finance.start();
const check = finance.action('check-receipts', 'Check the receipts');
const withinPolicy = finance.decision('within-policy');
const reimburse = finance.action('reimburse', 'Reimburse the claim');
const end = finance.end();

// A guard is just a relation label.
act
  .flow(start, check)
  .flow(check, withinPolicy)
  .flow(withinPolicy, reimburse, '[within policy]')
  .flow(withinPolicy, end, '[over the limit]')
  .flow(reimburse, end);

export default m;
