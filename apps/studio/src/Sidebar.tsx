import { marked } from 'marked';
import type { DiagramModel } from '@diagramming/core';
import type { DiagramSelection } from '@diagramming/renderer';

function MetaTable({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return null;
  return (
    <dl className="meta">
      {entries.map(([key, value]) => (
        <div key={key} className="meta-row">
          <dt>{key}</dt>
          <dd>
            {typeof value === 'string' && /^https?:\/\//.test(value) ? (
              <a href={value} target="_blank" rel="noreferrer">
                {value}
              </a>
            ) : (
              String(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Sidebar({ model, selection }: { model: DiagramModel; selection: DiagramSelection | null }) {
  if (selection === null) {
    return <aside className="sidebar muted">Select a node or edge for details.</aside>;
  }
  if (selection.kind === 'node') {
    const node = model.nodes.find((n) => n.id === selection.id);
    if (!node) return <aside className="sidebar muted">Aggregate node (zoom in for details).</aside>;
    return (
      <aside className="sidebar">
        <h2>{node.name}</h2>
        <p className="muted">
          {node.type} · <code>{node.id}</code>
        </p>
        {node.description !== undefined && (
          <div dangerouslySetInnerHTML={{ __html: marked.parse(node.description) as string }} />
        )}
        {node.metadata !== undefined && <MetaTable metadata={node.metadata} />}
      </aside>
    );
  }
  // edge: DiagramView supplies the aggregated edge's underlying relation ids
  const [pair] = selection.id.split(':');
  const [from, to] = (pair ?? '').split('=>');
  const wanted = new Set(selection.constituentIds ?? []);
  const constituents = model.relations.filter((r) => wanted.has(r.id));
  return (
    <aside className="sidebar">
      <h2>
        {from} → {to}
      </h2>
      {constituents.length === 0 ? (
        <p className="muted">No relation details available.</p>
      ) : (
        <ul>
          {constituents.map((r) => (
            <li key={r.id}>
              <code>{r.from}</code> → <code>{r.to}</code> <b>{r.kind}</b>
              {r.label !== undefined ? ` — ${r.label}` : ''}
              {r.description !== undefined && (
                <div dangerouslySetInnerHTML={{ __html: marked.parse(r.description) as string }} />
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
