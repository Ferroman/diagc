import { describe, expect, it } from 'vitest';
import { argsOf, captureIo, contextFor } from '../../test-fixtures/cli';
import type { CliIo } from '../cli/io';
import { guide } from './guide';

describe('guide', () => {
  it('writes the page on stdout as one plain write', async () => {
    const writes: string[] = [];
    const io: CliIo = { ...captureIo(), write: (text) => void writes.push(text) };
    expect(await guide.run(argsOf(), contextFor(io))).toBe(0);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/^# Writing diagc diagrams\n[^]*[^\n]\n$/);
  });

  it('writes one topic', async () => {
    const io = captureIo();
    expect(await guide.run(argsOf(['c4']), contextFor(io))).toBe(0);
    expect(io.stdout).toMatch(/^# .*C4/);
    expect(io.stderr).toBe('');
  });

  it('refuses an unknown topic, or two, on stderr with exit 1', async () => {
    const unknown = captureIo();
    expect(await guide.run(argsOf(['nope']), contextFor(unknown))).toBe(1);
    expect([unknown.stdout, unknown.stderr]).toEqual([
      '',
      "diagc: No guide topic 'nope'. Topics: all, activity, c4, causal-loop, deployment, er, fishbone, git-graph, plan, second-order, threat-model\n",
    ]);
    const two = captureIo();
    expect(await guide.run(argsOf(['a', 'b']), contextFor(two))).toBe(1);
    expect(two.stderr).toBe("diagc: guide takes one topic, got 2 — run it once per topic, or 'diagc guide all'.\n");
  });
});
