import { useState } from 'react';
import {
  gitGraph,
  latestCommit,
  uniqueNodeId,
  type DiagramModel,
  type DiagramNode,
  type EditorCommand,
} from '@diagramming/core';
import type { DiagramSelection } from '@diagramming/renderer';
import { ColorRow } from './pickers';

interface GitPanelProps {
  model: DiagramModel;
  /** the active plane (undefined = default view = the first plane) */
  plane: string | undefined;
  selection: DiagramSelection | null;
  onCommand: (command: EditorCommand) => void;
  /** select the commit an action just created */
  onSelect: (id: string) => void;
}

/** `${lane}-${n}` with the smallest n not yet taken — the DSL's naming, kept
 * unique even after deletions. */
function nextCommitId(model: DiagramModel, laneId: string): string {
  const taken = new Set(model.nodes.map((n) => n.id));
  for (let n = 1; ; n++) {
    const id = `${laneId}-${n}`;
    if (!taken.has(id)) return id;
  }
}

const parseGap = (raw: string): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/**
 * The git graph's editing surface. Every action that creates a commit is ONE
 * batch — node, containment and links — so it is one undo step and the model
 * never passes through a state validation would refuse (a commit outside a
 * lane, a link to a node that is not there yet).
 */
export function GitPanel({ model, plane, selection, onCommand, onSelect }: GitPanelProps) {
  const g = gitGraph(model, plane);
  const planeId = plane ?? model.planes[0]?.id;
  const parent = (laneId: string) => ({ id: laneId, ...(planeId !== undefined ? { plane: planeId } : {}) });

  const [laneName, setLaneName] = useState('');
  const [laneColor, setLaneColor] = useState('');
  const [commitLane, setCommitLane] = useState<string>('');
  const [tag, setTag] = useState('');
  const [gap, setGap] = useState('0');
  const [branchLane, setBranchLane] = useState('');
  const [mergeLane, setMergeLane] = useState('');
  const [mergeTag, setMergeTag] = useState('');

  const selected: DiagramNode | undefined =
    selection?.kind === 'node' ? model.nodes.find((n) => n.id === selection.id && n.type === 'commit') : undefined;
  const selectedLane = selected !== undefined ? g.laneOf.get(selected.id) : undefined;
  const targetLane = commitLane !== '' ? commitLane : (selectedLane ?? g.lanes[0]?.id ?? '');
  const otherLanes = g.lanes.filter((l) => l.id !== selectedLane);

  const commitNode = (id: string, name: string, gapCount: number): DiagramNode => ({
    id,
    name,
    type: 'commit',
    ...(gapCount > 0 ? { metadata: { gap: gapCount } } : {}),
  });

  const addLane = () => {
    const name = laneName.trim();
    if (name === '') return;
    onCommand({
      type: 'add-node',
      node: { id: uniqueNodeId(model, name), name, type: 'branch', ...(laneColor !== '' ? { color: laneColor } : {}) },
    });
    setLaneName('');
  };

  const addCommit = () => {
    if (targetLane === '') return;
    const id = nextCommitId(model, targetLane);
    const latest = latestCommit(g, targetLane);
    onCommand({
      type: 'batch',
      commands: [
        { type: 'add-node', node: commitNode(id, tag.trim(), parseGap(gap)), parent: parent(targetLane) },
        ...(latest !== undefined ? [{ type: 'add-relation' as const, from: latest.id, to: id, opts: { kind: 'commit' } }] : []),
      ],
    });
    setTag('');
    setGap('0');
    onSelect(id);
  };

  const branchInto = () => {
    const lane = branchLane !== '' ? branchLane : otherLanes[0]?.id;
    if (selected === undefined || lane === undefined) return;
    const id = nextCommitId(model, lane);
    onCommand({
      type: 'batch',
      commands: [
        { type: 'add-node', node: commitNode(id, '', 0), parent: parent(lane) },
        { type: 'add-relation', from: selected.id, to: id, opts: { kind: 'branch' } },
      ],
    });
    // The commit just created is on `lane`; once onSelect below moves the
    // selection there, `lane` becomes that commit's OWN branch and must drop
    // out of `otherLanes` — an un-reset choice would silently re-target it on
    // the very next click.
    setBranchLane('');
    onSelect(id);
  };

  const mergeInto = () => {
    const lane = mergeLane !== '' ? mergeLane : otherLanes[0]?.id;
    if (selected === undefined || lane === undefined) return;
    const id = nextCommitId(model, lane);
    const latest = latestCommit(g, lane);
    onCommand({
      type: 'batch',
      commands: [
        { type: 'add-node', node: commitNode(id, mergeTag.trim(), 0), parent: parent(lane) },
        { type: 'add-relation', from: selected.id, to: id, opts: { kind: 'merge' } },
        ...(latest !== undefined ? [{ type: 'add-relation' as const, from: latest.id, to: id, opts: { kind: 'commit' } }] : []),
      ],
    });
    setMergeTag('');
    // Same staleness as branchInto: the new commit lives on `lane`, and the
    // selection is about to move there.
    setMergeLane('');
    onSelect(id);
  };

  const setSelectedGap = (raw: string) => {
    if (selected === undefined) return;
    const { gap: _drop, ...rest } = selected.metadata ?? {};
    const n = parseGap(raw);
    const metadata = n > 0 ? { ...rest, gap: n } : rest;
    onCommand({ type: 'set-node-details', id: selected.id, details: { metadata: Object.keys(metadata).length > 0 ? metadata : null } });
  };

  return (
    <aside className="sidebar git-panel" aria-label="Git graph">
      <div className="panel-head">
        <h2>Git</h2>
      </div>
      <section className="panel-section">
        <h3>Lanes</h3>
        {g.lanes.length === 0 ? <p className="lp-caption">No lanes yet</p> : null}
        <ul className="git-lanes">
          {g.lanes.map((l) => (
            <li key={l.id}>{l.node.name}</li>
          ))}
        </ul>
        <input aria-label="New lane name" value={laneName} onChange={(e) => setLaneName(e.target.value)} placeholder="Lane name" />
        <ColorRow label="Lane color" value={laneColor} onChange={setLaneColor} />
        <button type="button" className="chip" onClick={addLane} disabled={laneName.trim() === ''}>
          Add lane
        </button>
      </section>
      <section className="panel-section">
        <h3>Commit</h3>
        <select aria-label="Lane" value={targetLane} onChange={(e) => setCommitLane(e.target.value)}>
          {g.lanes.map((l) => (
            <option key={l.id} value={l.id}>
              {l.node.name}
            </option>
          ))}
        </select>
        <input aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag (optional)" />
        <input aria-label="Gap" type="number" min={0} step={1} value={gap} onChange={(e) => setGap(e.target.value)} />
        <button type="button" className="chip" onClick={addCommit} disabled={targetLane === ''}>
          Add commit
        </button>
      </section>
      {selected !== undefined && (
        <section className="panel-section">
          <h3>Selected commit{selected.name !== '' ? ` ${selected.name}` : ''}</h3>
          <select aria-label="Branch into lane" value={branchLane !== '' ? branchLane : (otherLanes[0]?.id ?? '')} onChange={(e) => setBranchLane(e.target.value)}>
            {otherLanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.node.name}
              </option>
            ))}
          </select>
          <button type="button" className="chip" onClick={branchInto} disabled={otherLanes.length === 0}>
            Branch
          </button>
          <select aria-label="Merge into lane" value={mergeLane !== '' ? mergeLane : (otherLanes[0]?.id ?? '')} onChange={(e) => setMergeLane(e.target.value)}>
            {otherLanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.node.name}
              </option>
            ))}
          </select>
          <input aria-label="Merge tag" value={mergeTag} onChange={(e) => setMergeTag(e.target.value)} placeholder="Tag (optional)" />
          <button type="button" className="chip" onClick={mergeInto} disabled={otherLanes.length === 0}>
            Merge
          </button>
          <label className="lp-check">
            Gap
            {/* uncontrolled (defaultValue) so typing doesn't fight the parent's
             * round-trip through the model; keyed on the commit so switching
             * selection remounts it instead of keeping the old commit's value */}
            <input
              key={selected.id}
              aria-label="Commit gap"
              type="number"
              min={0}
              step={1}
              defaultValue={String(parseGap(String(selected.metadata?.['gap'] ?? '0')))}
              onChange={(e) => setSelectedGap(e.target.value)}
            />
          </label>
        </section>
      )}
    </aside>
  );
}
