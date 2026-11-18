import { model } from '@diagc/core';

const m = model('ex-state-machine-zones', { name: 'A refund in three phases' });

const refund = m.stateMachine('refund', {
  name: 'Refund request',
  description: 'A refund request from the customer to the bank. Zones show its phases, colours how each state is going.',
});

// A zone is where states are drawn: the machine reads straight through it.
const review = refund.zone('review', '1. Review', { note: 'Support decides on the request' });
const pay = refund.zone('pay', '2. Pay', { note: 'The bank moves the money' });
const closed = refund.zone('closed', '3. Closed', { note: 'Nothing more happens' });

const submitted = review.state('submitted', 'Submitted');
const inReview = review.state('in-review', 'In review', { kind: 'waiting', do: 'check the order' });

const approved = pay.state('approved', 'Approved');
const paying = pay.state('paying', 'Paying', { kind: 'waiting', entry: 'send to bank' });
const payFailed = pay.state('pay-failed', 'Payment failed', { kind: 'failed' });

const refunded = closed.state('refunded', 'Refunded', { kind: 'ok' });
const rejected = closed.state('rejected', 'Rejected', { kind: 'failed' });

review.initial().to(submitted);
refund.transition(submitted, inReview, { trigger: 'assign' });
refund.transition(inReview, approved, { trigger: 'approve' });
refund.transition(inReview, rejected, { trigger: 'reject', effect: 'tell the customer' });
refund.transition(approved, paying, { trigger: 'pay out' });
refund.transition(paying, refunded, { trigger: 'bank confirms' });
refund.transition(paying, payFailed, { trigger: 'bank refuses' });
refund.transition(payFailed, paying, { trigger: 'retry', guard: 'attempts < 3' });
refund.transition(payFailed, rejected, { trigger: 'give up', guard: 'attempts = 3' });

export default m;
