import { describe, expect, it } from 'vitest';
import { BadFlagValueError, HelpRequested, UnknownFlagError, parseArgs } from './cli';

describe('parseArgs', () => {
  it('parses command, files and flags', () => {
    const args = parseArgs(['compile', 'a.diagram.ts', 'b.diagram.ts', '--out', 'dist', '--no-images']);
    expect(args).toEqual({
      command: 'compile',
      files: ['a.diagram.ts', 'b.diagram.ts'],
      out: 'dist',
      images: false,
      updateIncludes: false,
    });
  });

  it('defaults the command to compile and imaginary flags defaults', () => {
    expect(parseArgs([])).toEqual({
      command: 'compile',
      files: [],
      out: '.diagrams/.artifacts',
      images: true,
      updateIncludes: false,
    });
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
