import { Handle, Position } from '@xyflow/react';
import type { Column } from '@diagramming/core';
import { LinkBadge, QuickAddButton, type DiagramNodeData } from './DiagramNode';
import { TABLE_HEADER_H, TABLE_ROW_H } from './table-ports';

const COMMON_TYPES = ['uuid', 'int', 'bigint', 'text', 'varchar', 'bool', 'timestamp', 'timestamptz', 'jsonb', 'numeric'];
const TYPE_LIST_ID = 'dg-col-types';

const marker = (c: Column): string => (c.pk === true ? '🔑' : c.fk === true ? 'FK' : '');

/** none → pk → fk → none */
const cyclePkFk = (c: Column): Column =>
  c.pk !== true && c.fk !== true
    ? { ...c, pk: true, fk: false }
    : c.pk === true
      ? { ...c, pk: false, fk: true }
      : { ...c, pk: false, fk: false };

const uniqueName = (base: string, taken: Set<string>): string => {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
};

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/** ER table body. Read mode is inert (per-column right-side source handle hidden
 * by CSS). When `onColumnsChange` is wired the rows become editable: PK/FK cycle
 * badge, controlled name/type inputs, ↑/↓ reorder, ✕ delete, and a “+ add column”
 * footer. Inputs are controlled + keyed by index so typing keeps focus. */
export function TableNode({ id, data, selected }: { id: string; data: DiagramNodeData; selected?: boolean }) {
  const columns = data.columns ?? [];
  const onChange = data.onColumnsChange;
  const editing = onChange !== undefined;

  const setAt = (i: number, c: Column) => onChange?.(columns.map((x, j) => (j === i ? c : x)));
  const removeAt = (i: number) => onChange?.(columns.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= columns.length) return;
    const next = columns.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange?.(next);
  };
  const add = () => onChange?.([...columns, { name: uniqueName('column', new Set(columns.map((c) => c.name))), type: '' }]);

  return (
    <div
      className={`dg-node dg-table${editing ? ' dg-table-edit' : ''}`}
      {...(data.color !== undefined ? { style: { borderColor: data.color } } : {})}
    >
      <div className="dg-table-header" style={{ height: TABLE_HEADER_H }}>
        <span className="dg-table-title">{data.label}</span>
      </div>
      <div className="dg-table-body">
        {columns.map((c, i) =>
          editing ? (
            <div key={i} className="dg-table-row dg-table-row-edit" style={{ height: TABLE_ROW_H }}>
              <button type="button" className="dg-table-badge nodrag nopan" title="Cycle none / PK / FK" onPointerDown={stop} onClick={(e) => { stop(e); setAt(i, cyclePkFk(c)); }}>
                {marker(c) === '' ? '○' : marker(c)}
              </button>
              <input className="dg-table-name-input nodrag nopan" aria-label="Column name" value={c.name} onPointerDown={stop} onChange={(e) => setAt(i, { ...c, name: e.target.value })} />
              <input className="dg-table-type-input nodrag nopan" aria-label="Column type" list={TYPE_LIST_ID} value={c.type ?? ''} onPointerDown={stop} onChange={(e) => setAt(i, { ...c, type: e.target.value })} />
              <button type="button" className="dg-table-move nodrag nopan" aria-label="Move up" disabled={i === 0} onPointerDown={stop} onClick={(e) => { stop(e); move(i, -1); }}>↑</button>
              <button type="button" className="dg-table-move nodrag nopan" aria-label="Move down" disabled={i === columns.length - 1} onPointerDown={stop} onClick={(e) => { stop(e); move(i, 1); }}>↓</button>
              <button type="button" className="dg-table-del nodrag nopan" aria-label="Delete column" onPointerDown={stop} onClick={(e) => { stop(e); removeAt(i); }}>✕</button>
              <Handle id={c.name} type="source" position={Position.Right} className="dg-handle dg-row-handle" style={{ top: TABLE_ROW_H / 2 }} />
            </div>
          ) : (
            <div key={c.name} className="dg-table-row" style={{ height: TABLE_ROW_H }}>
              <span className="dg-table-key" aria-hidden="true">{marker(c)}</span>
              <span className={`dg-table-col${c.pk === true ? ' dg-pk' : ''}`}>{c.name}</span>
              {c.type !== undefined && <span className="dg-table-type">{c.type}</span>}
              <Handle id={c.name} type="source" position={Position.Right} className="dg-handle dg-row-handle" style={{ top: TABLE_ROW_H / 2 }} />
            </div>
          ),
        )}
      </div>
      {editing && (
        <>
          <button type="button" className="dg-table-add nodrag nopan" onPointerDown={stop} onClick={(e) => { stop(e); add(); }}>
            ＋ add column
          </button>
          <datalist id={TYPE_LIST_ID}>
            {COMMON_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </>
      )}
      <LinkBadge data={data} />
      <QuickAddButton id={id} data={data} selected={selected} />
    </div>
  );
}
