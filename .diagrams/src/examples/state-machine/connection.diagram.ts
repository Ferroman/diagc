import { model } from '@diagc/core';

const m = model('ex-state-machine-connection', { name: 'A connection that reconnects' });

const conn = m.stateMachine('connection', {
  name: 'Connection',
  description: 'A client connection to a realtime server: it retries with backoff, and gives up after five attempts.',
});

const offline = conn.state('offline', 'Offline');
const connecting = conn.state('connecting', 'Connecting', { entry: 'attempt++', do: 'open socket' });
const open = conn.state('open', 'Open', { entry: 'attempt := 0' });
const backoff = conn.state('backoff', 'Backoff', { entry: 'start timer(2^attempt s)' });
const retry = conn.choice('retry');
const closed = conn.final();

// Open is a plain composite: a request in flight makes it Busy.
const idle = open.state('idle', 'Idle');
const busy = open.state('busy', 'Busy');
open.initial().to(idle);
idle.to(busy, { trigger: 'send', effect: 'write frame' });
busy.to(idle, { trigger: 'reply' });
// A heartbeat does not leave the state it runs in.
idle.on('ping', { effect: 'pong' });

conn.initial().to(offline);
conn.transition(offline, connecting, { trigger: 'connect' });
conn.transition(connecting, open, { trigger: 'handshake ok' });
conn.transition(connecting, retry, { trigger: 'error' });
conn.transition(open, retry, { trigger: 'socket lost' });
conn.transition(retry, backoff, { guard: 'attempt < 5' });
conn.transition(retry, offline, { guard: 'else', effect: 'report' });
conn.transition(backoff, connecting, { trigger: 'timer' });
conn.transition(open, closed, { trigger: 'close', effect: 'send goodbye' });

export default m;
