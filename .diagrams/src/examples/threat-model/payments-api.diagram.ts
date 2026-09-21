import { model } from '@diagc/core';

// A payments API: a merchant-facing charge endpoint that tokenizes cards
// before they ever reach the ledger, and settles with the card network
// out of band.
const m = model('ex-threat-model-payments-api', { name: 'Payments API' });
const tm = m.threatModel();

const merchant = tm.entity('merchant', 'Merchant');
const cardNetwork = tm.entity('card-network', 'Card network');

const chargeApi = tm.process('charge-api', 'Charge API');
const tokenization = tm.process('tokenization', 'Tokenization service');
const ledger = tm.process('ledger', 'Ledger service');

const tokenVault = tm.store('token-vault', 'Token vault');
const ledgerDb = tm.store('ledger-db', 'Ledger DB');

tm.boundary('internet-facing', 'DMZ').contains(chargeApi);

// Tokenization and the vault get their own boundary, nested inside the
// internal network — the smallest slice of the system that ever touches a PAN.
const pci = tm.boundary('pci-enclave', 'PCI enclave').contains(tokenization, tokenVault);
tm.boundary('internal-network', 'Internal').contains(ledger, ledgerDb, pci);

tm.flow(merchant, chargeApi, 'HTTPS: charge request').threat({
  category: 'T',
  title: 'Charge amount tampered before the request signature is checked',
  severity: 'high',
  status: 'mitigated',
  mitigation: 'HMAC request signing verified before processing',
});

// Charge API orchestrates: tokenize the PAN, then charge with the token — two
// sibling calls, not a relay through the vault.
tm.flow(chargeApi, tokenization, 'gRPC: tokenize PAN').threat({
  category: 'I',
  title: 'Raw PAN visible in the gateway access logs',
  severity: 'critical',
  status: 'mitigated',
  mitigation: 'PAN redaction filter added to the logging pipeline',
});
tm.flow(tokenization, tokenVault, 'SQL: store token');
tm.flow(chargeApi, ledger, 'gRPC: charge request');

tm.flow(ledger, ledgerDb, 'SQL: ledger write');
tm.flow(ledger, cardNetwork, 'HTTPS: authorize');
tm.flow(cardNetwork, ledger, 'Webhook: auth result').threat({
  category: 'S',
  title: 'Authorization webhook accepted with no signature check on the payload',
  severity: 'critical',
});

chargeApi.threat({
  category: 'D',
  title: 'No rate limit on /v1/charges, enabling card testing at scale',
  severity: 'high',
});

tokenization.threat({
  category: 'E',
  title: 'Debug endpoint returns the PAN for a token without authentication',
  severity: 'critical',
  status: 'mitigated',
  mitigation: 'Debug endpoint stripped from the production build',
});

tokenVault.threat({
  category: 'I',
  title: 'Vault backups land in the same bucket as application logs',
  severity: 'high',
  status: 'mitigated',
  mitigation: 'Backups redirected to a separate, PCI-scoped encrypted bucket',
});

ledgerDb.threat({
  category: 'R',
  title: 'Ledger rows can be deleted by an app-level admin, breaking the audit trail',
  severity: 'medium',
  status: 'accepted',
});

export default m;
