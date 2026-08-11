import { normalizeRuns, runsToPlainText, type TextRun } from '@diagramming/core';

export const plainText = runsToPlainText;

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** runs → innerHTML for the contentEditable editor (newlines become <br>). */
export function runsToEditorHtml(runs: TextRun[]): string {
  return runs
    .map((r) => {
      let html = r.text.split('\n').map(escapeHtml).join('<br>');
      if (r.italic === true) html = `<i>${html}</i>`;
      if (r.bold === true) html = `<b>${html}</b>`;
      return html;
    })
    .join('');
}

/** Effective bold/italic for an element, from its tag AND inline style. execCommand
 * may emit `<b>`/`<i>` OR CSS spans (`font-weight`/`font-style`), and an explicit
 * `font-weight:normal` must be able to turn a mark back OFF — so style overrides tag. */
function elementMarks(el: HTMLElement, bold: boolean, italic: boolean): { bold: boolean; italic: boolean } {
  const tag = el.tagName.toLowerCase();
  let b = bold || tag === 'b' || tag === 'strong';
  let i = italic || tag === 'i' || tag === 'em';
  const fw = el.style.fontWeight;
  if (fw !== '') {
    const n = Number.parseInt(fw, 10);
    if (fw === 'bold' || fw === 'bolder' || (!Number.isNaN(n) && n >= 600)) b = true;
    else if (fw === 'normal' || fw === 'lighter' || (!Number.isNaN(n) && n < 600)) b = false;
  }
  const fs = el.style.fontStyle;
  if (fs === 'italic' || fs === 'oblique') i = true;
  else if (fs === 'normal') i = false;
  return { bold: b, italic: i };
}

/** Parse a contentEditable subtree into normalized runs. The parser — not the
 * editor markup — is the commit source of truth, so it tolerates whatever
 * execCommand/paste produced (<b>/<strong>, <i>/<em>, CSS font-weight/style spans,
 * <br>, block <div>/<p>). */
export function editorHtmlToRuns(root: HTMLElement): TextRun[] {
  const runs: TextRun[] = [];
  const push = (text: string, bold: boolean, italic: boolean) =>
    runs.push({ text, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}) });
  const walk = (node: Node, bold: boolean, italic: boolean) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        push(child.textContent ?? '', bold, italic);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === 'br') {
          push('\n', bold, italic);
        } else {
          if ((tag === 'div' || tag === 'p') && runs.length > 0) runs.push({ text: '\n' });
          const m = elementMarks(el, bold, italic);
          walk(el, m.bold, m.italic);
        }
      }
    }
  };
  walk(root, false, false);
  return normalizeRuns(runs);
}

export function runsToDisplay(runs: TextRun[]): { key: number; text: string; bold: boolean; italic: boolean }[] {
  return runs.map((r, i) => ({ key: i, text: r.text, bold: r.bold === true, italic: r.italic === true }));
}
