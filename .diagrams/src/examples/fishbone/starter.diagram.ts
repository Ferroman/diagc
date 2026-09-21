import { model } from '@diagc/core';

const m = model('checkout-outage', { name: 'Checkout outage' });
const fb = m.fishbone('outage', 'Checkout outage on release day');
const { people, process, code } = fb.categories('Software');

people!.cause('on-call', 'On-call engineer new to checkout');
process!.cause('no-freeze', 'No change freeze on release day');
code!.cause('migration', 'Untested schema migration').cause('no-fixture', 'No fixture with real order data');

export default m;
