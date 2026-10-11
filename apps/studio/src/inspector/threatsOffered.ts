import type { DiagramModel, NotationId, Threat } from '@diagc/core/internal';
import { notationProfile } from '@diagc/renderer';

/** The element's threat register has an entry. */
export const carriesThreats = (element: { threats?: readonly Threat[] }): boolean => (element.threats?.length ?? 0) > 0;

/** Some node or relation carries a threat. `some` rather than threatRegister():
 * this runs on every render and only needs to know whether ONE threat exists,
 * not to build (and name) every row. */
export const anyCarriesThreats = (model: DiagramModel): boolean =>
  model.nodes.some(carriesThreats) || model.relations.some(carriesThreats);

/**
 * Whether the threat controls are offered: where the notation offers threats
 * (the renderer's `offersThreats`), and wherever a threat already exists —
 * `carried` — so turning the notation off strands none.
 */
export const threatsOffered = (notation: NotationId | undefined, carried: boolean): boolean =>
  notationProfile(notation).offersThreats === true || carried;
