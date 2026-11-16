import { model } from '@diagc/core';

// The studio's edit session as its Quint spec defines it: `var mode: str` holds
// "viewing" | "loading" | "editing", each `action` that assigns `mode` is a
// transition, the action's `if` is its guard and its updates are its effect.
// The actions that keep `mode` are internal transitions of the state they run in.
const m = model('docs-state-machine', { name: 'State machine: the studio edit session, from its Quint spec' });

const client = m.stateMachine('client', { name: 'Edit session' });

const viewing = client.state('viewing', 'Viewing');
const loading = client.state('loading', 'Loading');
const editing = client.state('editing', 'Editing', { exit: 'flush draft' });
const loaded = client.choice('loaded');

client.initial().to(viewing);

client.transition(viewing, loading, { trigger: 'requestEdit', guard: 'owns d', effect: 'send load' });
client.transition(loading, loaded, { trigger: 'receiveLoad' });
client.transition(loaded, editing, { guard: 'ok', effect: 'openSession' });
client.transition(loaded, viewing, { guard: 'else', effect: 'show loadFailed' });
client.transition(loading, viewing, { trigger: 'selectDiagram' });
client.transition(editing, viewing, { trigger: 'leaveEdit' });
client.transition(editing, viewing, { trigger: 'reloadPage', guard: 'clean and idle' });

editing.on('validEdit', { effect: 'push undo' });
editing.on('undo', { effect: 'pop undo' });
editing.on('autosaveFires', { guard: 'dirty', effect: 'startSave' });

export default m;
