import { model } from '@diagc/core';

const m = model('ex-causal-loop-tech-debt', { name: 'Technical debt: the shortcut spiral' });
m.notation('causal-loop');

const pressure = m.node('pressure', { name: 'Deadline pressure' });
const shortcuts = m.node('shortcuts', { name: 'Shortcuts merged' });
const debt = m.node('debt', { name: 'Technical debt' });
const speed = m.node('speed', { name: 'Delivery speed' });
const incidents = m.node('incidents', { name: 'Production incidents' });
const cleanup = m.node('cleanup', { name: 'Refactoring time' });

// R — the spiral. Two '-' links, so the signs cancel and the loop reinforces:
// the shortcut that saved a week costs the next deadline two.
m.relate(pressure, shortcuts, { kind: 'influence', polarity: '+' });
m.relate(shortcuts, debt, { kind: 'influence', polarity: '+' });
m.relate(debt, speed, { kind: 'influence', polarity: '-' });
m.relate(speed, pressure, { kind: 'influence', polarity: '-' });

// B — the cleanup you plan. The delay is the whole problem: the budget arrives
// long after the debt does, so the brake is always pulled too late.
m.relate(debt, cleanup, { kind: 'influence', polarity: '+', delay: true });
m.relate(cleanup, debt, { kind: 'influence', polarity: '-' });

// B — the cleanup an outage forces. It is why a system can sit at high debt for
// years without falling over: something breaks, and the time appears.
m.relate(debt, incidents, { kind: 'influence', polarity: '+' });
m.relate(incidents, cleanup, { kind: 'influence', polarity: '+' });

export default m;
