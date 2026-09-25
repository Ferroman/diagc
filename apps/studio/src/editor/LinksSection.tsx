import { useEffect, useState } from 'react';
import type { EditorCommand, Link } from '@diagc/core';

interface LinksSectionProps {
  nodeId: string;
  links: readonly Link[];
  onCommand: (command: EditorCommand) => void;
}

function LinkRow({ index, link, onChange, onRemove }: { index: number; link: Link; onChange: (l: Link) => void; onRemove: () => void }) {
  const [label, setLabel] = useState(link.label);
  useEffect(() => setLabel(link.label), [link.label]);
  const [url, setUrl] = useState(link.url);
  useEffect(() => setUrl(link.url), [link.url]);
  const commit = () => {
    const next = { label: label.trim(), url: url.trim() };
    // both are required (validation); an emptied box snaps back
    if (next.label === '' || next.url === '') {
      setLabel(link.label);
      setUrl(link.url);
      return;
    }
    if (next.label !== link.label || next.url !== link.url) onChange(next);
  };
  return (
    <div className="link-row">
      <input aria-label={`Link ${index} label`} value={label} onChange={(e) => setLabel(e.target.value)} onBlur={commit} />
      <input aria-label={`Link ${index} url`} value={url} onChange={(e) => setUrl(e.target.value)} onBlur={commit} />
      <button type="button" className="chip icon-btn" aria-label={`Remove link ${index}`} title="Remove link" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

/** The resource links of a node — the whole list travels through one
 * `set-node-details`, `null` when it empties, so a saved file never holds
 * `links: []`. */
export function LinksSection({ nodeId, links, onCommand }: LinksSectionProps) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const write = (next: Link[]) => onCommand({ type: 'set-node-details', id: nodeId, details: { links: next.length === 0 ? null : next } });
  const add = () => {
    const l = { label: label.trim(), url: url.trim() };
    if (l.label === '' || l.url === '') return;
    write([...links, l]);
    setLabel('');
    setUrl('');
  };
  return (
    <section className="panel-section links" aria-label="Links">
      <h3>Links</h3>
      {links.map((l, i) => (
        <LinkRow
          key={i}
          index={i + 1}
          link={l}
          onChange={(next) => write(links.map((x, j) => (j === i ? next : x)))}
          onRemove={() => write(links.filter((_, j) => j !== i))}
        />
      ))}
      <div className="link-add">
        <input aria-label="New link label" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input aria-label="New link url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="button" className="chip" aria-label="Add link" onClick={add} disabled={label.trim() === '' || url.trim() === ''}>
          Add
        </button>
      </div>
    </section>
  );
}
