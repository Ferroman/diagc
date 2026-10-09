// The editor's command algebra: every edit is a command, applied to an immutable
// EditorState by the handler its `type` names. Adding a command means its union
// member and handler in model.ts, layout.ts or drawings.ts, the mutation it calls,
// and tests.
import type { DiagramModel, Drawings, LayoutOverlay } from '../types';
import { CommandError } from '../command-error';
import { defined } from '../util';
import { DRAWING_HANDLERS, type DrawingCommand } from './drawings';
import { LAYOUT_HANDLERS, type LayoutCommand } from './layout';
import { pruneEdgeLabels, pruneNotes } from './layout-pruning';
import { MODEL_HANDLERS, type ModelCommand } from './model';

export { emptyLayout, openingPins } from './layout';
export { withEdgeLabelPlacements, withUnfolded } from './layout-pruning';

export interface EditorState {
  model: DiagramModel;
  layout: LayoutOverlay;
  /** the freehand-drawings sidecar; emptyDrawings() when the diagram has none */
  drawings: Drawings;
}

/** What a command leaves behind. */
export interface CommandResult {
  state: EditorState;
  /** the relation an `add-relation` created (a batch's last one), so a connect
   * gesture can select the edge it drew */
  relationId?: string;
}

/** several commands as one step: applied in order, all or nothing, one undo entry */
export interface BatchCommand {
  type: 'batch';
  commands: EditorCommand[];
}

export type EditorCommand = ModelCommand | LayoutCommand | DrawingCommand | BatchCommand;

/** One handler per member of `C`, keyed by its `type`. A command without a
 * handler, or a handler for no command, does not compile. */
export type Handlers<C extends { type: string }> = {
  [K in C['type']]: (state: EditorState, command: Extract<C, { type: K }>) => CommandResult;
};

type AnyHandler = (state: EditorState, command: EditorCommand) => CommandResult;

// TypeScript cannot follow a lookup keyed by a command's `type` to the handler of
// that member, so the merged table is read as one handler type; the three typed
// tables are what pair each command with its handler.
const HANDLERS = { ...MODEL_HANDLERS, ...LAYOUT_HANDLERS, ...DRAWING_HANDLERS } as Record<string, AnyHandler>;

/**
 * Apply one command. Throws CommandError when the model cannot take it (an
 * unknown id, a cycle, an unknown command type); the input state is never
 * changed, so an editor undoes by keeping the state it had.
 */
export function applyCommand(state: EditorState, command: EditorCommand): CommandResult {
  if (command.type === 'batch') return applyBatch(state, command);
  // own keys only: a type such as 'toString' names no command
  const handler = Object.hasOwn(HANDLERS, command.type) ? HANDLERS[command.type] : undefined;
  if (handler === undefined) throw new CommandError(`Unknown command type '${command.type}'`);
  const result = handler(state, command);
  return Object.hasOwn(MODEL_HANDLERS, command.type) ? afterModelCommand(state.model, result) : result;
}

/**
 * Atomic by construction: members apply to a running copy, and a throw unwinds
 * before the caller sees anything. The last add-relation's id is surfaced as a
 * lone add-relation's would be, so a panel that ends a batch with a connect can
 * still select the edge.
 */
function applyBatch(state: EditorState, batch: BatchCommand): CommandResult {
  let next = state;
  let relationId: string | undefined;
  for (const command of batch.commands) {
    const result = applyCommand(next, command);
    next = result.state;
    relationId = result.relationId ?? relationId;
  }
  return { state: next, ...defined({ relationId }) };
}

/** A model command can leave label placements and note entries that no element
 * backs any more; drop them. Layout and drawing commands leave the model alone. */
function afterModelCommand(before: DiagramModel, result: CommandResult): CommandResult {
  const { model, layout } = result.state;
  const pruned = pruneNotes(pruneEdgeLabels(layout, before, model), before, model);
  return pruned === layout ? result : { ...result, state: { ...result.state, layout: pruned } };
}
