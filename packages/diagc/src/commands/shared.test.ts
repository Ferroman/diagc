import { describe, expect, it } from 'vitest';
import { captureIo } from '../../test-fixtures/cli';
import { warnNoSources } from './shared';

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
