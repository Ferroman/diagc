import { model } from '@diagc/core';

const m = model('require-2fa', { name: 'Requiring two-factor authentication' });
const so = m.secondOrder();

const decision = so.decision('mandate-2fa', 'Require 2FA for every login');

const fewerBreaches = decision.then('fewer-breaches', 'Account takeovers drop', { valence: '+' });
const lockouts = decision.then('lockouts', 'Support is flooded with lockout tickets', { valence: '-' });

fewerBreaches.then('trust', 'Customers trust the product more', { valence: '+' });
lockouts.then('contractor', 'Support hires a contractor to keep up', { valence: '-' });

export default m;
