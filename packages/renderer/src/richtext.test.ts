// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { editorHtmlToRuns, runsToDisplay, runsToEditorHtml, plainText } from './richtext';

const parse = (html: string) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return editorHtmlToRuns(el);
};

describe('runsToEditorHtml', () => {
  it('wraps bold/italic and turns \\n into <br>', () => {
    expect(runsToEditorHtml([{ text: 'a\nb', bold: true }])).toBe('<b>a<br>b</b>');
    expect(runsToEditorHtml([{ text: 'x', italic: true }])).toBe('<i>x</i>');
  });
  it('escapes html', () => {
    expect(runsToEditorHtml([{ text: '<x>' }])).toBe('&lt;x&gt;');
  });
});

describe('editorHtmlToRuns', () => {
  it('reads bold/italic ancestors', () => {
    expect(parse('Hi <b>there</b>')).toEqual([{ text: 'Hi ' }, { text: 'there', bold: true }]);
  });
  it('maps <br> to a newline', () => {
    expect(parse('a<br>b')).toEqual([{ text: 'a\nb' }]);
  });
  it('treats <strong>/<em> like <b>/<i>', () => {
    expect(parse('<strong><em>z</em></strong>')).toEqual([{ text: 'z', bold: true, italic: true }]);
  });
  it('inserts a newline between block-level divs', () => {
    expect(parse('a<div>b</div>')).toEqual([{ text: 'a\nb' }]);
  });
  it('reads CSS font-weight/font-style spans as marks', () => {
    expect(parse('<span style="font-weight: bold">a</span>')).toEqual([{ text: 'a', bold: true }]);
    expect(parse('<span style="font-weight: 700">b</span>')).toEqual([{ text: 'b', bold: true }]);
    expect(parse('<span style="font-style: italic">c</span>')).toEqual([{ text: 'c', italic: true }]);
  });
  it('lets an explicit font-weight:normal turn bold back off (execCommand toggle)', () => {
    expect(parse('<b><span style="font-weight: normal">x</span></b>')).toEqual([{ text: 'x' }]);
  });
  it('round-trips through editor html', () => {
    const runs = [{ text: 'Web ' }, { text: 'Server', bold: true }, { text: '\nx', italic: true }];
    const el = document.createElement('div');
    el.innerHTML = runsToEditorHtml(runs);
    expect(editorHtmlToRuns(el)).toEqual(runs);
  });
});

describe('runsToDisplay / plainText', () => {
  it('projects runs to display rows and plain text', () => {
    expect(runsToDisplay([{ text: 'a', bold: true }])).toEqual([{ key: 0, text: 'a', bold: true, italic: false }]);
    expect(plainText([{ text: 'a' }, { text: 'b' }])).toBe('ab');
  });
});
