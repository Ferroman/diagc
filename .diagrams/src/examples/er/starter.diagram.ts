import { model } from '@diagc/core';

const m = model('library-loans', { name: 'Library loans' });

const members = m.table('members', {
  columns: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'email', type: 'text' },
    { name: 'joined_on', type: 'date' },
  ],
});

const loans = m.table('loans', {
  columns: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'member_id', type: 'uuid', fk: true },
    { name: 'due_on', type: 'date' },
  ],
});

m.fk(loans, 'member_id', members);

export default m;
