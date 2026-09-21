import { model } from '@diagc/core';

const m = model('ex-fishbone-checkout-latency', { name: 'Checkout latency at peak' });
const fb = m.fishbone('latency', 'Checkout p95 over 5s at peak', {
  description: 'SLO is 2s p95; this held for about 40 minutes during Friday peak traffic.',
});

// Hand-made bones: this team's postmortems split causes by system boundary,
// not the generic Software preset the docs figure already shows.
const database = fb.category('database', 'Database');
const network = fb.category('network', 'Network');
const application = fb.category('application', 'Application');
const thirdParty = fb.category('third-party', 'Third-party', {
  color: '#b45309',
  description: 'Anything we call but do not operate.',
});

database
  .cause('missing-index', 'No index on orders.customer_id', {
    description: 'Query planner had been doing a full scan for weeks before this surfaced it.',
  })
  .cause('scan', 'Sequential scan under load');
database.cause('pool', 'Pool sized for average, not peak');

network
  .cause('cross-region', 'Fraud check hits another region')
  .cause('handshake', 'New TLS handshake per request');
network.cause('dns', 'DNS cache expired mid-peak', {
  description: 'Every request paid for a fresh lookup once the cache emptied.',
});

application
  .cause('serial-rules', 'Validates promo rules serially')
  .cause('refetch', 'Each rule re-fetches the cart');
application.cause('sync-check', 'Blocks on sync inventory check');

thirdParty
  .cause('gateway-retries', 'Gateway SDK retries, no backoff', {
    description: 'Three attempts, no backoff between them.',
  })
  .cause('vendor-outage', 'Retries masked a partial outage');
thirdParty.cause('fraud-latency', 'Fraud API p99 spikes past 3s');

export default m;
