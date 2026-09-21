import { model } from '@diagc/core';

const m = model('password-reset', { name: 'Password reset flow' });
const tm = m.threatModel();

const customer = tm.entity('customer', 'Customer');
const auth = tm.process('auth', 'Auth service');
tm.boundary('internet-facing', 'DMZ').contains(auth);

tm.flow(customer, auth, 'HTTPS: reset request').threat({
  category: 'I',
  title: 'Reset token leaks to third parties via the Referer header',
  severity: 'medium',
});

export default m;
