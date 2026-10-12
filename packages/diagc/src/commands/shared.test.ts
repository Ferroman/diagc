import { describe, expect, it } from 'vitest';
import { captureIo } from '../../test-fixtures/cli';
import { diagramNames, warnNoSources } from './shared';

describe('warnNoSources', () => {
  it('says on stderr where it found no diagrams, .diagrams/src by default', () => {
    const io = captureIo();
    warnNoSources(io);
    warnNoSources(io, 'team');
    expect([io.stdout, io.stderr]).toEqual([
      '',
      "No diagrams under .diagrams/src — run 'diagc init' to create one.\n" +
        "No diagrams under team — run 'diagc init' to create one.\n",
    ]);
  });
});

describe('diagramNames', () => {
  it('reads each as eject does, and refuses every one that is no diagram, on stderr', () => {
    const io = captureIo();
    const known = new Set(['shop', 'team/app']);
    expect(diagramNames(io, ['.diagrams/src/shop.diagram.json', 'team/app.diagram.ts'], known)).toEqual([
      'shop',
      'team/app',
    ]);
    expect(diagramNames(io, [], known)).toEqual([]);
    expect(io.stderr).toBe('');
    expect(diagramNames(io, ['nope', 'shop', 'gone'], known)).toBeUndefined();
    expect([io.stdout, io.stderr]).toEqual(['', "diagc: no diagram 'nope'\ndiagc: no diagram 'gone'\n"]);
  });
});
