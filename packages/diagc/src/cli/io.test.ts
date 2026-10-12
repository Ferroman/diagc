import { afterEach, describe, expect, it, vi } from 'vitest';
import { processIo } from './io';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('processIo', () => {
  it('writes a line through console.log and console.error, and text through stdout as it is', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    processIo.out('a');
    processIo.err('b');
    processIo.write('c\n');
    expect([log.mock.calls, error.mock.calls, write.mock.calls]).toEqual([[['a']], [['b']], [['c\n']]]);
  });
});
