import type { CSSProperties, ReactElement } from 'react';
import type { NotationProfile } from '../notations';
import { isCausalGroup } from './node-look';
import { RoleChipMenu } from './RoleChipMenu';
import type { DiagramNodeData } from './DiagramNode';

/** The row of small markers in a group's header and beside a box's name: the
 * promoted and shared markers, the notation's chips (the plan's roles), and
 * the container controls — enter and fold, or a causal-loop group's
 * disclosure toggle. `focusId` is the selected element of a focus highlight:
 * the chip that stands for it is marked active. */
export function NodeChips({
  id,
  data,
  profile,
  focusId,
}: {
  id: string;
  data: DiagramNodeData;
  profile: NotationProfile;
  focusId: string | null;
}): ReactElement {
  // a lane copy's controls act on its zone (DiagramNodeData.modelId)
  const modelId = data.modelId ?? id;
  const isContainer = data.state !== 'leaf';
  const isCldGroup = isCausalGroup(data, profile);
  return (
    <span className="dg-badges">
      {data.promoted && (
        <span className="dg-badge" data-testid="promoted-marker" title="Promoted shared node">
          ▲
        </span>
      )}
      {data.sharedMembers.length > 0 && (
        <span
          className="dg-badge"
          data-testid="shared-badge"
          title={`Shared members: ${data.sharedMembers.join(', ')}`}
        >
          ⚭ {data.sharedMembers.length}
        </span>
      )}
      {data.chips?.map((chip) => {
        const chipClass = `dg-badge dg-role-chip${focusId !== null && chip.refId === focusId ? ' dg-role-chip-active' : ''}`;
        const key = `${chip.role}:${chip.refId}`;
        // Edit mode, where the notation's chips are roles: the chip opens a
        // menu instead of sitting inert.
        if (data.onSetRole !== undefined && profile.node?.roleChips === true) {
          return (
            <RoleChipMenu key={key} chip={chip} className={chipClass} zoneId={modelId} onSetRole={data.onSetRole} />
          );
        }
        return (
          <span
            key={key}
            className={chipClass}
            title={chip.title}
            style={chip.color !== undefined ? ({ '--dg-chip': chip.color } as CSSProperties) : undefined}
          >
            {chip.text}
          </span>
        );
      })}
      {data.actorEye !== undefined && <EyeChip modelId={modelId} label={data.label} eye={data.actorEye} />}
      {isContainer && !isCldGroup && data.onEnterNode !== undefined && (
        <button
          type="button"
          className="dg-enter"
          data-testid="enter-chip"
          title="Enter — zoom into this node as its own diagram"
          aria-label="Enter node"
          onClick={(e) => {
            e.stopPropagation();
            data.onEnterNode?.(modelId);
          }}
        >
          ⤢
        </button>
      )}
      {isContainer && !isCldGroup && data.neverFolds !== true && <FoldChip id={id} data={data} />}
      {isCldGroup && <FoldChip id={id} data={data} group />}
    </span>
  );
}

/** A plain fold toggle: the glyph says what the box IS (open/shut) and a click
 * flips it. The host is told the state to land in, because only the view knows
 * the current one — a container can be open through focus with no pin at all,
 * and a blind flip of the pin would then be a click that changes nothing. A
 * causal-loop group's is its disclosure toggle (`group`), worded for a group. */
export function FoldChip({ id, data, group = false }: { id: string; data: DiagramNodeData; group?: boolean }) {
  const expanded = data.state === 'expanded';
  const label = group ? (expanded ? 'Collapse group' : 'Expand group') : expanded ? 'Collapse' : 'Expand';
  return (
    <button
      type="button"
      className={group ? 'dg-disclose' : 'dg-fold'}
      data-testid={group ? 'disclose-chip' : 'fold-chip'}
      title={label}
      aria-label={label}
      aria-expanded={group ? undefined : expanded}
      onClick={(e) => {
        e.stopPropagation();
        data.onToggleExpand?.(data.modelId ?? id, expanded ? 'collapsed' : 'expanded');
      }}
    >
      {expanded ? '▾' : '▸'}
    </button>
  );
}

/** A roster card's show/hide toggle. It stops the press as well as the click,
 * so it neither selects the card nor starts a drag of it (the fold chip's rule). */
function EyeChip({
  modelId,
  label,
  eye,
}: {
  modelId: string;
  label: string;
  eye: NonNullable<DiagramNodeData['actorEye']>;
}) {
  const text = `${eye.hidden ? 'Show' : 'Hide'} ${label}`;
  return (
    <button
      type="button"
      className="dg-eye nodrag"
      data-testid="eye-chip"
      title={text}
      aria-label={text}
      aria-pressed={eye.hidden}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        eye.toggle(modelId);
      }}
    >
      {eye.hidden ? '◌' : '◉'}
    </button>
  );
}
