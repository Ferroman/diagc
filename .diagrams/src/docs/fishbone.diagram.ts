import { model } from '@diagc/core';

const m = model('docs-fishbone', { name: 'Fishbone: checkout outage on release day' });
const fb = m.fishbone('outage', 'Checkout outage on release day');
const { people, process, requirements, code, infrastructure, dependencies } = fb.categories('Software');

people!.cause('on-call', 'On-call engineer new to checkout');
people!.cause('handoff', 'No handoff before the release').cause('timezone', 'Team split across time zones');

process!.cause('no-freeze', 'No change freeze on release day');
process!.cause('review', 'Migration merged without review').cause('single-approver', 'One approver for the whole repo');

requirements!.cause('edge-case', 'Discount stacking never specified');

code!.cause('migration', 'Untested schema migration').cause('no-fixture', 'No fixture with real order data');
code!.cause('retry', 'Retries without a backoff');

infrastructure!.cause('pool', 'Connection pool sized for last year');
infrastructure!.cause('autoscale', 'Autoscaling lagged the traffic spike').cause('metric', 'Scaling on CPU, not queue depth');

dependencies!.cause('psp', 'Payment provider rate-limited us');

export default m;
