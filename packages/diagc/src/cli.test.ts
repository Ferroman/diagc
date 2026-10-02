import { describe, expect, it } from 'vitest';
import { BadFlagValueError, HelpRequested, UnknownFlagError, diffOutDir, parseArgs, parseRange } from './cli';

describe('parseArgs', () => {
  it('parses init with a name, --type and --agents, in any order', () => {
    expect(parseArgs(['init'])).toMatchObject({ command: 'init', files: [], agents: false });
    expect(parseArgs(['init', 'shop', '--type', 'c4', '--agents'])).toMatchObject({ command: 'init', files: ['shop'], type: 'c4', agents: true });
    expect(parseArgs(['--agents', 'init'])).toMatchObject({ command: 'init', agents: true });
    expect(parseArgs(['compile'])).not.toHaveProperty('type');
  });

  it('refuses --type without a value', () => {
    expect(() => parseArgs(['init', '--type'])).toThrow(BadFlagValueError);
    expect(() => parseArgs(['init', '--type', '--agents'])).toThrow(/--type: needs a diagram type/);
  });

  it('parses guide with and without a topic', () => {
    expect(parseArgs(['guide'])).toMatchObject({ command: 'guide', files: [] });
    expect(parseArgs(['guide', 'c4'])).toMatchObject({ command: 'guide', files: ['c4'] });
  });

  it('parses command, files and flags', () => {
    const args = parseArgs(['compile', 'a.diagram.ts', 'b.diagram.ts', '--out', 'dist', '--no-images']);
    expect(args).toEqual({
      command: 'compile',
      files: ['a.diagram.ts', 'b.diagram.ts'],
      out: 'dist',
      outGiven: true,
      images: false,
      updateIncludes: false,
      json: false,
      agents: false,
    });
  });

  it('defaults the command to compile and imaginary flags defaults', () => {
    expect(parseArgs([])).toEqual({
      command: 'compile',
      files: [],
      out: '.diagrams/.artifacts',
      outGiven: false,
      images: true,
      updateIncludes: false,
      json: false,
      agents: false,
    });
  });

  it('parses lint --json', () => {
    expect(parseArgs(['lint', 'a.diagram.ts', '--json'])).toMatchObject({ command: 'lint', files: ['a.diagram.ts'], json: true });
  });

  it('parses --update-includes', () => {
    expect(parseArgs(['compile', '--update-includes'])).toMatchObject({ command: 'compile', updateIncludes: true });
    expect(parseArgs(['compile'])).toMatchObject({ updateIncludes: false });
  });

  it('throws UnknownFlagError on an unrecognized flag instead of silently ignoring it', () => {
    expect(() => parseArgs(['--bogus'])).toThrowError(UnknownFlagError);
    expect(() => parseArgs(['publish', '--nope'])).toThrowError(UnknownFlagError);
  });

  it('throws HelpRequested for --help / -h anywhere in argv', () => {
    expect(() => parseArgs(['--help'])).toThrowError(HelpRequested);
    expect(() => parseArgs(['watch', '-h'])).toThrowError(HelpRequested);
    expect(() => parseArgs(['compile', 'a.diagram.ts', '--help'])).toThrowError(HelpRequested);
  });

  it('treats the second positional as the file once the command is set', () => {
    expect(parseArgs(['compile', 'a-b.diagram.ts']).files).toEqual(['a-b.diagram.ts']);
  });

  it('parses eject with a diagram name', () => {
    expect(parseArgs(['eject', 'shop'])).toMatchObject({ command: 'eject', files: ['shop'] });
  });

  it('parses --link', () => {
    expect(parseArgs(['publish', '--link', 'https://github.com/o/r']).link).toBe('https://github.com/o/r');
    expect(parseArgs(['publish']).link).toBeUndefined();
  });

  it('throws BadFlagValueError for a --link that is missing or not an http(s) URL', () => {
    expect(() => parseArgs(['publish', '--link'])).toThrowError(BadFlagValueError);
    expect(() => parseArgs(['publish', '--link', 'javascript:alert(1)'])).toThrowError(BadFlagValueError);
    // the next flag is not a value: it must not be swallowed as one
    expect(() => parseArgs(['publish', '--link', '--no-images'])).toThrowError(BadFlagValueError);
  });
});

describe('diff arguments', () => {
  it('takes the range and the diagram names as files, and notes an explicit --out', () => {
    expect(parseArgs(['diff', 'v1..v2', 'shop'])).toMatchObject({ command: 'diff', files: ['v1..v2', 'shop'], outGiven: false });
    expect(parseArgs(['diff', 'v1', '--out', 'x'])).toMatchObject({ out: 'x', outGiven: true });
  });

  it('takes --labels and an --image-url template, and refuses malformed ones', () => {
    expect(parseArgs(['diff', 'a..b', '--labels', 'main, #12', '--image-url', 'https://x/{path}?raw=true'])).toMatchObject({
      labels: ['main', '#12'],
      imageUrl: 'https://x/{path}?raw=true',
    });
    expect(() => parseArgs(['diff', 'a', '--labels', 'main'])).toThrow(BadFlagValueError);
    expect(() => parseArgs(['diff', 'a', '--image-url', 'https://x/'])).toThrow('{path}');
  });

  it('reads A..B as a range and a lone ref as against the working tree', () => {
    expect(parseRange('v1.0..v2.0')).toEqual({ from: 'v1.0', to: 'v2.0' });
    expect(parseRange('HEAD~3')).toEqual({ from: 'HEAD~3' });
    expect(() => parseRange('v1..')).toThrow('is not a range');
    expect(() => parseRange('v1...v2')).toThrow('is not a range');
  });

  it('names the output directory after the range', () => {
    expect(diffOutDir('v1.0', 'feature/x')).toBe('.diagrams/diff/v1.0..feature-x');
    expect(diffOutDir('HEAD~3', undefined)).toBe('.diagrams/diff/HEAD-3..working-tree');
  });
});
