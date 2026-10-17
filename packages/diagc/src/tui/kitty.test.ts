import { randomBytes } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { graphicsOf, hear, imageChange, OVERVIEW_IMAGE, TERMINAL_QUERY, type FrameImage } from './kitty';

// eslint-disable-next-line no-control-regex -- the protocol's commands are what is read
const COMMAND = /\x1b_G([^;]*);([^\x1b]*)\x1b\\/g;

/** Each graphics command: its keys, and its payload. */
const commands = (text: string): { keys: Record<string, string>; payload: string }[] =>
  [...text.matchAll(COMMAND)].map((m) => ({
    keys: Object.fromEntries(m[1]!.split(',').map((kv) => kv.split('=') as [string, string])),
    payload: m[2]!,
  }));

const image = (rgba: Uint8Array, place = { x: 70, y: 20, width: 3, height: 2 }): FrameImage => ({
  place,
  width: rgba.length / 4,
  height: 1,
  rgba,
});

describe('TERMINAL_QUERY', () => {
  it('asks for the text colour, the cell’s size and whether images show, in that order', () => {
    expect(TERMINAL_QUERY).toBe('\x1b]10;?\x1b\\\x1b[16t\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\');
  });
});

describe('what the terminal said', () => {
  it('is no images until the terminal says it shows them', () => {
    expect(graphicsOf({})).toBeUndefined();
    expect(graphicsOf(hear({}, { kind: 'graphics', ok: false }))).toBeUndefined();
  });

  it('is its cell size and text colour, with stand-ins for what it did not say', () => {
    let heard = hear({}, { kind: 'text-color', rgb: [1, 2, 3] });
    heard = hear(heard, { kind: 'cell-size', width: 9, height: 18 });
    heard = hear(heard, { kind: 'graphics', ok: true });
    expect(graphicsOf(heard)).toEqual({ cell: { width: 9, height: 18 }, ink: [1, 2, 3] });
    // a terminal that does not know its cell's pixels says 0
    const vague = hear(hear({}, { kind: 'cell-size', width: 0, height: 0 }), { kind: 'graphics', ok: true });
    expect(graphicsOf(vague)).toEqual({ cell: { width: 10, height: 20 }, ink: [128, 128, 128] });
  });
});

describe('imageChange', () => {
  const rgba = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  it('puts a new image at its place, compressed, the cursor left where it was', () => {
    const text = imageChange(undefined, image(rgba));
    expect(text.startsWith('\x1b[21;71H')).toBe(true);
    const [command] = commands(text);
    expect(command!.keys).toEqual({
      a: 'T',
      f: '32',
      o: 'z',
      s: '2',
      v: '1',
      c: '3',
      r: '2',
      i: String(OVERVIEW_IMAGE),
      p: '1',
      C: '1',
      q: '2',
      m: '0',
    });
    expect([...inflateSync(Buffer.from(command!.payload, 'base64'))]).toEqual([...rgba]);
  });

  it('sends a big image in chunks of at most 4096 bytes, the rest of it to follow on all but the last', () => {
    const noise = new Uint8Array(randomBytes(20_000));
    const sent = commands(imageChange(undefined, image(noise)));
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.every((c) => c.payload.length <= 4096 && c.payload.length % 4 === 0)).toBe(true);
    expect(sent.map((c) => c.keys.m)).toEqual([...Array(sent.length - 1).fill('1'), '0']);
    expect(Object.keys(sent[1]!.keys)).toEqual(['q', 'm']);
    const joined = Buffer.from(sent.map((c) => c.payload).join(''), 'base64');
    expect(inflateSync(joined).equals(Buffer.from(noise))).toBe(true);
  });

  it('sends nothing for the image already there', () => {
    expect(imageChange(image(rgba), image(new Uint8Array(rgba)))).toBe('');
    expect(imageChange(undefined, undefined)).toBe('');
  });

  it('sends the image again when it or its place changes', () => {
    expect(commands(imageChange(image(rgba), image(new Uint8Array(8))))[0]!.keys.a).toBe('T');
    const moved = image(rgba, { x: 0, y: 0, width: 3, height: 2 });
    expect(imageChange(image(rgba), moved).startsWith('\x1b[1;1H\x1b_Ga=T')).toBe(true);
  });

  it('deletes the image, data and all, once there is none', () => {
    expect(imageChange(image(rgba), undefined)).toBe(`\x1b_Ga=d,d=I,i=${OVERVIEW_IMAGE},q=2\x1b\\`);
  });
});
